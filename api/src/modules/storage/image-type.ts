/** Formatos aceptados para el logo del complejo (docs/18-storage.md). */
export const ALLOWED_LOGO_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export type LogoImageType = (typeof ALLOWED_LOGO_TYPES)[number];

export const LOGO_EXTENSION: Readonly<Record<LogoImageType, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * Tipo real del archivo según sus primeros bytes.
 *
 * No se mira el `mimetype` del multipart: ese header lo elige el cliente, así que una allowlist
 * sobre ese valor dejaría pasar cualquier cosa renombrada a `.png`. SVG no está en la lista a
 * propósito: es markup ejecutable servido desde el dominio del bucket (docs/18-storage.md).
 */
export function sniffImageType(buffer: Buffer): LogoImageType | null {
  if (buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}
