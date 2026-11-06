/** Nombre de la cookie httpOnly con el accessToken. Compartido por el route handler y el proxy. */
export const SESSION_COOKIE = 'session';

export const PUBLIC_ROUTES = ['/login', '/register'] as const;

/** Rutas abiertas: se sirven con o sin sesión, sin redirecciones (docs/10-public-request.md). */
export const OPEN_ROUTES = ['/app'] as const;

/** Prefijo del panel de administración; la web con sesión vive acá (docs/16-multi-complex.md). */
export const ADMIN_PREFIX = '/admin';

/** Sanitiza `?next=`: solo rutas internas absolutas, nunca URLs externas. Por defecto, el panel. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return ADMIN_PREFIX;
  }
  if ((PUBLIC_ROUTES as readonly string[]).some((r) => next.startsWith(r))) {
    return ADMIN_PREFIX;
  }
  if (next === '/') return ADMIN_PREFIX;
  return next;
}
