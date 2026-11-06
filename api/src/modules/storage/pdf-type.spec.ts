import { isPdf } from './pdf-type';

describe('isPdf', () => {
  it('accepts a buffer starting with the %PDF- signature', () => {
    expect(isPdf(Buffer.from('%PDF-1.7\n...'))).toBe(true);
    expect(isPdf(Buffer.from('%PDF-'))).toBe(true);
  });

  it('rejects other formats, even when renamed', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(isPdf(png)).toBe(false);
    expect(isPdf(Buffer.from('<html></html>'))).toBe(false);
  });

  it('rejects a signature that is not at offset 0', () => {
    expect(isPdf(Buffer.from(' %PDF-1.4'))).toBe(false);
  });

  it('rejects empty and too-short buffers', () => {
    expect(isPdf(Buffer.alloc(0))).toBe(false);
    expect(isPdf(Buffer.from('%PDF'))).toBe(false);
  });
});
