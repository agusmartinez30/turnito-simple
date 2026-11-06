import { isApiError } from '@/lib/api/errors';

/** `true` si el error trae `details` por campo, o sea si el form ya lo va a mostrar. */
export function isValidationError(error: unknown): boolean {
  return isApiError(error) && error.code === 'VALIDATION_ERROR';
}

/**
 * Vuelca los `details` de un `VALIDATION_ERROR` sobre los campos del form. Filtra por `fields`
 * porque la API puede nombrar un campo que esta card no muestra (por ejemplo `_`), y un
 * `setError` sobre un campo inexistente deja un error que nadie puede limpiar.
 */
export function applyApiFieldErrors(
  error: unknown,
  fields: ReadonlySet<string>,
  setError: (name: string, error: { message: string }) => void,
): void {
  if (!isApiError(error) || error.code !== 'VALIDATION_ERROR') return;
  for (const [field, messages] of Object.entries(error.details ?? {})) {
    const message = messages[0];
    if (message && fields.has(field)) setError(field, { message });
  }
}
