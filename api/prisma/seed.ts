import { CustomerSource, PrismaClient, Sport, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Datos del seed (ver docs/01-database.md). Idempotente: upsert por claves naturales.
 * Exportado como función para que test/setup.ts lo reutilice sin pasar por la CLI.
 */

export const SEED_COMPLEX = {
  slug: 'complejo-demo',
  name: 'Complejo Demo',
  address: 'Av. Siempreviva 742, Springfield',
  timezone: 'America/Argentina/Buenos_Aires',
  cancellationWindowHours: 24,
};

/** Segundo complejo: solo para verificar el aislamiento entre complejos (docs/15-multi-complex.md). */
export const SEED_COMPLEX_2 = {
  slug: 'complejo-sur',
  name: 'Complejo Sur',
  address: 'Calle Falsa 123, Shelbyville',
  timezone: 'America/Argentina/Buenos_Aires',
  cancellationWindowHours: 12,
};

export const SEED_COURTS = [
  {
    name: 'Pádel 1',
    sport: Sport.PADEL,
    surface: 'cemento',
    isIndoor: true,
    slotDurationMinutes: 90,
    openTime: '08:00',
    closeTime: '23:00',
    pricePerSlot: 12000,
    sortOrder: 1,
    isActive: true,
  },
  {
    name: 'Pádel 2',
    sport: Sport.PADEL,
    surface: 'cemento',
    isIndoor: true,
    slotDurationMinutes: 90,
    openTime: '08:00',
    closeTime: '23:00',
    pricePerSlot: 12000,
    sortOrder: 2,
    isActive: true,
  },
  {
    name: 'Pádel 3',
    sport: Sport.PADEL,
    surface: 'césped sintético',
    isIndoor: false,
    slotDurationMinutes: 90,
    openTime: '09:00',
    closeTime: '22:00',
    pricePerSlot: 10000,
    sortOrder: 3,
    isActive: true,
  },
  {
    name: 'Fútbol 5 A',
    sport: Sport.FOOTBALL_5,
    surface: 'césped sintético',
    isIndoor: false,
    slotDurationMinutes: 60,
    openTime: '10:00',
    closeTime: '23:00',
    pricePerSlot: 25000,
    sortOrder: 4,
    isActive: true,
  },
  {
    name: 'Fútbol 5 B',
    sport: Sport.FOOTBALL_5,
    surface: 'césped sintético',
    isIndoor: true,
    slotDurationMinutes: 60,
    openTime: '10:00',
    closeTime: '23:00',
    pricePerSlot: 28000,
    sortOrder: 5,
    isActive: true,
  },
  {
    name: 'Fútbol 7',
    sport: Sport.FOOTBALL_7,
    surface: 'césped sintético',
    isIndoor: false,
    slotDurationMinutes: 60,
    openTime: '10:00',
    closeTime: '23:00',
    pricePerSlot: 40000,
    sortOrder: 6,
    isActive: true,
  },
  {
    name: 'Tenis 1',
    sport: Sport.TENNIS,
    surface: 'polvo de ladrillo',
    isIndoor: false,
    slotDurationMinutes: 60,
    openTime: '08:00',
    closeTime: '21:00',
    pricePerSlot: 9000,
    sortOrder: 7,
    isActive: true,
  },
  {
    name: 'Cancha vieja',
    sport: Sport.PADEL,
    surface: 'cemento',
    isIndoor: false,
    slotDurationMinutes: 90,
    openTime: '08:00',
    closeTime: '23:00',
    pricePerSlot: 8000,
    sortOrder: 99,
    isActive: false,
  },
];

/** Canchas de Complejo Sur. Nombres distintos a las de Demo: los tests las buscan por nombre. */
export const SEED_COURTS_2 = [
  {
    name: 'Pádel Sur 1',
    sport: Sport.PADEL,
    surface: 'cemento',
    isIndoor: true,
    slotDurationMinutes: 90,
    openTime: '08:00',
    closeTime: '23:00',
    pricePerSlot: 11000,
    sortOrder: 1,
    isActive: true,
  },
  {
    name: 'Fútbol 5 Sur',
    sport: Sport.FOOTBALL_5,
    surface: 'césped sintético',
    isIndoor: false,
    slotDurationMinutes: 60,
    openTime: '20:00',
    closeTime: '01:00', // cierra al día siguiente: cancha trasnoche para los e2e
    pricePerSlot: 24000,
    sortOrder: 2,
    isActive: true,
  },
];

/**
 * Clientes demo (docs/17-admin-customers.md). No son cuentas: no tienen email ni contraseña.
 * El teléfono es su identidad dentro del complejo; "Mostrador" existe para el caso sin teléfono.
 */
export const SEED_CUSTOMERS = [
  {
    firstName: 'Ana',
    lastName: 'Jugadora',
    phone: '+5491100000001',
    source: CustomerSource.PUBLIC,
    complexSlug: SEED_COMPLEX.slug,
  },
  {
    firstName: 'Bruno',
    lastName: 'Jugador',
    phone: '+5491100000002',
    source: CustomerSource.ADMIN,
    complexSlug: SEED_COMPLEX.slug,
  },
  {
    firstName: 'Carlos',
    lastName: null,
    phone: null,
    source: CustomerSource.ADMIN,
    complexSlug: SEED_COMPLEX.slug,
  },
  {
    firstName: 'Delia',
    lastName: 'Sur',
    phone: '+5491100000003',
    source: CustomerSource.PUBLIC,
    complexSlug: SEED_COMPLEX_2.slug,
  },
];

export const SEED_PASSWORD = 'password123';

/** Cuentas. Los PLAYER ya no son clientes: quedan para verificar que el guard de rol los rechaza. */
export const SEED_USERS = [
  {
    name: 'Ana Jugadora',
    email: 'ana@demo.com',
    phone: '+5491100000001',
    role: UserRole.PLAYER,
    complexSlug: null,
  },
  {
    name: 'Bruno Jugador',
    email: 'bruno@demo.com',
    phone: null,
    role: UserRole.PLAYER,
    complexSlug: null,
  },
  {
    name: 'Admin Demo',
    email: 'admin@demo.com',
    phone: '+5491100000099',
    role: UserRole.ADMIN,
    complexSlug: SEED_COMPLEX.slug,
  },
  {
    name: 'Admin Sur',
    email: 'admin.sur@demo.com',
    phone: null,
    role: UserRole.ADMIN,
    complexSlug: SEED_COMPLEX_2.slug,
  },
];

export interface SeedOptions {
  /** Los usuarios demo solo se crean fuera de producción. */
  includeUsers?: boolean;
}

export async function seed(
  prisma: PrismaClient,
  options: SeedOptions = {},
): Promise<void> {
  const includeUsers =
    options.includeUsers ?? process.env.NODE_ENV !== 'production';

  for (const court of [...SEED_COURTS, ...SEED_COURTS_2]) {
    if (court.openTime === court.closeTime) {
      throw new Error(
        `Seed inválido: ${court.name} tiene openTime === closeTime`,
      );
    }
  }

  // Demo primero: es "el complejo" de todos los tests y docs anteriores a multi-complejo.
  const complex = await upsertComplex(prisma, SEED_COMPLEX, SEED_COURTS);
  const complex2 = await upsertComplex(prisma, SEED_COMPLEX_2, SEED_COURTS_2);
  const complexIdBySlug: Record<string, string> = {
    [complex.slug]: complex.id,
    [complex2.slug]: complex2.id,
  };

  // Los clientes sin teléfono no tienen clave natural: se los busca por nombre.
  for (const { complexSlug, ...customer } of SEED_CUSTOMERS) {
    const complexId = complexIdBySlug[complexSlug];
    const existing = customer.phone
      ? await prisma.customer.findUnique({
          where: { complexId_phone: { complexId, phone: customer.phone } },
        })
      : await prisma.customer.findFirst({
          where: { complexId, firstName: customer.firstName, phone: null },
        });
    if (existing) {
      await prisma.customer.update({
        where: { id: existing.id },
        data: customer,
      });
    } else {
      await prisma.customer.create({ data: { ...customer, complexId } });
    }
  }

  if (includeUsers) {
    const passwordHash = await argon2.hash(SEED_PASSWORD);
    for (const { complexSlug, ...user } of SEED_USERS) {
      const complexId = complexSlug ? complexIdBySlug[complexSlug] : null;
      await prisma.user.upsert({
        where: { email: user.email },
        update: {
          name: user.name,
          phone: user.phone,
          role: user.role,
          complexId,
        },
        create: { ...user, complexId, passwordHash },
      });
    }
  }
}

async function upsertComplex(
  prisma: PrismaClient,
  data: typeof SEED_COMPLEX,
  courts: typeof SEED_COURTS,
) {
  // Compat con DBs migradas desde single-tenant: el complejo existía sin slug y la
  // migración le asignó uno derivado del id. Se lo reemplaza por el del seed.
  const legacy = await prisma.complex.findFirst({
    where: { name: data.name, slug: { not: data.slug } },
  });
  const complex = legacy
    ? await prisma.complex.update({ where: { id: legacy.id }, data })
    : await prisma.complex.upsert({
        where: { slug: data.slug },
        update: data,
        create: data,
      });

  for (const court of courts) {
    await prisma.court.upsert({
      where: { complexId_name: { complexId: complex.id, name: court.name } },
      update: court,
      create: { ...court, complexId: complex.id },
    });
  }
  return complex;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seed(prisma)
    .then(async () => {
      const [complexes, courts, users, customers] = await Promise.all([
        prisma.complex.count(),
        prisma.court.count(),
        prisma.user.count(),
        prisma.customer.count(),
      ]);
      console.log(
        `Seed OK → ${complexes} complex, ${courts} courts, ${users} users, ${customers} customers`,
      );
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
