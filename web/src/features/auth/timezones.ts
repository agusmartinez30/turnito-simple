/**
 * Zonas horarias que ofrece el alta de complejo (docs/16-multi-complex.md). Lista curada de
 * Latinoamérica: `Intl.supportedValuesOf('timeZone')` omite alias como
 * `America/Argentina/Buenos_Aires` y difiere entre navegadores. La API acepta cualquier ID IANA.
 */
export const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';

export const TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
  [
    {
      value: 'America/Argentina/Buenos_Aires',
      label: 'Argentina (Buenos Aires)',
    },
    { value: 'America/Argentina/Cordoba', label: 'Argentina (Córdoba)' },
    { value: 'America/Argentina/Mendoza', label: 'Argentina (Mendoza)' },
    { value: 'America/Argentina/Salta', label: 'Argentina (Salta)' },
    { value: 'America/Argentina/Tucuman', label: 'Argentina (Tucumán)' },
    { value: 'America/Argentina/Ushuaia', label: 'Argentina (Ushuaia)' },
    { value: 'America/Montevideo', label: 'Uruguay' },
    { value: 'America/Asuncion', label: 'Paraguay' },
    { value: 'America/Santiago', label: 'Chile' },
    { value: 'America/La_Paz', label: 'Bolivia' },
    { value: 'America/Lima', label: 'Perú' },
    { value: 'America/Guayaquil', label: 'Ecuador' },
    { value: 'America/Bogota', label: 'Colombia' },
    { value: 'America/Caracas', label: 'Venezuela' },
    { value: 'America/Sao_Paulo', label: 'Brasil (São Paulo)' },
    { value: 'America/Mexico_City', label: 'México (Ciudad de México)' },
    { value: 'America/Panama', label: 'Panamá' },
    { value: 'America/Costa_Rica', label: 'Costa Rica' },
    { value: 'America/Guatemala', label: 'Guatemala' },
    { value: 'America/Santo_Domingo', label: 'República Dominicana' },
    { value: 'Europe/Madrid', label: 'España' },
  ];

export const TIMEZONE_ITEMS = Object.fromEntries(
  TIMEZONE_OPTIONS.map((t) => [t.value, t.label]),
) as Record<string, string>;
