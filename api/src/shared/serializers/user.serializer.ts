import { User, UserRole } from '@prisma/client';

/** Forma exacta del contrato `User` (web/docs/01-auth.md). Nunca `passwordHash`. */
export interface UserResponse {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  /** Complejo que administra; null para jugadores (docs/15-multi-complex.md). */
  complexId: string | null;
}

/** Acepta el User completo o el subconjunto que devuelve UsersService.search. */
export function toUserResponse(
  user: Pick<User, 'id' | 'name' | 'email' | 'phone' | 'role' | 'complexId'>,
): UserResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    ...(user.phone ? { phone: user.phone } : {}),
    role: user.role,
    complexId: user.complexId,
  };
}

/** Usuario de la sesión (login, register, me). */
export type SessionUserResponse = UserResponse;

export function toSessionUserResponse(
  user: Parameters<typeof toUserResponse>[0],
): SessionUserResponse {
  return toUserResponse(user);
}
