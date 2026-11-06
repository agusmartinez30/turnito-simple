import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { UsersService } from '../../modules/users/users.service';
import { AuthUser } from '../decorators/current-user.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

export const FORBIDDEN_ROLE_MESSAGE =
  'No tenés permisos para acceder a esta sección.';

/**
 * Guard global registrado después de JwtAuthGuard: `req.user` ya está resuelto.
 * Solo actúa sobre handlers/controllers con @Roles(). El rol se lee de la DB, no del token,
 * para que una degradación (admin:demote) aplique de inmediato (docs/05-admin-overview.md).
 * También refresca `complexId`: @ComplexId() siempre ve el complejo actual del admin.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    if (!req.user) {
      // @Roles sin JWT resuelto (p. ej. combinado con @Public) es un error de configuración, no del cliente.
      throw new AppException(
        ErrorCode.UNAUTHORIZED,
        'Tu sesión expiró. Volvé a ingresar.',
      );
    }

    const dbUser = await this.users.findByIdOrThrow(req.user.id);
    if (!required.includes(dbUser.role)) {
      throw new AppException(ErrorCode.FORBIDDEN, FORBIDDEN_ROLE_MESSAGE);
    }
    req.user.role = dbUser.role;
    req.user.complexId = dbUser.complexId;
    return true;
  }
}
