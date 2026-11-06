import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { UNAUTHORIZED_MESSAGE } from '../errors/http-exception.filter';

/** Guard global: todo endpoint requiere Bearer salvo que tenga @Public(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  // Token ausente, malformado, con firma inválida o vencido → 401 UNAUTHORIZED.
  override handleRequest<TUser>(err: unknown, user: TUser | false): TUser {
    if (err || !user) {
      throw new AppException(ErrorCode.UNAUTHORIZED, UNAUTHORIZED_MESSAGE);
    }
    return user;
  }
}
