import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { UNAUTHORIZED_MESSAGE } from '../../common/errors/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';

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

  /** Lanza 401 (no 404): un token válido de un usuario inexistente equivale a sesión inválida. */
  async findByIdOrThrow(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user)
      throw new AppException(ErrorCode.UNAUTHORIZED, UNAUTHORIZED_MESSAGE);
    return user;
  }
}
