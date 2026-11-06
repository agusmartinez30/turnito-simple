import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { Env } from '../../../config/env.schema';
import type {
  IStorageProvider,
  PrivateBucket,
  UploadInput,
  UploadPrivateInput,
} from './storage-provider.interface';

const REQUEST_TIMEOUT_MS = 10_000;

/** Un año, `immutable`: cada subida es una key nueva, así que el objeto nunca cambia. */
const CACHE_CONTROL = 'max-age=31536000';

const UPLOAD_FAILED_MESSAGE =
  'No pudimos guardar el archivo. Probá de nuevo en un momento.';

/**
 * Supabase Storage por su API REST, sin `@supabase/supabase-js` (docs/18-storage.md): son dos
 * llamadas HTTP y el SDK arrastra auth, postgrest y realtime para nada. La contrapartida es que
 * el contrato con el bucket es nuestro, y por eso `supabase.provider.spec.ts` fija la forma
 * exacta del request: un cambio de la API aparece como test en rojo y no como un 500 silencioso.
 */
@Injectable()
export class SupabaseStorageProvider implements IStorageProvider {
  private readonly logger = new Logger(SupabaseStorageProvider.name);
  private readonly origin: string;
  private readonly bucket: string;
  private readonly privateBucket: string;
  private readonly paymentProofsBucket: string;
  private readonly serviceKey: string;

  constructor(config: ConfigService<Env, true>) {
    // El superRefine de env.schema.ts garantiza que están cuando el proveedor es `supabase`.
    this.origin = (config.get('SUPABASE_URL', { infer: true }) ?? '').replace(
      /\/+$/,
      '',
    );
    this.serviceKey =
      config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }) ?? '';
    this.bucket = config.get('SUPABASE_STORAGE_BUCKET', { infer: true });
    this.privateBucket = config.get('SUPABASE_PRIVATE_BUCKET', {
      infer: true,
    });
    this.paymentProofsBucket = config.get('SUPABASE_PAYMENT_PROOFS_BUCKET', {
      infer: true,
    });
  }

  private privateBucketName(bucket: PrivateBucket): string {
    return bucket === 'paymentProofs'
      ? this.paymentProofsBucket
      : this.privateBucket;
  }

  private get publicPrefix(): string {
    return `${this.origin}/storage/v1/object/public/${this.bucket}/`;
  }

  private objectUrl(key: string, bucket = this.bucket): string {
    return `${this.origin}/storage/v1/object/${bucket}/${encodeURI(key)}`;
  }

  private get authHeaders() {
    return {
      Authorization: `Bearer ${this.serviceKey}`,
      apikey: this.serviceKey,
    };
  }

  async upload({ key, body, contentType }: UploadInput): Promise<string> {
    const res = await this.send('upload', key, this.objectUrl(key), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.serviceKey}`,
        apikey: this.serviceKey,
        'Content-Type': contentType,
        'Cache-Control': CACHE_CONTROL,
        'x-upsert': 'true',
      },
      // Cuerpo binario crudo: el endpoint acepta multipart o el archivo tal cual, y mandarlo
      // crudo evita volver a encodear lo que multer ya decodificó.
      body: new Uint8Array(body),
    });
    if (!res.ok) throw await this.fail('upload', key, res);
    return `${this.publicPrefix}${encodeURI(key)}`;
  }

  async remove(key: string): Promise<void> {
    const res = await this.send('remove', key, this.objectUrl(key), {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.serviceKey}`,
        apikey: this.serviceKey,
      },
    });
    // 404: el objeto ya no está, que es exactamente lo que queríamos.
    if (!res.ok && res.status !== 404)
      throw await this.fail('remove', key, res);
  }

  async uploadPrivate({
    key,
    body,
    contentType,
    bucket = 'documents',
  }: UploadPrivateInput): Promise<void> {
    const res = await this.send(
      'uploadPrivate',
      key,
      this.objectUrl(key, this.privateBucketName(bucket)),
      {
        method: 'POST',
        // Sin Cache-Control largo: son documentos personales, no assets.
        headers: {
          ...this.authHeaders,
          'Content-Type': contentType,
          'x-upsert': 'true',
        },
        body: new Uint8Array(body),
      },
    );
    if (!res.ok) throw await this.fail('uploadPrivate', key, res);
  }

  async signedUrl(
    key: string,
    expiresInSec: number,
    bucket: PrivateBucket = 'documents',
  ): Promise<string> {
    const res = await this.send(
      'signedUrl',
      key,
      `${this.origin}/storage/v1/object/sign/${this.privateBucketName(bucket)}/${encodeURI(key)}`,
      {
        method: 'POST',
        headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: expiresInSec }),
      },
    );
    if (!res.ok) throw await this.fail('signedUrl', key, res);
    // Storage devuelve la ruta relativa a /storage/v1: `/object/sign/<bucket>/<key>?token=…`.
    const { signedURL } = (await res.json()) as { signedURL: string };
    return `${this.origin}/storage/v1${signedURL}`;
  }

  async removePrivate(
    key: string,
    bucket: PrivateBucket = 'documents',
  ): Promise<void> {
    const res = await this.send(
      'removePrivate',
      key,
      this.objectUrl(key, this.privateBucketName(bucket)),
      { method: 'DELETE', headers: this.authHeaders },
    );
    if (!res.ok && res.status !== 404)
      throw await this.fail('removePrivate', key, res);
  }

  keyFromUrl(url: string): string | null {
    return url.startsWith(this.publicPrefix)
      ? decodeURI(url.slice(this.publicPrefix.length))
      : null;
  }

  private async send(
    operation: string,
    key: string,
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(
        `Supabase Storage ${operation} ${key}: ${String(error)}`,
      );
      throw new AppException(
        ErrorCode.LOGO_UPLOAD_FAILED,
        UPLOAD_FAILED_MESSAGE,
      );
    }
  }

  private async fail(
    operation: string,
    key: string,
    res: Response,
  ): Promise<AppException> {
    const body = await res.text().catch(() => '');
    this.logger.error(
      `Supabase Storage ${operation} ${key} → ${res.status}: ${body}`,
    );
    return new AppException(
      ErrorCode.LOGO_UPLOAD_FAILED,
      UPLOAD_FAILED_MESSAGE,
    );
  }
}
