import { BookingStatus } from '@prisma/client';
import request from 'supertest';
import { createTestApp, prisma, resetDatabase, TestContext } from '../setup';
import {
  createBooking,
  createCourt,
  createCustomer,
  createUser,
  getComplex,
  getCourtByName,
} from '../factories';

/** Public bookings list for the QR landing. TEST_NOW = 2026-09-12 15:00 Buenos Aires. */
describe('Public bookings list (e2e)', () => {
  let ctx: TestContext;
  let complexId: string;
  let courtId: string;
  let customerId: string;

  const at = (iso: string) => new Date(iso);
  const get = (slug = 'complejo-demo') =>
    request(ctx.app.getHttpServer()).get(
      `${ctx.prefix}/public/c/${slug}/bookings`,
    );

  beforeAll(async () => {
    await resetDatabase();
    ctx = await createTestApp();
    complexId = (await getComplex()).id;
    courtId = (await getCourtByName('Pádel 1')).id;
    customerId = (
      await createCustomer({
        complexId,
        firstName: 'Ana',
        lastName: 'Jugadora',
        phone: '+5491100009999',
        note: 'nota interna',
      })
    ).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lists only today and yesterday (complex tz), confirmed, newest first, own complex only', async () => {
    const mk = (iso: string, status?: BookingStatus, cId?: string) =>
      createBooking({
        courtId: cId ?? courtId,
        customerId,
        startsAt: at(iso),
        status,
      });
    const tooOld = await mk('2026-09-10T20:00:00-03:00');
    const yesterdayEdge = await mk('2026-09-11T00:00:00-03:00');
    const yesterday = await mk('2026-09-11T19:00:00-03:00');
    const today = await mk('2026-09-12T10:00:00-03:00');
    const todayLate = await mk('2026-09-12T23:30:00-03:00');
    const tomorrow = await mk('2026-09-13T00:00:00-03:00');
    const cancelled = await mk(
      '2026-09-12T12:00:00-03:00',
      BookingStatus.CANCELLED,
    );
    const pending = await mk(
      '2026-09-12T13:00:00-03:00',
      BookingStatus.PENDING,
    );

    const other = await prisma.complex.create({
      data: {
        slug: 'otro-club',
        name: 'Otro Club',
        address: 'Calle 1',
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });
    const otherCourt = await createCourt({ complexId: other.id });
    const foreign = await mk(
      '2026-09-12T09:00:00-03:00',
      undefined,
      otherCourt.id,
    );

    const res = await get();
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((b) => b.id);
    expect(ids).toEqual([
      todayLate.id,
      today.id,
      yesterday.id,
      yesterdayEdge.id,
    ]);
    for (const excluded of [tooOld, tomorrow, cancelled, pending, foreign]) {
      expect(ids).not.toContain(excluded.id);
    }

    const otherRes = await get('otro-club');
    expect(otherRes.status).toBe(200);
    expect(otherRes.body.data.map((b: { id: string }) => b.id)).toEqual([
      foreign.id,
    ]);
  });

  it('exposes exactly the minimal fields (no PII)', async () => {
    const userId = (await createUser({ complexId })).id;
    const booking = await createBooking({
      courtId,
      customerId,
      startsAt: at('2026-09-12T18:00:00-03:00'),
      price: 10000,
    });
    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        registeredById: userId,
        amount: 4000,
        method: 'CASH',
      },
    });
    await prisma.paymentProof.create({
      data: {
        bookingId: booking.id,
        fileKey: 'payment-proofs/x.pdf',
        payerName: 'Pagador Secreto',
        declaredAmount: 1000,
      },
    });

    const res = await get();
    const item = (res.body.data as Array<Record<string, unknown>>).find(
      (b) => b.id === booking.id,
    ) as Record<string, unknown>;
    expect(Object.keys(item).sort()).toEqual([
      'court',
      'customerName',
      'endsAt',
      'id',
      'payment',
      'price',
      'startsAt',
    ]);
    expect(Object.keys(item.court as object).sort()).toEqual(['name', 'sport']);
    expect(item).toMatchObject({
      court: { name: 'Pádel 1', sport: 'PADEL' },
      customerName: 'Ana Jugadora',
      price: 10000,
      payment: { paidAmount: 4000, status: 'PARTIAL', hasPendingProof: true },
    });
    const raw = JSON.stringify(res.body);
    for (const secret of [
      '+5491100009999',
      'nota interna',
      'Pagador Secreto',
      'payment-proofs',
      'cbu',
    ]) {
      expect(raw).not.toContain(secret);
    }
  });

  it('returns a null customer name for bookings without customer', async () => {
    const booking = await prisma.booking.create({
      data: {
        courtId,
        customerId: null,
        startsAt: at('2026-09-12T20:30:00-03:00'),
        endsAt: at('2026-09-12T22:00:00-03:00'),
        price: 10000,
        source: 'ADMIN',
      },
    });
    const res = await get();
    const item = (
      res.body.data as Array<{ id: string; customerName: string | null }>
    ).find((b) => b.id === booking.id);
    expect(item?.customerName).toBeNull();
  });

  it('404s for an unknown slug', async () => {
    const res = await get('no-existe');
    expect(res.status).toBe(404);
  });
});
