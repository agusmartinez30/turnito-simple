import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { Env } from '../../config/env.schema';

export interface JwtPayload {
  sub: string;
  email: string;
  /** Ausente en tokens emitidos antes de docs/05-admin.md: se tratan como PLAYER. */
  role?: UserRole;
  /** Ausente en tokens anteriores a docs/15-multi-complex.md. */
  complexId?: string | null;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
      algorithms: ['HS256'],
    });
  }

  /**
   * No va a la DB: rápido. Solo GET /auth/me relee el usuario.
   * Consecuencia: un cambio de `role` / `complexId` recién aplica cuando el usuario vuelve a loguearse
   * (salvo en rutas con @Roles, donde RolesGuard los refresca de la DB).
   */
  validate(payload: JwtPayload): AuthUser {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role ?? UserRole.PLAYER,
      complexId: payload.complexId ?? null,
    };
  }
}
