/**
 * El accessToken vive en una cookie httpOnly (ver docs/01-auth.md).
 * El cliente lo obtiene del route handler `GET /api/auth/session` y lo cachea en memoria.
 */

let cachedToken: string | null = null;
let pending: Promise<string | null> | null = null;

export function setAccessToken(token: string): void {
  cachedToken = token;
}

export function clearAccessToken(): void {
  cachedToken = null;
  pending = null;
}

export async function getAccessToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  if (!pending) {
    pending = fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return null;
        const body = (await res.json()) as { accessToken?: string };
        cachedToken = body.accessToken ?? null;
        return cachedToken;
      })
      .catch(() => null)
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** Persiste el token en la cookie httpOnly vía route handler y lo deja en memoria. */
export async function persistSession(
  accessToken: string,
  expiresAt: string,
): Promise<void> {
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, expiresAt }),
  });
  if (!res.ok) throw new Error('No se pudo guardar la sesión');
  setAccessToken(accessToken);
}

/** Borra la cookie (best-effort) y el token en memoria. */
export async function dropSession(): Promise<void> {
  clearAccessToken();
  await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => undefined);
}
