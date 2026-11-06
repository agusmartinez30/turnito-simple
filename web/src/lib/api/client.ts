import { toast } from 'sonner';
import type { ApiErrorBody } from '@/types';
import { ApiError } from './errors';
import { dropSession, getAccessToken } from './session-token';

/** También la usa el layout de /app/[slug], que resuelve los colores del complejo en el server. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export const SESSION_EXPIRED_MESSAGE = 'Tu sesión expiró';

type Query = Record<string, string | number | boolean | undefined>;

interface RequestOptions {
  body?: unknown;
  query?: Query;
  /** Si es `false`, no se agrega `Authorization` (login / register). */
  auth?: boolean;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

let redirectingToLogin = false;

/** 401 en cualquier request: limpiar sesión y volver al login con `next` (docs/01-auth.md). */
async function handleUnauthorized(): Promise<void> {
  if (redirectingToLogin || typeof window === 'undefined') return;
  redirectingToLogin = true;
  await dropSession();
  toast.error(SESSION_EXPIRED_MESSAGE);
  const next = window.location.pathname + window.location.search;
  // Navegación completa a propósito: descarta todo el estado en memoria (cache de queries incluido).
  // `expired=1` hace que /login repita el aviso, porque el toast no sobrevive a la recarga.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(next)}&expired=1`);
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  { body, query, auth = true }: RequestOptions = {},
): Promise<T> {
  // Con FormData no se setea Content-Type: lo pone el browser, con el `boundary` que multer
  // necesita para parsear el multipart (docs/09-admin-settings.md § Logo).
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = {};
  if (body !== undefined && !isForm)
    headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body:
        body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw ApiError.network();
  }

  if (res.status === 204) return undefined as T;

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // Sin body (o body inválido): se decide solo por status.
  }

  if (!res.ok) {
    const errorBody = (json as ApiErrorBody | null)?.error ?? {
      code: 'INTERNAL_ERROR' as const,
      message: 'Ocurrió un error inesperado.',
    };
    if (res.status === 401 && auth) void handleUnauthorized();
    throw new ApiError(res.status, errorBody);
  }

  return (json as { data: T }).data;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('GET', path, options),
  post: <T>(path: string, options?: RequestOptions) =>
    request<T>('POST', path, options),
  put: <T>(path: string, options?: RequestOptions) =>
    request<T>('PUT', path, options),
  patch: <T>(path: string, options?: RequestOptions) =>
    request<T>('PATCH', path, options),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('DELETE', path, options),
};
