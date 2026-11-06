import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../../config/env.schema';
import type {
  IStorageProvider,
  PrivateBucket,
  UploadInput,
  UploadPrivateInput,
} from './storage-provider.interface';

/**
 * Origen ficticio de los objetos del stub. Es deliberadamente inalcanzable: en la web,
 * `ComplexMark` cae al ícono genérico si la imagen no carga, así que un entorno sin bucket real
 * degrada bien en vez de dejar un hueco.
 */
export const STUB_STORAGE_ORIGIN = 'https://storage.stub.local';

/**
 * Proveedor de desarrollo/tests: un Map en memoria, sin red y sin persistencia
 * (docs/18-storage.md). Los objetos se pierden al reiniciar el proceso.
 */
@Injectable()
export class StubStorageProvider implements IStorageProvider {
  private readonly objects = new Map<string, Buffer>();
  private readonly privateObjects = new Map<
    string,
    { body: Buffer; contentType: string }
  >();
  /** Bucket de comprobantes de pago: separado de `privateObjects` (DNI) para poder asertarlo. */
  private readonly paymentProofObjects = new Map<
    string,
    { body: Buffer; contentType: string }
  >();
  private readonly prefix: string;

  private privateStore(bucket: PrivateBucket) {
    return bucket === 'paymentProofs'
      ? this.paymentProofObjects
      : this.privateObjects;
  }

  constructor(config: ConfigService<Env, true>) {
    const bucket = config.get('SUPABASE_STORAGE_BUCKET', { infer: true });
    this.prefix = `${STUB_STORAGE_ORIGIN}/${bucket}/`;
  }

  upload({ key, body }: UploadInput): Promise<string> {
    this.objects.set(key, body);
    return Promise.resolve(`${this.prefix}${key}`);
  }

  remove(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  keyFromUrl(url: string): string | null {
    return url.startsWith(this.prefix) ? url.slice(this.prefix.length) : null;
  }

  uploadPrivate({
    key,
    body,
    contentType,
    bucket = 'documents',
  }: UploadPrivateInput): Promise<void> {
    this.privateStore(bucket).set(key, { body, contentType });
    return Promise.resolve();
  }

  /** Sin bucket real, la "URL firmada" es el archivo en línea: en dev las fotos se ven igual. */
  signedUrl(
    key: string,
    _expiresInSec?: number,
    bucket: PrivateBucket = 'documents',
  ): Promise<string> {
    const object = this.privateStore(bucket).get(key);
    return Promise.resolve(
      object
        ? `data:${object.contentType};base64,${object.body.toString('base64')}`
        : `${STUB_STORAGE_ORIGIN}/private/${key}`,
    );
  }

  removePrivate(
    key: string,
    bucket: PrivateBucket = 'documents',
  ): Promise<void> {
    this.privateStore(bucket).delete(key);
    return Promise.resolve();
  }

  /** Solo para tests: qué objetos del bucket de documentos (DNI) quedaron vivos. */
  privateKeys(): string[] {
    return [...this.privateObjects.keys()];
  }

  /** Solo para tests: qué comprobantes de pago quedaron vivos. */
  paymentProofKeys(): string[] {
    return [...this.paymentProofObjects.keys()];
  }

  /** Solo para tests: qué objetos quedaron vivos. */
  keys(): string[] {
    return [...this.objects.keys()];
  }
}
