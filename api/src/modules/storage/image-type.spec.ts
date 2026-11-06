import { LOGO_EXTENSION, sniffImageType } from './image-type';

/** Cabeceras reales, rellenadas hasta los 12 bytes que pide el sniffer. */
const pad = (head: number[]): Buffer =>
  Buffer.concat([Buffer.from(head), Buffer.alloc(16)]);

const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.alloc(8),
]);
const WAVE = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WAVE', 'ascii'),
  Buffer.alloc(8),
]);
const GIF = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(16)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7', 'ascii'), Buffer.alloc(16)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

describe('sniffImageType', () => {
  it('reconoce los tres formatos permitidos', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(WEBP)).toBe('image/webp');
  });

  it('rechaza todo lo demás, incluido un SVG y un RIFF que no es WebP', () => {
    expect(sniffImageType(GIF)).toBeNull();
    expect(sniffImageType(PDF)).toBeNull();
    expect(sniffImageType(SVG)).toBeNull();
    expect(sniffImageType(WAVE)).toBeNull();
  });

  it('rechaza buffers demasiado cortos para tener una firma', () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e]))).toBeNull();
  });

  it('tiene una extensión para cada formato permitido', () => {
    expect(LOGO_EXTENSION[sniffImageType(PNG)!]).toBe('png');
    expect(LOGO_EXTENSION[sniffImageType(JPEG)!]).toBe('jpg');
    expect(LOGO_EXTENSION[sniffImageType(WEBP)!]).toBe('webp');
  });
});
