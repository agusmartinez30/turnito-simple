import { Injectable, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { isUniqueViolationOn } from '../../shared/prisma-errors';
import {
  SessionUserResponse,
  toSessionUserResponse,
} from '../../shared/serializers/user.serializer';
import { ComplexService } from '../complex/complex.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './jwt.strategy';
import { RegisterComplexDto } from './dto/register-complex.dto';

export interface AuthResult {
  accessToken: string;
  expiresAt: string; // ISO UTC (Z): dato técnico, no de negocio
  user: SessionUserResponse;
}

const EMAIL_EXISTS_MESSAGE = 'Ya existe una cuenta con este email.';
const INVALID_CREDENTIALS_MESSAGE = 'Email o contraseña incorrectos.';

/** Reintentos de la transacción de alta si otra alta simultánea tomó el mismo slug. */
const SLUG_RACE_RETRIES = 2;

@Injectable()
export class AuthService implements OnModuleInit {
  /** Hash contra el que se verifica cuando el email no existe (mismo costo → sin timing leak). */
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly complex: ComplexService,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await argon2.hash(
      'dummy-password-for-timing-equalization',
    );
  }

  /**
   * Alta de complejo + su primer admin en una transacción (docs/15-multi-complex.md).
   * El email se chequea antes para responder 409 sin hashear ni abrir la transacción.
   */
  async register(dto: RegisterComplexDto): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();

    if (await this.users.findByEmail(email)) {
      throw new AppException(
        ErrorCode.EMAIL_ALREADY_EXISTS,
        EMAIL_EXISTS_MESSAGE,
      );
    }

    const passwordHash = await argon2.hash(dto.password);

    for (let attempt = 0; ; attempt++) {
      try {
        const user = await this.prisma.$transaction(async (tx) => {
          const complex = await this.complex.create(
            {
              name: dto.complexName,
              address: dto.complexAddress,
              timezone: dto.timezone,
            },
            tx,
          );
          return tx.user.create({
            data: {
              name: dto.name,
              email,
              phone: dto.phone ?? null,
              passwordHash,
              role: UserRole.ADMIN,
              complexId: complex.id,
            },
          });
        });
        return await this.issueToken(user);
      } catch (err) {
        // Carrera entre dos registros simultáneos: el unique de email gana.
        if (isUniqueViolationOn(err, 'email')) {
          throw new AppException(
            ErrorCode.EMAIL_ALREADY_EXISTS,
            EMAIL_EXISTS_MESSAGE,
          );
        }
        // Dos altas con el mismo nombre calcularon el mismo slug: Postgres abortó la
        // transacción, se vuelve a correr entera (uniqueSlug ve el slug nuevo).
        if (isUniqueViolationOn(err, 'slug') && attempt < SLUG_RACE_RETRIES) {
          continue;
        }
        throw err;
      }
    }
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);

    // Se verifica siempre, exista o no el usuario, para que el tiempo de respuesta no lo revele.
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const valid = await argon2.verify(hash, dto.password);

    if (!user || !valid) {
      throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        INVALID_CREDENTIALS_MESSAGE,
      );
    }

    return this.issueToken(user);
  }

  private async issueToken(user: User): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      complexId: user.complexId,
    };
    const accessToken = await this.jwt.signAsync(payload);
    const decoded = this.jwt.decode<JwtPayload>(accessToken);
    if (!decoded?.exp) {
      throw new Error('El token firmado no tiene exp; revisar JWT_EXPIRES_IN');
    }
    return {
      accessToken,
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
      user: toSessionUserResponse(user),
    };
  }

  private async getDummyHash(): Promise<string> {
    if (!this.dummyHash) await this.onModuleInit();
    return this.dummyHash;
  }
}
