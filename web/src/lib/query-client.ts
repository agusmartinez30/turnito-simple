import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './api/errors';

/** Un solo reintento, y nunca en errores 4xx (son definitivos: 401, 404, 409…). */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (isApiError(error) && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 1;
        },
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
