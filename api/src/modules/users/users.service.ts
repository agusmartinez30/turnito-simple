import { Injectable } from '@nestjs/common';
import { Complex, User } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { UNAUTHORIZED_MESSAGE } from '../../common/errors/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';

/** Usuario más el estado de suspensión de su complejo (null si no tiene complejo). */
export type UserWithComplexState = User & {
  complex: Pick<Complex, 'suspendedAt'> | null;
};

/**
 * Cuentas de administrador. Sin controller: lo consumen AuthModule y RolesGuard, y el alta
 * vive en AuthService.register (crea complejo + admin). Quien reserva no es un User sino un
 * Customer, sin cuenta (docs/17-admin-customers.md).
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /**
   * Lanza 401 (no 404): un token válido de un usuario inexistente equivale a sesión inválida.
   * Trae `complex.suspendedAt` en la misma consulta para que RolesGuard no haga otra.
   */
  async findByIdOrThrow(id: string): Promise<UserWithComplexState> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { complex: { select: { suspendedAt: true } } },
    });
    if (!user)
      throw new AppException(ErrorCode.UNAUTHORIZED, UNAUTHORIZED_MESSAGE);
    return user;
  }
}
