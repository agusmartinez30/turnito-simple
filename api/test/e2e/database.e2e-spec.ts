import { BookingStatus, Prisma } from '@prisma/client';
import { seed } from '../../prisma/seed';
import {
  createBooking,
  createCustomer,
  getComplex,
  getCourtByName,
} from '../factories';
import { prisma, resetDatabase } from '../setup';

/** Criterios de aceptación de docs/01-database.md: constraints manuales y seed. */
describe('Database constraints & seed', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it('el seed es idempotente: 2 complejos, 10 canchas, 5 usuarios, 4 clientes', async () => {
    await seed(prisma, { includeUsers: true });
    await seed(prisma, { includeUsers: true });
    expect(await prisma.complex.count()).toBe(2);
    expect(await prisma.court.count()).toBe(10);
    expect(await prisma.user.count()).toBe(5);
    expect(await prisma.customer.count()).toBe(4);
    expect(
      await prisma.user.count({
        where: { role: 'ADMIN', email: 'admin@demo.com' },
      }),
    ).toBe(1);
    const [demo, sur] = await Promise.all([
      prisma.complex.findUniqueOrThrow({ where: { slug: 'complejo-demo' } }),
      prisma.complex.findUniqueOrThrow({ where: { slug: 'complejo-sur' } }),
    ]);
    expect(await prisma.court.count({ where: { complexId: demo.id } })).toBe(8);
    expect(await prisma.court.count({ where: { complexId: sur.id } })).toBe(2);
    expect(
      await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@demo.com' },
      }),
    ).toMatchObject({ complexId: demo.id });
    expect(
      await prisma.user.findUniqueOrThrow({
        where: { email: 'admin.sur@demo.com' },
      }),
    ).toMatchObject({ complexId: sur.id });
    expect(
      await prisma.court.count({
        where: { isActive: false, name: 'Cancha vieja' },
      }),
    ).toBe(1);
  });

  it('resetDatabase deja la DB en el estado del seed rápido', async () => {
    const started = Date.now();
    await resetDatabase();
    expect(Date.now() - started).toBeLessThan(3000);
    expect(await prisma.booking.count()).toBe(0);
    expect(await prisma.user.count()).toBe(5);
    expect(await prisma.customer.count()).toBe(4);
  });

  describe('bookings_court_starts_at_confirmed_uidx', () => {
    const startsAt = new Date('2026-09-20T21:00:00.000Z');

    it('dos CONFIRMED con mismo (court_id, starts_at) → falla con violación del índice', async () => {
      const court = await getCourtByName('Pádel 1');
      const complexId = (await getComplex()).id;
      const [ana, bruno] = await Promise.all([
        createCustomer({ complexId }),
        createCustomer({ complexId }),
      ]);

      await createBooking({ courtId: court.id, customerId: ana.id, startsAt });
      const err = await createBooking({
        courtId: court.id,
        customerId: bruno.id,
        startsAt,
      }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((err as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
      // Prisma 6 no expone el nombre del índice en P2002: meta.target trae las columnas.
      // isUniqueViolation() (fase bookings) debe detectar por estas columnas.
      expect((err as Prisma.PrismaClientKnownRequestError).meta).toMatchObject({
        target: ['court_id', 'starts_at'],
      });
    });

    it('una CONFIRMED y una CANCELLED con mismo (court_id, starts_at) → funciona', async () => {
      const court = await getCourtByName('Pádel 2');
      const complexId = (await getComplex()).id;
      const [ana, bruno] = await Promise.all([
        createCustomer({ complexId }),
        createCustomer({ complexId }),
      ]);

      await createBooking({
        courtId: court.id,
        customerId: ana.id,
        startsAt,
        status: BookingStatus.CANCELLED,
      });
      await expect(
        createBooking({ courtId: court.id, customerId: bruno.id, startsAt }),
      ).resolves.toMatchObject({ status: 'CONFIRMED' });
    });
  });

  describe('customers_complex_id_phone_key', () => {
    it('dos clientes del mismo complejo con el mismo teléfono → falla con el unique', async () => {
      const complexId = (await getComplex()).id;
      const phone = '+5491100009999';
      await createCustomer({ complexId, phone });
      const err = await createCustomer({ complexId, phone }).catch(
        (e: unknown) => e,
      );

      expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((err as Prisma.PrismaClientKnownRequestError).meta).toMatchObject({
        target: ['complex_id', 'phone'],
      });
    });

    it('el mismo teléfono en otro complejo → funciona: la identidad es por complejo', async () => {
      const phone = '+5491100008888';
      const [demo, sur] = await Promise.all([
        getComplex(),
        getComplex('complejo-sur'),
      ]);
      await createCustomer({ complexId: demo.id, phone });
      await expect(
        createCustomer({ complexId: sur.id, phone }),
      ).resolves.toMatchObject({ phone });
    });

    it('varios clientes sin teléfono conviven: Postgres usa NULLS DISTINCT', async () => {
      const complexId = (await getComplex()).id;
      await createCustomer({ complexId, phone: null });
      await expect(
        createCustomer({ complexId, phone: null }),
      ).resolves.toMatchObject({ phone: null });
    });

    it('un teléfono sin canonizar → falla el CHECK de formato', async () => {
      const complexId = (await getComplex()).id;
      await expect(
        createCustomer({ complexId, phone: '11 0000-0077' }),
      ).rejects.toThrow(/customers_phone_fmt_chk/);
    });
  });

  describe('turnos superpuestos del mismo cliente', () => {
    it('dos canchas a la misma hora para el mismo cliente → permitido (ya no hay exclusion)', async () => {
      const [padel1, padel2] = await Promise.all([
        getCourtByName('Pádel 1'),
        getCourtByName('Pádel 2'),
      ]);
      const customer = await createCustomer({
        complexId: (await getComplex()).id,
      });
      const t18 = new Date('2026-09-21T21:00:00.000Z'); // 18:00 -03:00
      const t1830 = new Date('2026-09-21T21:30:00.000Z');

      await createBooking({
        courtId: padel1.id,
        customerId: customer.id,
        startsAt: t18,
      });
      await expect(
        createBooking({
          courtId: padel2.id,
          customerId: customer.id,
          startsAt: t1830,
        }),
      ).resolves.toMatchObject({ status: 'CONFIRMED' });
    });
  });

  describe('checks de sanidad', () => {
    it('ends_at <= starts_at → falla', async () => {
      const court = await getCourtByName('Tenis 1');
      const customer = await createCustomer({
        complexId: (await getComplex()).id,
      });
      const startsAt = new Date('2026-09-23T14:00:00.000Z');
      await expect(
        createBooking({
          courtId: court.id,
          customerId: customer.id,
          startsAt,
          endsAt: startsAt,
        }),
      ).rejects.toThrow(/bookings_ends_after_starts_chk/);
    });

    it('open_time con formato inválido → falla', async () => {
      const complex = await getComplex();
      await expect(
        prisma.court.create({
          data: {
            complexId: complex.id,
            name: 'Cancha rota',
            sport: 'PADEL',
            slotDurationMinutes: 60,
            openTime: '8:00',
            closeTime: '22:00',
            pricePerSlot: 1000,
          },
        }),
      ).rejects.toThrow(/courts_open_time_fmt_chk/);
    });
  });
});
