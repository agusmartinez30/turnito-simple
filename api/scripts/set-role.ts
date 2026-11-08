import { PrismaClient, UserRole } from '@prisma/client';

/**
 * Alta / baja de administradores sin endpoint (docs/05-admin-overview.md, docs/15-multi-complex.md).
 *
 *   pnpm admin:promote <email> <slug>   → role = ADMIN del complejo `slug`
 *   ts-node scripts/set-role.ts SUPER_ADMIN <email>  → role = SUPER_ADMIN, sin complejo (operador de la plataforma)
 *   pnpm admin:demote  <email>          → role = PLAYER, sin complejo (falla si es el último ADMIN de su complejo)
 *
 * Idempotente. Exit 1 con mensaje claro si el email o el complejo no existen o si se intenta
 * degradar al último admin. Promover a un admin de otro complejo lo mueve de complejo.
 */
export async function setRole(
  prisma: PrismaClient,
  email: string,
  role: UserRole,
  complexSlug?: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) throw new Error(`No existe un usuario con email ${normalized}`);

  if (role === UserRole.SUPER_ADMIN) {
    if (user.role === UserRole.SUPER_ADMIN) return;
    // Un ADMIN no puede quedar sin ADMIN: si era el último de su complejo, el complejo queda huérfano.
    if (user.role === UserRole.ADMIN) {
      const admins = await prisma.user.count({
        where: { role: UserRole.ADMIN, complexId: user.complexId },
      });
      if (admins <= 1) {
        throw new Error(
          `${normalized} es el único administrador de su complejo; promové a otro antes de convertirlo en SUPER_ADMIN`,
        );
      }
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { role: UserRole.SUPER_ADMIN, complexId: null },
    });
    return;
  }

  if (role === UserRole.ADMIN) {
    if (!complexSlug) {
      throw new Error(
        'Para promover a ADMIN hay que indicar el slug del complejo',
      );
    }
    const complex = await prisma.complex.findUnique({
      where: { slug: complexSlug },
    });
    if (!complex)
      throw new Error(`No existe un complejo con slug ${complexSlug}`);
    if (user.role === UserRole.ADMIN && user.complexId === complex.id) return;
    await prisma.user.update({
      where: { id: user.id },
      data: { role: UserRole.ADMIN, complexId: complex.id },
    });
    return;
  }

  if (user.role === UserRole.PLAYER) return;

  if (user.role === UserRole.SUPER_ADMIN) {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: UserRole.PLAYER, complexId: null },
    });
    return;
  }

  const admins = await prisma.user.count({
    where: { role: UserRole.ADMIN, complexId: user.complexId },
  });
  if (admins <= 1) {
    throw new Error(
      `${normalized} es el único administrador de su complejo; promové a otro antes de degradarlo`,
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: UserRole.PLAYER, complexId: null },
  });
}

if (require.main === module) {
  const [roleArg, email, slug] = process.argv.slice(2);
  const role =
    roleArg === 'ADMIN' || roleArg === 'PLAYER' || roleArg === 'SUPER_ADMIN'
      ? roleArg
      : undefined;
  if (!role || !email || (role === 'ADMIN' && !slug)) {
    console.error(
      'Uso: ts-node scripts/set-role.ts ADMIN <email> <complex-slug> | SUPER_ADMIN <email> | PLAYER <email>',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  setRole(prisma, email, role, slug)
    .then(() =>
      console.log(
        `OK ${email.trim().toLowerCase()} → ${role}${role === 'ADMIN' ? ` (${slug})` : ''}`,
      ),
    )
    .catch((err: Error) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
