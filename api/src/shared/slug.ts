/** Largo máximo del slug base; el sufijo `-N` puede excederlo. */
const MAX_SLUG_LENGTH = 60;
const FALLBACK_SLUG = 'complejo';

/**
 * Slug URL-safe derivado del nombre del complejo (docs/15-multi-complex.md):
 * sin diacríticos, minúsculas, `[a-z0-9]` separados por un solo guion.
 * "Complejo Ñandú – Norte!" → "complejo-nandu-norte". Vacío → "complejo".
 */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug || FALLBACK_SLUG;
}

/**
 * Primer slug libre para `base`: `base`, o `base-N` con N = mayor sufijo numérico en uso + 1
 * (arranca en 2). Se llama dentro de la transacción de alta; una carrera entre dos altas con el
 * mismo nombre la resuelve el unique (el caller reintenta). `listTaken` devuelve los slugs ya
 * tomados (el `base` y sus `base-N`); así el mismo helper sirve para complejos y torneos
 * (docs/22-tournaments.md), cada uno con su propio scope.
 */
export async function uniqueSlug(
  base: string,
  listTaken: () => Promise<string[]>,
): Promise<string> {
  const taken = await listTaken();
  if (!taken.some((slug) => slug === base)) return base;

  const suffixes = taken
    .map((slug) => slug.slice(base.length + 1))
    .filter((s) => /^\d+$/.test(s))
    .map(Number);
  const next = suffixes.length ? Math.max(...suffixes) + 1 : 2;
  return `${base}-${next}`;
}
