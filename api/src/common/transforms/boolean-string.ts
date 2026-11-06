/**
 * Query params llegan como strings. Convierte 'true' | 'false' a boolean y deja
 * cualquier otro valor tal cual, que entonces falla `@IsBoolean()` → 400.
 */
export const booleanString = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};
