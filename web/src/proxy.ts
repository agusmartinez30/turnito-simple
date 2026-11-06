import { NextResponse, type NextRequest } from 'next/server';
import {
  ADMIN_PREFIX,
  OPEN_ROUTES,
  PUBLIC_ROUTES,
  safeNext,
  SESSION_COOKIE,
} from '@/lib/session-cookie';

/**
 * Protección de rutas (docs/01-auth.md). Solo verifica presencia de la cookie;
 * el JWT lo valida la API en cada request. En Next 16 `middleware.ts` pasó a llamarse `proxy.ts`.
 *
 * La web con sesión es el panel: `/` redirige a `/admin`. Si el usuario logueado no es admin,
 * `AdminGate` muestra el aviso; el proxy no mira el rol (docs/16-multi-complex.md).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
  const isOpen = OPEN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  // /app*: con o sin sesión, sin redirecciones (docs/10-public-request.md).
  if (isOpen) return NextResponse.next();

  if (pathname === '/') {
    return NextResponse.redirect(new URL(ADMIN_PREFIX, request.url));
  }

  if (isPublic) {
    if (hasSession) {
      const next = safeNext(request.nextUrl.searchParams.get('next'));
      return NextResponse.redirect(new URL(next, request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Todo salvo route handlers internos, assets de Next y archivos estáticos.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
