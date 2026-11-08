import { UserRole } from '@prisma/client';
import { ensureSuperAdmin } from './ensure-super-admin';

describe('ensureSuperAdmin', () => {
  const makePrisma = (existing: { id: string } | null) => {
    const findUnique = jest.fn().mockResolvedValue(existing);
    const create = jest.fn().mockResolvedValue({});
    return {
      prisma: { user: { findUnique, create } } as never,
      findUnique,
      create,
    };
  };

  it('skips when the env vars are missing', async () => {
    const { prisma, create } = makePrisma(null);
    await expect(ensureSuperAdmin(prisma, {})).resolves.toBe('skipped');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a short password', async () => {
    const { prisma } = makePrisma(null);
    await expect(
      ensureSuperAdmin(prisma, {
        SUPER_ADMIN_EMAIL: 'a@b.com',
        SUPER_ADMIN_PASSWORD: 'short',
      }),
    ).rejects.toThrow('at least 8');
  });

  it('creates a SUPER_ADMIN without complex when the email is free', async () => {
    const { prisma, findUnique, create } = makePrisma(null);
    await expect(
      ensureSuperAdmin(prisma, {
        SUPER_ADMIN_EMAIL: '  Root@Example.com ',
        SUPER_ADMIN_PASSWORD: 'long-enough-password',
      }),
    ).resolves.toBe('created');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'root@example.com' } }),
    );
    const data = (create.mock.calls[0][0] as { data: Record<string, unknown> })
      .data;
    expect(data).toMatchObject({
      email: 'root@example.com',
      role: UserRole.SUPER_ADMIN,
      complexId: null,
    });
    expect(data.passwordHash).not.toBe('long-enough-password');
  });

  it('never modifies an existing user', async () => {
    const { prisma, create } = makePrisma({ id: 'u1' });
    await expect(
      ensureSuperAdmin(prisma, {
        SUPER_ADMIN_EMAIL: 'root@example.com',
        SUPER_ADMIN_PASSWORD: 'long-enough-password',
      }),
    ).resolves.toBe('exists');
    expect(create).not.toHaveBeenCalled();
  });
});
