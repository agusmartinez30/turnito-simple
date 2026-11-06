import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('colapsa espacios, guiones y paréntesis al mismo valor', () => {
    const canonical = '+5491100000077';
    expect(normalizePhone('+5491100000077')).toBe(canonical);
    expect(normalizePhone('+54 9 11 0000 0077')).toBe(canonical);
    expect(normalizePhone('+54-9-11-0000-0077')).toBe(canonical);
    expect(normalizePhone('(54) 9 11 0000 0077')).toBe(canonical);
    expect(normalizePhone('5491100000077')).toBe(canonical);
  });

  it('es idempotente', () => {
    const once = normalizePhone('+54 9 11 0000 0077');
    expect(normalizePhone(once)).toBe(once);
  });

  it('no infiere el código de país: un número corto queda como otro cliente', () => {
    expect(normalizePhone('1100000077')).toBe('+1100000077');
    expect(normalizePhone('5491100000077')).not.toBe(
      normalizePhone('1100000077'),
    );
  });
});
