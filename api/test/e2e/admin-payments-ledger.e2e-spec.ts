import request from 'supertest';
import {
  createBooking,
  createCustomer,
  createPayment,
  getComplex,
  getCourtByName,
} from '../factories';
import {
  as,
  createTestApp,
  loginAs,
  resetDatabase,
  Session,
  TestContext,
} from '../setup';

interface LedgerRow {
  id: string;
  amount: number;
  method: string;
  note?: string;
  createdAt: string;
  registeredBy: { id: string; name: string };
  voidedAt?: string;
  booking: {
    id: string;
    status: string;
    price: number;
    startsAt: string;
    endsAt: string;
    court: { id: string; name: string; sport: string };
    customer: { id: string; name: string; firstName: string; phone?: string };
  };
}

interface LedgerBody {
  range: { from: string; to: string };
  totals: { collected: number; cash: number; transfer: number; count: number };
  payments: LedgerRow[];
}

/**
 * Checklist E2E de docs/11-admin-payments.md › GET /admin/payments.
 * Clock fijo en 2026-09-12 15:00 -03; los pagos se crean con `createdAt` explícito.
 */
describe('Admin payments ledger (e2e)', () => {
  let ctx: TestContext;
  let admin: Session;
  let anaCustomer: { id: string };
  let brunoCustomer: { id: string };
  let ana: Session;
  let anaBookingId: string;
  let brunoBookingId: string;
  let voidedId: string;

  const at = (iso: string) => new Date(iso);

  beforeAll(async () => {
    await resetDatabase();
    ctx = await createTestApp();
    [admin, ana] = await Promise.all([
      loginAs(ctx, 'admin@demo.com'),
      loginAs(ctx, 'ana@demo.com'),
    ]);
    const [futbol, padel] = await Promise.all([
      getCourtByName('Fútbol 5 A'),
      getCourtByName('Pádel 1'),
    ]);
    const complexId = (await getComplex()).id;
    [anaCustomer, brunoCustomer] = await Promise.all([
      createCustomer({
        complexId,
        firstName: 'Ana',
        lastName: 'Jugadora',
        phone: '+5491100009001',
      }),
      createCustomer({
        complexId,
        firstName: 'Bruno',
        lastName: 'Jugador',
        phone: '+5491100009002',
      }),
    ]);
    const [anaBooking, brunoBooking] = await Promise.all([
      createBooking({
        courtId: futbol.id,
        customerId: anaCustomer.id,
        startsAt: at('2026-09-13T20:00:00-03:00'),
        endsAt: at('2026-09-13T21:00:00-03:00'),
        price: 20000,
      }),
      createBooking({
        courtId: padel.id,
        customerId: brunoCustomer.id,
        startsAt: at('2026-09-13T17:00:00-03:00'),
        price: 12000,
      }),
    ]);
    anaBookingId = anaBooking.id;
    brunoBookingId = brunoBooking.id;

    // 12/09: CASH 20000 (ana, 10:00) + TRANSFER 5000 (bruno, 12:30) + una anulada (ana, 11:00)
    await createPayment({
      bookingId: anaBookingId,
      registeredById: admin.id,
      amount: 20000,
      method: 'CASH',
      note: 'Pagó Juan',
      createdAt: at('2026-09-12T10:00:00-03:00'),
    });
    await createPayment({
      bookingId: brunoBookingId,
      registeredById: admin.id,
      amount: 5000,
      method: 'TRANSFER',
      createdAt: at('2026-09-12T12:30:00-03:00'),
    });
    voidedId = (
      await createPayment({
        bookingId: anaBookingId,
        registeredById: admin.id,
        amount: 999,
        method: 'CASH',
        voided: true,
        createdAt: at('2026-09-12T11:00:00-03:00'),
      })
    ).id;
    // 11/09 a las 23:30 local (02:30Z del 12): sigue siendo el 11 en el complejo.
    await createPayment({
      bookingId: brunoBookingId,
      registeredById: admin.id,
      amount: 3000,
      method: 'CASH',
      createdAt: at('2026-09-11T23:30:00-03:00'),
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const ledger = async (qs = '') => {
    const res = await as(ctx, admin).get(`/admin/payments${qs}`);
    expect(res.status).toBe(200);
    return res.body.data as LedgerBody;
  };

  it('sin params → hoy del clock: solo vigentes, createdAt desc, totales y turno embebido', async () => {
    const body = await ledger();
    expect(body.range).toEqual({ from: '2026-09-12', to: '2026-09-12' });
    expect(body.totals).toEqual({
      collected: 25000,
      cash: 20000,
      transfer: 5000,
      count: 2,
    });
    expect(body.payments.map((p) => p.amount)).toEqual([5000, 20000]);
    const cash = body.payments[1];
    expect(cash).toMatchObject({
      method: 'CASH',
      note: 'Pagó Juan',
      createdAt: '2026-09-12T10:00:00-03:00',
      registeredBy: { id: admin.id, name: 'Admin Demo' },
      booking: {
        id: anaBookingId,
        status: 'CONFIRMED',
        price: 20000,
        startsAt: '2026-09-13T20:00:00-03:00',
        court: { name: 'Fútbol 5 A', sport: 'FOOTBALL_5' },
        customer: {
          id: anaCustomer.id,
          name: 'Ana Jugadora',
          firstName: 'Ana',
          lastName: 'Jugadora',
          phone: '+5491100009001',
        },
      },
    });
    expect(cash.voidedAt).toBeUndefined();
  });

  it('?voided=true suma la anulada al listado pero no a los totales', async () => {
    const body = await ledger('?voided=true');
    expect(body.payments).toHaveLength(3);
    const voided = body.payments.find((p) => p.id === voidedId);
    expect(voided?.voidedAt).toBeDefined();
    expect(body.totals).toEqual({
      collected: 25000,
      cash: 20000,
      transfer: 5000,
      count: 2,
    });
  });

  it('rango from/to inclusive y date puntual (días locales del complejo)', async () => {
    const range = await ledger('?from=2026-09-11&to=2026-09-12');
    expect(range.range).toEqual({ from: '2026-09-11', to: '2026-09-12' });
    expect(range.payments).toHaveLength(3);
    expect(range.totals).toEqual({
      collected: 28000,
      cash: 23000,
      transfer: 5000,
      count: 3,
    });

    const day = await ledger('?date=2026-09-11');
    expect(day.payments.map((p) => p.amount)).toEqual([3000]);
    expect(day.totals.count).toBe(1);

    // Solo `from` → un día.
    const single = await ledger('?from=2026-09-11');
    expect(single.range).toEqual({ from: '2026-09-11', to: '2026-09-11' });
  });

  it('?method y ?q filtran filas y totales', async () => {
    const transfer = await ledger('?method=TRANSFER');
    expect(transfer.payments.map((p) => p.method)).toEqual(['TRANSFER']);
    expect(transfer.totals).toEqual({
      collected: 5000,
      cash: 0,
      transfer: 5000,
      count: 1,
    });

    // El buscador ya no mira el email: el cliente no tiene cuenta.
    const byAna = await ledger('?q=jugadora');
    expect(byAna.payments.map((p) => p.booking.id)).toEqual([anaBookingId]);
    expect(byAna.totals.collected).toBe(20000);

    expect((await as(ctx, admin).get('/admin/payments?q=a')).status).toBe(400);
  });

  it('validaciones → 400', async () => {
    const badDay = await as(ctx, admin).get('/admin/payments?date=2026-02-30');
    expect(badDay.status).toBe(400);
    expect(badDay.body.error.details).toHaveProperty('date');

    const inverted = await as(ctx, admin).get(
      '/admin/payments?from=2026-09-13&to=2026-09-12',
    );
    expect(inverted.status).toBe(400);
    expect(inverted.body.error.details).toHaveProperty('to');

    for (const qs of [
      '?date=13/09/2026',
      '?method=CARD',
      '?voided=si',
      '?limit=201',
    ]) {
      expect((await as(ctx, admin).get(`/admin/payments${qs}`)).status).toBe(
        400,
      );
    }
  });

  it('un pago registrado por API aparece en el ledger del día del clock', async () => {
    const created = await as(ctx, admin).post(
      `/admin/bookings/${brunoBookingId}/payments`,
      { amount: 7000, method: 'TRANSFER', note: 'Bruno' },
    );
    expect(created.status).toBe(201);

    const body = await ledger();
    expect(body.payments[0]).toMatchObject({
      amount: 7000,
      note: 'Bruno',
      createdAt: '2026-09-12T15:00:00-03:00',
      booking: { id: brunoBookingId, customer: { name: 'Bruno Jugador' } },
    });
    expect(body.totals).toEqual({
      collected: 32000,
      cash: 20000,
      transfer: 12000,
      count: 3,
    });
  });

  it('jugador → 403; sin token → 401', async () => {
    expect((await as(ctx, ana).get('/admin/payments')).status).toBe(403);
    const anon = await request(ctx.app.getHttpServer()).get(
      `${ctx.prefix}/admin/payments`,
    );
    expect(anon.status).toBe(401);
  });
});
