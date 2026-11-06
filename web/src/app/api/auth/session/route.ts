import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session-cookie';

/**
 * Route handler interno (mismo origen) que administra la cookie httpOnly de sesión.
 * Ver docs/01-auth.md › Estrategia de sesión.
 */

/** Devuelve el accessToken al cliente para que lo use como Bearer contra la API. */
export async function GET() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: 'No session' }, { status: 401 });
  }
  return NextResponse.json(
    { accessToken: token },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

interface SetSessionBody {
  accessToken?: unknown;
  expiresAt?: unknown;
}

export async function POST(request: Request) {
  let body: SetSessionBody;
  try {
    body = (await request.json()) as SetSessionBody;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { accessToken, expiresAt } = body;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    return NextResponse.json(
      { error: 'accessToken required' },
      { status: 400 },
    );
  }

  const expires =
    typeof expiresAt === 'string' && !Number.isNaN(Date.parse(expiresAt))
      ? new Date(expiresAt)
      : undefined;

  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: accessToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  });

  return new NextResponse(null, { status: 204 });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return new NextResponse(null, { status: 204 });
}
