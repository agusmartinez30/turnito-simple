'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { dropSession, persistSession } from '@/lib/api/session-token';
import { safeNext } from '@/lib/session-cookie';
import type { AuthResult, User } from '@/types';
import * as authApi from './api';

export const authKeys = {
  me: ['auth', 'me'] as const,
};

/** Hidrata `['auth','me']` cuando el usuario llega con cookie pero sin cache (recarga). */
export function useMe() {
  return useQuery<User>({
    queryKey: authKeys.me,
    queryFn: authApi.me,
    staleTime: 5 * 60 * 1000,
  });
}

/** Tras login/registro: guardar cookie, cachear user, ir a `?next=` o al panel. */
function useAfterAuth(next?: string) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return async (result: AuthResult) => {
    await persistSession(result.accessToken, result.expiresAt);
    queryClient.setQueryData<User>(authKeys.me, result.user);
    router.replace(safeNext(next));
  };
}

/** @param next ruta a la que volver tras loguearse (`?next=` de la URL). */
export function useLogin(next?: string) {
  const afterAuth = useAfterAuth(next);
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: afterAuth,
  });
}

export function useRegister(next?: string) {
  const afterAuth = useAfterAuth(next);
  return useMutation({
    mutationFn: authApi.register,
    onSuccess: afterAuth,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async () => {
      // Best-effort: si la API falla igual se cierra la sesión local.
      await authApi.logout().catch(() => undefined);
      await dropSession();
    },
    onSettled: () => {
      queryClient.clear();
      router.replace('/login');
      router.refresh();
    },
  });
}
