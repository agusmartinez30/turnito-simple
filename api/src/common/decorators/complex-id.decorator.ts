import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { AuthUser } from './current-user.decorator';

export const COMPLEX_REQUIRED_MESSAGE =
  'Tu cuenta no está asociada a un complejo.';

/**
 * Complejo del usuario autenticado (docs/15-multi-complex.md). En rutas con @Roles(ADMIN)
 * viene refrescado de la DB por RolesGuard. Sin complejo (jugador, token viejo) → 403.
 */
export const ComplexId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const complexId = req.user?.complexId;
    if (!complexId) {
      throw new AppException(ErrorCode.FORBIDDEN, COMPLEX_REQUIRED_MESSAGE);
    }
    return complexId;
  },
);
