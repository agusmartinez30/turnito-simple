import { ConfigService } from '@nestjs/config';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { Env } from '../../../config/env.schema';
import { SupabaseStorageProvider } from './supabase.provider';

const URL_BASE = 'https://abcdefgh.supabase.co';
const KEY = 'service-role-key';
const BUCKET = 'complex-logos';
const PRIVATE_BUCKET = 'private-documents';
const PROOFS_BUCKET = 'payment-proofs';

const config = {
  get: (name: keyof Env) =>
    ({
      SUPABASE_URL: `${URL_BASE}/`, // con barra final a propósito: se normaliza
      SUPABASE_SERVICE_ROLE_KEY: KEY,
      SUPABASE_STORAGE_BUCKET: BUCKET,
      SUPABASE_PRIVATE_BUCKET: PRIVATE_BUCKET,
      SUPABASE_PAYMENT_PROOFS_BUCKET: PROOFS_BUCKET,
    })[name as string],
} as unknown as ConfigService<Env, true>;

const ok = (status = 200) =>
  ({ ok: status < 400, status, text: () => Promise.resolve('') }) as Response;

const fail = (status: number, body = 'boom') =>
  ({ ok: false, status, text: () => Promise.resolve(body) }) as Response;

describe('SupabaseStorageProvider', () => {
  let provider: SupabaseStorageProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    provider = new SupabaseStorageProvider(config);
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    jest.spyOn(provider['logger'], 'error').mockImplementation(() => undefined);
  });

  const body = Buffer.from([1, 2, 3]);
  const key = 'complexes/c1/logo-1a2b3c4d.png';

  it('sube con el método, la URL y los headers que espera Storage', async () => {
    fetchMock.mockResolvedValue(ok());

    const url = await provider.upload({ key, body, contentType: 'image/png' });

    expect(url).toBe(`${URL_BASE}/storage/v1/object/public/${BUCKET}/${key}`);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(`${URL_BASE}/storage/v1/object/${BUCKET}/${key}`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: `Bearer ${KEY}`,
      apikey: KEY,
      'Content-Type': 'image/png',
      'Cache-Control': 'max-age=31536000',
      'x-upsert': 'true',
    });
    expect(Buffer.from(init.body as Uint8Array)).toEqual(body);
  });

  it('una respuesta de error del bucket es LOGO_UPLOAD_FAILED (502)', async () => {
    fetchMock.mockResolvedValue(fail(400));

    await expect(
      provider.upload({ key, body, contentType: 'image/png' }),
    ).rejects.toMatchObject({ code: ErrorCode.LOGO_UPLOAD_FAILED });
  });

  it('un fallo de red también es LOGO_UPLOAD_FAILED, no un 500', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));

    const error: unknown = await provider
      .upload({ key, body, contentType: 'image/png' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(ErrorCode.LOGO_UPLOAD_FAILED);
  });

  it('borra por DELETE y se traga el 404, pero no un 500', async () => {
    fetchMock.mockResolvedValue(ok(404));
    await expect(provider.remove(key)).resolves.toBeUndefined();
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(`${URL_BASE}/storage/v1/object/${BUCKET}/${key}`);
    expect(init.method).toBe('DELETE');

    fetchMock.mockResolvedValue(fail(500));
    await expect(provider.remove(key)).rejects.toMatchObject({
      code: ErrorCode.LOGO_UPLOAD_FAILED,
    });
  });

  it('keyFromUrl hace round-trip con su propia salida y descarta URLs ajenas', async () => {
    fetchMock.mockResolvedValue(ok());
    const url = await provider.upload({ key, body, contentType: 'image/png' });

    expect(provider.keyFromUrl(url)).toBe(key);
    expect(provider.keyFromUrl('https://evil.example/logo.png')).toBeNull();
    expect(
      provider.keyFromUrl(`${URL_BASE}/storage/v1/object/public/otro/${key}`),
    ).toBeNull();
  });

  describe('bucket privado', () => {
    const dni = 'tournaments/t1/teams/tm1/dni/p1-front-ab12.jpg';

    it('sube al bucket privado sin cache largo y no devuelve URL pública', async () => {
      fetchMock.mockResolvedValue(ok());
      await expect(
        provider.uploadPrivate({ key: dni, body, contentType: 'image/jpeg' }),
      ).resolves.toBeUndefined();
      const [calledUrl, init] = fetchMock.mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(calledUrl).toBe(
        `${URL_BASE}/storage/v1/object/${PRIVATE_BUCKET}/${dni}`,
      );
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({
        Authorization: `Bearer ${KEY}`,
        apikey: KEY,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true',
      });
    });

    it('firma con POST /object/sign y arma la URL absoluta', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            signedURL: `/object/sign/${PRIVATE_BUCKET}/${dni}?token=abc`,
          }),
      });

      const url = await provider.signedUrl(dni, 600);

      expect(url).toBe(
        `${URL_BASE}/storage/v1/object/sign/${PRIVATE_BUCKET}/${dni}?token=abc`,
      );
      const [calledUrl, init] = fetchMock.mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(calledUrl).toBe(
        `${URL_BASE}/storage/v1/object/sign/${PRIVATE_BUCKET}/${dni}`,
      );
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ expiresIn: 600 });
    });

    it('borra del bucket privado y se traga el 404', async () => {
      fetchMock.mockResolvedValue(ok(404));
      await expect(provider.removePrivate(dni)).resolves.toBeUndefined();
      const [calledUrl] = fetchMock.mock.calls[0] as [string];
      expect(calledUrl).toBe(
        `${URL_BASE}/storage/v1/object/${PRIVATE_BUCKET}/${dni}`,
      );
    });
  });

  describe('bucket de comprobantes de pago', () => {
    const proof = 'payment-proofs/b1/aabbccdd11223344.pdf';

    it('sube al bucket payment-proofs, no al de documentos', async () => {
      fetchMock.mockResolvedValue(ok());
      await provider.uploadPrivate({
        key: proof,
        body,
        contentType: 'application/pdf',
        bucket: 'paymentProofs',
      });
      const [calledUrl, init] = fetchMock.mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(calledUrl).toBe(
        `${URL_BASE}/storage/v1/object/${PROOFS_BUCKET}/${proof}`,
      );
      expect(init.headers).toEqual({
        Authorization: `Bearer ${KEY}`,
        apikey: KEY,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
      });
    });

    it('firma contra el bucket payment-proofs', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            signedURL: `/object/sign/${PROOFS_BUCKET}/${proof}?token=abc`,
          }),
      });
      const url = await provider.signedUrl(proof, 600, 'paymentProofs');
      expect(url).toBe(
        `${URL_BASE}/storage/v1/object/sign/${PROOFS_BUCKET}/${proof}?token=abc`,
      );
      const [calledUrl] = fetchMock.mock.calls[0] as [string];
      expect(calledUrl).toBe(
        `${URL_BASE}/storage/v1/object/sign/${PROOFS_BUCKET}/${proof}`,
      );
    });

    it('borra del bucket payment-proofs y se traga el 404', async () => {
      fetchMock.mockResolvedValue(ok(404));
      await expect(
        provider.removePrivate(proof, 'paymentProofs'),
      ).resolves.toBeUndefined();
      const [calledUrl] = fetchMock.mock.calls[0] as [string];
      expect(calledUrl).toBe(
        `${URL_BASE}/storage/v1/object/${PROOFS_BUCKET}/${proof}`,
      );
    });
  });
});
