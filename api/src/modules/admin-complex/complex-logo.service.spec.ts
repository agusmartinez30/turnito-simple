import { Complex } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-codes';
import { complexFixture } from '../../shared/testing/fixtures';
import type {
  IStorageProvider,
  UploadInput,
} from '../storage/providers/storage-provider.interface';
import { ComplexService } from '../complex/complex.service';
import { ComplexLogoService } from './complex-logo.service';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);

const file = (buffer: Buffer): Express.Multer.File =>
  ({ buffer, fieldname: 'logo' }) as Express.Multer.File;

describe('ComplexLogoService', () => {
  let current: Complex;
  let service: ComplexLogoService;

  const update = jest.fn<
    Promise<Complex>,
    [string, { logoUrl?: string | null }]
  >();
  const upload = jest.fn<Promise<string>, [UploadInput]>();
  const remove = jest.fn<Promise<void>, [string]>();
  const keyFromUrl = jest.fn<string | null, [string]>();

  beforeEach(() => {
    jest.clearAllMocks();
    current = { ...complexFixture };

    update.mockImplementation((_id, data) => {
      current = { ...current, logoUrl: data.logoUrl ?? null };
      return Promise.resolve(current);
    });
    upload.mockResolvedValue('https://bucket/logo-new.png');
    remove.mockResolvedValue(undefined);
    keyFromUrl.mockImplementation((url) => url.split('/').pop() ?? null);

    const complex = {
      findByIdOrThrow: () => Promise.resolve(current),
      update,
    } as unknown as ComplexService;
    const storage = {
      upload,
      remove,
      keyFromUrl,
    } as unknown as IStorageProvider;

    service = new ComplexLogoService(complex, storage);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  it('guarda la URL nueva y borra el objeto anterior', async () => {
    current = { ...current, logoUrl: 'https://bucket/logo-old.png' };

    const updated = await service.replace('c1', file(PNG));

    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ body: PNG, contentType: 'image/png' }),
    );
    expect(updated.logoUrl).toBe('https://bucket/logo-new.png');
    expect(remove).toHaveBeenCalledWith('logo-old.png');
  });

  it('la key lleva el complejo y un sufijo al azar, para no pelear con el cache del CDN', async () => {
    await service.replace('c1', file(PNG));
    await service.replace('c1', file(PNG));

    const keys = upload.mock.calls.map(([input]) => input.key);
    expect(keys[0]).toMatch(/^complexes\/c1\/logo-[0-9a-f]{8}\.png$/);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('sin archivo o con un formato no permitido no sube nada', async () => {
    await expect(service.replace('c1', undefined)).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      details: { logo: ['Elegí un archivo'] },
    });
    await expect(
      service.replace('c1', file(Buffer.from('<svg></svg>'))),
    ).rejects.toMatchObject({ code: ErrorCode.UNSUPPORTED_FILE_TYPE });

    expect(upload).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('un fallo al borrar el objeto viejo no rompe una subida que ya salió bien', async () => {
    current = { ...current, logoUrl: 'https://bucket/logo-old.png' };
    remove.mockRejectedValue(new Error('boom'));

    await expect(service.replace('c1', file(PNG))).resolves.toMatchObject({
      logoUrl: 'https://bucket/logo-new.png',
    });
  });

  it('quitar el logo lo borra del bucket; sin logo es un no-op', async () => {
    current = { ...current, logoUrl: 'https://bucket/logo-old.png' };
    expect((await service.remove('c1')).logoUrl).toBeNull();
    expect(remove).toHaveBeenCalledWith('logo-old.png');

    remove.mockClear();
    update.mockClear();
    expect((await service.remove('c1')).logoUrl).toBeNull();
    expect(remove).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('una URL que no es del bucket no se intenta borrar', async () => {
    current = { ...current, logoUrl: 'https://evil.example/x.png' };
    keyFromUrl.mockReturnValue(null);

    await service.remove('c1');

    expect(remove).not.toHaveBeenCalled();
  });
});
