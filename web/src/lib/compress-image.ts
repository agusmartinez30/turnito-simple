/**
 * Achica una foto en el navegador antes de subirla (lado mayor ≤ `maxSide`, JPEG). Una foto de
 * celular pesa 3–6 MB; así el DNI sube en segundos con datos móviles. Si el navegador no puede
 * decodificarla (p. ej. HEIC en Chrome), devuelve el archivo original: la API también lo acepta.
 */
export async function compressImage(
  file: File,
  { maxSide = 1600, quality = 0.85 } = {},
): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  // Si por algún motivo quedó más pesada (una PNG chica), se manda la original.
  return blob && blob.size < file.size ? blob : file;
}
