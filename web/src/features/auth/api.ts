import { api } from '@/lib/api/client';
import type { AuthResult, User } from '@/types';

export interface LoginPayload {
  email: string;
  password: string;
}

/** Alta de un complejo con su primer admin (docs/16-multi-complex.md). Plano: los `details` de la API son por campo. */
export interface RegisterPayload {
  complexName: string;
  complexAddress: string;
  timezone: string;
  name: string;
  email: string;
  phone?: string;
  password: string;
}

export function login(payload: LoginPayload): Promise<AuthResult> {
  return api.post<AuthResult>('/auth/login', { body: payload, auth: false });
}

export function register(payload: RegisterPayload): Promise<AuthResult> {
  return api.post<AuthResult>('/auth/register', {
    body: payload,
    auth: false,
  });
}

export function logout(): Promise<void> {
  return api.post<void>('/auth/logout');
}

export function me(): Promise<User> {
  return api.get<User>('/auth/me');
}
