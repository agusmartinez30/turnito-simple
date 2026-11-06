import { sniffImageType } from './image-type';
import { isPdf } from './pdf-type';

export type PaymentProofContentType =
  'application/pdf' | 'image/jpeg' | 'image/png';

export interface PaymentProofType {
  contentType: PaymentProofContentType;
  /** Canonical extension for the storage key (no dot). */
  extension: 'pdf' | 'jpg' | 'png';
}

const PDF: PaymentProofType = {
  contentType: 'application/pdf',
  extension: 'pdf',
};
const JPEG: PaymentProofType = { contentType: 'image/jpeg', extension: 'jpg' };
const PNG: PaymentProofType = { contentType: 'image/png', extension: 'png' };

/** Accepted filename extensions (lowercase) and the type each one claims. */
const BY_EXTENSION: Readonly<Record<string, PaymentProofType>> = {
  pdf: PDF,
  jpg: JPEG,
  jpeg: JPEG,
  png: PNG,
};

/**
 * Validates a payment proof upload by extension AND magic bytes (docs/18-storage.md).
 *
 * Returns the real type (to store with its canonical extension and content type) or `null` when
 * the extension is not allowed, the leading bytes are not a PDF/JPEG/PNG, or the two disagree.
 * The multipart `mimetype` is ignored: the client chooses it. WebP and SVG stay out on purpose.
 */
export function detectPaymentProofType(
  filename: string,
  buffer: Buffer,
): PaymentProofType | null {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  const claimed = match ? BY_EXTENSION[match[1].toLowerCase()] : undefined;
  if (!claimed) return null;

  const real = isPdf(buffer) ? PDF : sniffedImage(buffer);
  return real === claimed ? claimed : null;
}

function sniffedImage(buffer: Buffer): PaymentProofType | null {
  const type = sniffImageType(buffer);
  if (type === 'image/jpeg') return JPEG;
  if (type === 'image/png') return PNG;
  return null;
}
