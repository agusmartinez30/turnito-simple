const PDF_SIGNATURE = Buffer.from('%PDF-', 'ascii');

/**
 * True when the buffer starts with the `%PDF-` magic bytes.
 *
 * The filename extension and the multipart `mimetype` are chosen by the client, so they prove
 * nothing; only the leading bytes tell whether the upload is really a PDF (docs/18-storage.md).
 */
export function isPdf(buffer: Buffer): boolean {
  return (
    buffer.length >= PDF_SIGNATURE.length &&
    buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)
  );
}
