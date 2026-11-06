/** Token de DI del proveedor activo (elegido por STORAGE_PROVIDER). */
export const STORAGE_PROVIDER_TOKEN = Symbol('STORAGE_PROVIDER');

export interface UploadInput {
  /** Key dentro del bucket, ej. `complexes/<complexId>/logo-1a2b3c4d.png`. */
  key: string;
  body: Buffer;
  contentType: string;
}

/**
 * Bucket privado destino. `documents` (default) es el de los DNI (solo imágenes);
 * `paymentProofs` es el de los comprobantes de pago (PDF).
 */
export type PrivateBucket = 'documents' | 'paymentProofs';

export interface UploadPrivateInput extends UploadInput {
  /** Default: `documents`. */
  bucket?: PrivateBucket;
}

/**
 * Contrato del storage de archivos subidos (docs/18-storage.md). Los services dependen solo de
 * esto, nunca de Supabase: cambiar de proveedor es un archivo nuevo y una variable de entorno.
 */
export interface IStorageProvider {
  /** Sube (o pisa) el objeto y devuelve su URL pública absoluta. */
  upload(input: UploadInput): Promise<string>;
  /** Idempotente: borrar un objeto que ya no está no es un error. */
  remove(key: string): Promise<void>;
  /**
   * Key a partir de una URL pública que devolvió `upload`. `null` si la URL no es de este
   * bucket. Es lo que permite guardar una sola columna (`Complex.logoUrl`) y aun así poder
   * borrar el objeto anterior al reemplazarlo.
   */
  keyFromUrl(url: string): string | null;

  /**
   * Documentos privados (DNI): van a otro bucket, **no público**. No devuelve URL: se guarda
   * la key y se lee con `signedUrl`, que vence.
   */
  uploadPrivate(input: UploadPrivateInput): Promise<void>;
  /** URL de lectura temporal de un objeto privado (`expiresInSec` segundos). */
  signedUrl(
    key: string,
    expiresInSec: number,
    bucket?: PrivateBucket,
  ): Promise<string>;
  /** Idempotente, como `remove`. */
  removePrivate(key: string, bucket?: PrivateBucket): Promise<void>;
}
