import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';

/** Lo que JwtStrategy.validate deja en `req.user`. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  /** Complejo del admin (docs/15-multi-complex.md). null para PLAYER y para tokens anteriores. */
  complexId: string | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
    return req.user;
  },
);
