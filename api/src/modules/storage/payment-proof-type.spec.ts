import { detectPaymentProofType } from './payment-proof-type';

const PDF = Buffer.from('%PDF-1.7\n%%EOF');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex');
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBPVP8 '),
]);
const GIF = Buffer.from('GIF89a000000000000', 'ascii');

describe('detectPaymentProofType', () => {
  it.each([
    ['comprobante.pdf', PDF, 'application/pdf', 'pdf'],
    ['captura.png', PNG, 'image/png', 'png'],
    ['captura.jpg', JPEG, 'image/jpeg', 'jpg'],
    ['captura.jpeg', JPEG, 'image/jpeg', 'jpg'],
    ['CAPTURA.JPG', JPEG, 'image/jpeg', 'jpg'],
  ])('accepts %s and maps it to its real type', (name, body, mime, ext) => {
    expect(detectPaymentProofType(name, body)).toEqual({
      contentType: mime,
      extension: ext,
    });
  });

  it('rejects an extension that does not match the magic bytes', () => {
    expect(detectPaymentProofType('foto.png', JPEG)).toBeNull();
    expect(detectPaymentProofType('foto.jpg', PNG)).toBeNull();
    expect(detectPaymentProofType('foto.pdf', PNG)).toBeNull();
    expect(detectPaymentProofType('foto.png', PDF)).toBeNull();
  });

  it('rejects spoofed content behind an allowed extension', () => {
    const html = Buffer.from('<html>fake</html> padding');
    expect(detectPaymentProofType('a.png', html)).toBeNull();
    expect(detectPaymentProofType('a.jpg', html)).toBeNull();
    expect(detectPaymentProofType('a.pdf', html)).toBeNull();
  });

  it('rejects other types even with a matching extension (WebP, GIF)', () => {
    expect(detectPaymentProofType('a.webp', WEBP)).toBeNull();
    expect(detectPaymentProofType('a.png', WEBP)).toBeNull();
    expect(detectPaymentProofType('a.gif', GIF)).toBeNull();
  });

  it('rejects a missing or unknown extension', () => {
    expect(detectPaymentProofType('comprobante', PDF)).toBeNull();
    expect(detectPaymentProofType('a.pdf.exe', PDF)).toBeNull();
  });
});
