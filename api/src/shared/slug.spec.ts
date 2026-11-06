import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('quita diacríticos, pasa a minúsculas y separa con un solo guion', () => {
    expect(slugify('Complejo  Ñandú – Norte!')).toBe('complejo-nandu-norte');
    expect(slugify('  Club Río  ')).toBe('club-rio');
    expect(slugify('PÁDEL 360')).toBe('padel-360');
  });

  it('sin caracteres válidos → "complejo"', () => {
    expect(slugify('')).toBe('complejo');
    expect(slugify('¡¡¡ ---')).toBe('complejo');
  });

  it('recorta a 60 caracteres sin dejar guion final', () => {
    const long = `${'a'.repeat(59)} bbbb`;
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  const taken = (slugs: string[]) => () => Promise.resolve(slugs);

  it('base libre → base', async () => {
    expect(await uniqueSlug('club-rio', taken([]))).toBe('club-rio');
    // Prefijos con sufijo no numérico no cuentan como colisión de la base.
    expect(await uniqueSlug('club-rio', taken(['club-rio-norte']))).toBe(
      'club-rio',
    );
  });

  it('base tomada → sufijo siguiente al mayor numérico (arranca en 2)', async () => {
    expect(await uniqueSlug('x', taken(['x']))).toBe('x-2');
    expect(await uniqueSlug('x', taken(['x', 'x-2', 'x-7', 'x-abc']))).toBe(
      'x-8',
    );
  });
});
