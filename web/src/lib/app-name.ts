/**
 * Nombre del producto para pantallas sin sesión (login / alta de complejo) y como fallback
 * mientras carga `complex.name`. Es multi-complejo: acá nunca va el nombre de un complejo.
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Turnito Simple';
