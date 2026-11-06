import { Prisma } from '@prisma/client';

/**
 * Detección de violaciones de constraint (docs/04-bookings.md §"Detección de errores de constraint").
 *
 * Formas reales en Prisma 6.19 (capturadas contra Postgres 16, ver prisma-errors.spec.ts):
 * - Unique / índice único parcial → `PrismaClientKnownRequestError` con `code: 'P2002'` y
 *   `meta.target: ['court_id', 'starts_at']`. Prisma NO expone el nombre del índice, solo las columnas.
 * - Exclusion constraint → `PrismaClientUnknownRequestError` (sin `code`); el `message` crudo contiene
 *   `code: "23P01"` y `violates exclusion constraint "<nombre>"`.
 */

/** `true` si `e` es P2002 sobre exactamente ese conjunto de columnas (orden indistinto). */
export function isUniqueViolation(
  e: unknown,
  columns: readonly string[],
): boolean {
  if (
    !(e instanceof Prisma.PrismaClientKnownRequestError) ||
    e.code !== 'P2002'
  )
    return false;
  const target = (e.meta as { target?: unknown } | undefined)?.target;
  if (!Array.isArray(target)) return false;
  const actual = [...(target as string[])].sort();
  const expected = [...columns].sort();
  return (
    actual.length === expected.length &&
    actual.every((c, i) => c === expected[i])
  );
}

/** `true` si `e` es una violación de la exclusion constraint con ese nombre. */
export function isExclusionViolation(
  e: unknown,
  constraintName: string,
): boolean {
  if (!(e instanceof Error)) return false;
  const known = e as { code?: unknown };
  if (known.code === 'P2004' && e.message.includes(constraintName)) return true;
  // Las comillas llegan escapadas (\"nombre\") dentro del Debug de Rust: no se buscan comillas.
  return e.message.includes('23P01') && e.message.includes(constraintName);
}

/** `true` si `e` es P2002 y `column` está entre las columnas del unique violado (sin importar las demás). */
export function isUniqueViolationOn(e: unknown, column: string): boolean {
  if (
    !(e instanceof Prisma.PrismaClientKnownRequestError) ||
    e.code !== 'P2002'
  )
    return false;
  const target = (e.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) return (target as string[]).includes(column);
  return typeof target === 'string' && target.includes(column);
}
