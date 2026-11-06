import type { ApiErrorBody, ErrorCode } from '@/types';

export const NETWORK_ERROR_MESSAGE =
  'No pudimos conectar con el servidor. Intentá de nuevo.';

/** Error tipado que lanza el cliente HTTP a partir del envelope `{ error }` de la API. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.code = body.code;
    this.status = status;
    this.details = body.details;
  }

  static network(): ApiError {
    return new ApiError(0, {
      code: 'NETWORK_ERROR',
      message: NETWORK_ERROR_MESSAGE,
    });
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function hasErrorCode(err: unknown, code: ErrorCode): boolean {
  return isApiError(err) && err.code === code;
}

/** Mensaje mostrable para cualquier error (ApiError o desconocido). */
export function errorMessage(err: unknown): string {
  if (isApiError(err)) return err.message;
  return NETWORK_ERROR_MESSAGE;
}
