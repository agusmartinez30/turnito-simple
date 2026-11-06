import { Inject, Injectable, Logger } from '@nestjs/common';
import { Complex } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { LOGO_EXTENSION, sniffImageType } from '../storage/image-type';
import { STORAGE_PROVIDER_TOKEN } from '../storage/providers/storage-provider.interface';
import type { IStorageProvider } from '../storage/providers/storage-provider.interface';
import { ComplexService } from '../complex/complex.service';

/** 2 MB. Lo corta `limits.fileSize` de FileInterceptor antes de bufferear el archivo entero. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Nombre del campo del multipart. Coincide con lo que manda la web. */
export const LOGO_FIELD = 'logo';

/**
 * Logo del complejo (docs/08-admin-complex.md). Escribe siempre a través de
 * `ComplexService.update`, así el cache en memoria del complejo se invalida igual que con el
 * PATCH. Toda la validación vive acá: el endpoint no tiene DTO, así que el ValidationPipe global
 * no participa.
 */
@Injectable()
export class ComplexLogoService {
  private readonly logger = new Logger(ComplexLogoService.name);

  constructor(
    private readonly complex: ComplexService,
    @Inject(STORAGE_PROVIDER_TOKEN)
    private readonly storage: IStorageProvider,
  ) {}

  async replace(
    complexId: string,
    file?: Express.Multer.File,
  ): Promise<Complex> {
    if (!file?.buffer?.length) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Revisá los datos ingresados.',
        { [LOGO_FIELD]: ['Elegí un archivo'] },
      );
    }

    const type = sniffImageType(file.buffer);
    if (!type) {
      throw new AppException(
        ErrorCode.UNSUPPORTED_FILE_TYPE,
        'El logo tiene que ser un PNG, JPG o WebP.',
      );
    }

    const previous = (await this.complex.findByIdOrThrow(complexId)).logoUrl;
    // El sufijo al azar es el cache-busting: el CDN del bucket cachea por path y el objeto se
    // sirve `immutable`, así que cada subida tiene que ser una URL nueva.
    const key = `complexes/${complexId}/logo-${randomBytes(4).toString('hex')}.${LOGO_EXTENSION[type]}`;

    // Subir ANTES de tocar la DB: si el bucket falla, el complejo se queda con el logo que tenía.
    const url = await this.storage.upload({
      key,
      body: file.buffer,
      contentType: type,
    });
    const updated = await this.complex.update(complexId, { logoUrl: url });

    // Después del update y best-effort: un objeto huérfano es mucho mejor que devolverle un
    // error al admin por algo que ya salió bien.
    await this.removeQuietly(previous);
    return updated;
  }

  async remove(complexId: string): Promise<Complex> {
    const current = await this.complex.findByIdOrThrow(complexId);
    if (!current.logoUrl) return current; // Idempotente.

    const updated = await this.complex.update(complexId, { logoUrl: null });
    await this.removeQuietly(current.logoUrl);
    return updated;
  }

  private async removeQuietly(url: string | null): Promise<void> {
    if (!url) return;
    const key = this.storage.keyFromUrl(url);
    // URL de otro bucket o de otro proyecto: no es nuestra, no la tocamos.
    if (!key) return;
    try {
      await this.storage.remove(key);
    } catch (error) {
      this.logger.warn(`No se pudo borrar ${key}: ${String(error)}`);
    }
  }
}
