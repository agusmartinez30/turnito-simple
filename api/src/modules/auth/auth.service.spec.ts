import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { ComplexService } from '../complex/complex.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

// Los exports de argon2 no son reconfigurables (spyOn falla): se envuelve verify en un jest.fn real.
jest.mock('argon2', () => {
  const actual = jest.requireActual<typeof import('argon2')>('argon2');
  return { ...actual, verify: jest.fn(actual.verify) };
});
const verifyMock = argon2.verify as jest.MockedFunction<typeof argon2.verify>;

const SECRET = 'test-secret-test-secret-test-secret-test-secret';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Ana Jugadora',
    email: 'ana@demo.com',
    phone: null,
    passwordHash: '',
    role: 'PLAYER',
    complexId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let jwt: JwtService;
  let users: { findByEmail: jest.Mock; findByIdOrThrow: jest.Mock };
  let complex: { create: jest.Mock };
  let tx: { user: { create: jest.Mock } };
  let transaction: jest.Mock;

  beforeEach(async () => {
    users = { findByEmail: jest.fn(), findByIdOrThrow: jest.fn() };
    complex = {
      create: jest.fn().mockResolvedValue({ id: 'c-new', slug: 'club-rio' }),
    };
    tx = { user: { create: jest.fn() } };
    // $transaction real de Prisma: ejecuta el callback con el cliente transaccional.
    transaction = jest
      .fn()
      .mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: ComplexService, useValue: complex },
        { provide: PrismaService, useValue: { $transaction: transaction } },
        {
          provide: JwtService,
          useValue: new JwtService({
            secret: SECRET,
            signOptions: { expiresIn: '7d' },
          }),
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jwt = moduleRef.get(JwtService);
    await service.onModuleInit();
    verifyMock.mockClear();
  });

  describe('register', () => {
    const dto = {
      complexName: 'Club Río',
      complexAddress: 'Av. Costanera 1500',
      timezone: 'America/Argentina/Buenos_Aires',
      name: 'Carla',
      email: 'Carla@ClubRio.com',
      password: 'password123',
    };

    function slugConflict() {
      return new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test', meta: { target: ['slug'] } },
      );
    }

    it('con email existente → EMAIL_ALREADY_EXISTS sin abrir transacción', async () => {
      users.findByEmail.mockResolvedValue(makeUser());
      await expect(service.register(dto)).rejects.toMatchObject({
        code: ErrorCode.EMAIL_ALREADY_EXISTS,
      });
      expect(users.findByEmail).toHaveBeenCalledWith('carla@clubrio.com');
      expect(transaction).not.toHaveBeenCalled();
    });

    it('crea el complejo y su admin en la misma transacción; hashea la password; el token lleva complexId', async () => {
      users.findByEmail.mockResolvedValue(null);
      tx.user.create.mockImplementation(
        ({
          data,
        }: {
          data: { passwordHash: string; email: string; complexId: string };
        }) =>
          Promise.resolve(
            makeUser({
              name: 'Carla',
              email: data.email,
              passwordHash: data.passwordHash,
              role: 'ADMIN',
              complexId: data.complexId,
            }),
          ),
      );

      const result = await service.register(dto);

      expect(complex.create).toHaveBeenCalledWith(
        {
          name: 'Club Río',
          address: 'Av. Costanera 1500',
          timezone: 'America/Argentina/Buenos_Aires',
        },
        tx,
      );
      const { data } = tx.user.create.mock.calls[0][0] as {
        data: {
          passwordHash: string;
          email: string;
          role: string;
          complexId: string;
        };
      };
      expect(data).toMatchObject({
        email: 'carla@clubrio.com',
        role: 'ADMIN',
        complexId: 'c-new',
      });
      expect(data.passwordHash).not.toBe('password123');
      expect(data.passwordHash.startsWith('$argon2id$')).toBe(true);
      await expect(
        argon2.verify(data.passwordHash, 'password123'),
      ).resolves.toBe(true);

      const payload = jwt.verify<{
        sub: string;
        email: string;
        role: string;
        complexId: string;
        exp: number;
      }>(result.accessToken);
      expect(payload).toMatchObject({
        sub: makeUser().id,
        email: 'carla@clubrio.com',
        role: 'ADMIN',
        complexId: 'c-new',
      });
      expect(result.expiresAt).toBe(new Date(payload.exp * 1000).toISOString());
      expect(result.user).toEqual({
        id: makeUser().id,
        name: 'Carla',
        email: 'carla@clubrio.com',
        role: 'ADMIN',
        complexId: 'c-new',
      });
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('traduce P2002 sobre email (carrera) a EMAIL_ALREADY_EXISTS', async () => {
      users.findByEmail.mockResolvedValue(null);
      tx.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['email'] },
        }),
      );
      await expect(service.register(dto)).rejects.toMatchObject({
        code: ErrorCode.EMAIL_ALREADY_EXISTS,
      });
    });

    it('P2002 sobre slug (carrera) → reintenta la transacción entera', async () => {
      users.findByEmail.mockResolvedValue(null);
      complex.create
        .mockRejectedValueOnce(slugConflict())
        .mockResolvedValueOnce({ id: 'c-new', slug: 'club-rio-2' });
      tx.user.create.mockResolvedValue(
        makeUser({ role: 'ADMIN', complexId: 'c-new' }),
      );

      const result = await service.register(dto);
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(result.user.complexId).toBe('c-new');
    });

    it('P2002 sobre slug persistente → se propaga tras agotar los reintentos', async () => {
      users.findByEmail.mockResolvedValue(null);
      complex.create.mockRejectedValue(slugConflict());
      await expect(service.register(dto)).rejects.toBeInstanceOf(
        Prisma.PrismaClientKnownRequestError,
      );
      expect(transaction).toHaveBeenCalledTimes(3);
    });
  });

  describe('login', () => {
    it('con email inexistente → INVALID_CREDENTIALS y llama a argon2.verify igual', async () => {
      users.findByEmail.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nadie@demo.com', password: 'whatever' }),
      ).rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS });
      expect(verifyMock).toHaveBeenCalledTimes(1);
    });

    it('con password incorrecta → INVALID_CREDENTIALS', async () => {
      const passwordHash = await argon2.hash('password123');
      users.findByEmail.mockResolvedValue(makeUser({ passwordHash }));
      const err = await service
        .login({ email: 'ana@demo.com', password: 'wrong' })
        .catch((e) => e);
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.INVALID_CREDENTIALS);
      expect((err as AppException).message).toBe(
        'Email o contraseña incorrectos.',
      );
    });

    it('correcto → token cuyo sub es el id del usuario', async () => {
      const passwordHash = await argon2.hash('password123');
      const user = makeUser({ passwordHash, phone: '+5491100000001' });
      users.findByEmail.mockResolvedValue(user);

      const result = await service.login({
        email: 'ANA@demo.com ',
        password: 'password123',
      });

      const payload = jwt.verify<{ sub: string }>(result.accessToken);
      expect(payload.sub).toBe(user.id);
      expect(result.user).toEqual({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: '+5491100000001',
        role: 'PLAYER',
        complexId: null,
      });
    });
  });
});
