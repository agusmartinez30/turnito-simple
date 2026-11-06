import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { UsersService } from '../../modules/users/users.service';
import { RolesGuard } from './roles.guard';

function contextWith(user?: {
  id: string;
  email: string;
  role: 'PLAYER' | 'ADMIN';
}): ExecutionContext {
  const req = { user };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let users: { findByIdOrThrow: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    users = { findByIdOrThrow: jest.fn() };
    guard = new RolesGuard(
      reflector as unknown as Reflector,
      users as unknown as UsersService,
    );
  });

  it('sin @Roles → pasa sin consultar la DB', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(
      guard.canActivate(contextWith({ id: 'u1', email: 'a', role: 'PLAYER' })),
    ).resolves.toBe(true);
    expect(users.findByIdOrThrow).not.toHaveBeenCalled();
  });

  it('@Roles(ADMIN) + usuario ADMIN en DB → pasa y refresca req.user.role y complexId', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    users.findByIdOrThrow.mockResolvedValue({
      id: 'u1',
      role: 'ADMIN',
      complexId: 'c1',
    });
    const ctx = contextWith({ id: 'u1', email: 'a', role: 'PLAYER' }); // token viejo sin rol actualizado
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(
      ctx
        .switchToHttp()
        .getRequest<{ user: { role: string; complexId: string | null } }>()
        .user,
    ).toMatchObject({ role: 'ADMIN', complexId: 'c1' });
  });

  it('@Roles(ADMIN) + usuario PLAYER en DB → FORBIDDEN aunque el token diga ADMIN', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    users.findByIdOrThrow.mockResolvedValue({
      id: 'u1',
      role: 'PLAYER',
      complexId: null,
    });
    const err = await guard
      .canActivate(contextWith({ id: 'u1', email: 'a', role: 'ADMIN' }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).code).toBe(ErrorCode.FORBIDDEN);
    expect((err as AppException).message).toBe(
      'No tenés permisos para acceder a esta sección.',
    );
  });

  it('@Roles sin req.user (mal combinado con @Public) → UNAUTHORIZED', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    await expect(
      guard.canActivate(contextWith(undefined)),
    ).rejects.toMatchObject({ code: ErrorCode.UNAUTHORIZED });
  });

  it('usuario borrado → propaga el UNAUTHORIZED de UsersService', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    users.findByIdOrThrow.mockRejectedValue(
      new AppException(ErrorCode.UNAUTHORIZED, 'x'),
    );
    await expect(
      guard.canActivate(contextWith({ id: 'gone', email: 'a', role: 'ADMIN' })),
    ).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
    });
  });
});
