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
  prisma,
  resetDatabase,
  Session,
  TestContext,
} from '../setup';

interface PaymentBody {
  id: string;
  amount: number;
  method: string;
  note?: string;
  createdAt: string;
  registeredBy: { id: string; name: string };
  voidedAt?: string;
  voidedBy?: { id: string; name: string };
  voidReason?: string;
}

interface BookingBody {
  id: string;
  status: string;
  price: number;
  payment: { paidAmount: number; balance: number; status: string };
  payments?: PaymentBody[];
}

/** Checklist E2E de docs/11-admin-payments.md. Reserva de fútbol de $20.000 el sábado 13/09. */
describe('Admin payments (e2e)', () => {
  let ctx: TestContext;
  let admin: Session;
  let ana: Session;
  let futbol: { id: string };
  let customer: { id: string };
  let bookingId: string;
  const PRICE = 20000;
  const DATE = '2026-09-13';

  const paymentsUrl = (id = bookingId) => `/admin/bookings/${id}/payments`;
  const voidUrl = (paymentId: string, id = bookingId) =>
    `${paymentsUrl(id)}/${paymentId}/void`;

  beforeAll(async () => {
    await resetDatabase();
    ctx = await createTestApp();
    [admin, ana] = await Promise.all([
      loginAs(ctx, 'admin@demo.com'),
      loginAs(ctx, 'ana@demo.com'),
    ]);
    customer = await createCustomer({ complexId: (await getComplex()).id });
    futbol = await getCourtByName('Fútbol 5 A');
    const booking = await createBooking({
      courtId: futbol.id,
      customerId: customer.id,
      startsAt: new Date('2026-09-13T20:00:00-03:00'),
      endsAt: new Date('2026-09-13T21:00:00-03:00'),
      price: PRICE,
    });
    bookingId = booking.id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('detalle sin pagos → payment UNPAID y payments []', async () => {
    const res = await as(ctx, admin).get(`/admin/bookings/${bookingId}`);
    expect(res.status).toBe(200);
    const body = res.body.data as BookingBody;
    expect(body.payment).toEqual({
      paidAmount: 0,
      balance: PRICE,
      status: 'UNPAID',
    });
    expect(body.payments).toEqual([]);
  });

  it('POST registra un pago parcial y devuelve el detalle con totales frescos', async () => {
    const res = await as(ctx, admin).post(paymentsUrl(), {
      amount: 2000,
      method: 'CASH',
      note: 'Juan',
    });
    expect(res.status).toBe(201);
    const body = res.body.data as BookingBody;
    expect(body.id).toBe(bookingId);
    expect(body.payment).toEqual({
      paidAmount: 2000,
      balance: 18000,
      status: 'PARTIAL',
    });
    expect(body.payments).toHaveLength(1);
    expect(body.payments?.[0]).toMatchObject({
      amount: 2000,
      method: 'CASH',
      note: 'Juan',
      registeredBy: { id: admin.id, name: 'Admin Demo' },
      createdAt: '2026-09-12T15:00:00-03:00',
    });
    expect(body.payments?.[0].voidedAt).toBeUndefined();
  });

  it('nueve pagos más → PAID con balance 0; otro más → sobrepago permitido (balance negativo)', async () => {
    for (let i = 0; i < 9; i += 1) {
      const res = await as(ctx, admin).post(paymentsUrl(), {
        amount: 2000,
        method: i % 2 === 0 ? 'TRANSFER' : 'CASH',
      });
      expect(res.status).toBe(201);
    }
    let body = (await as(ctx, admin).get(`/admin/bookings/${bookingId}`)).body
      .data as BookingBody;
    expect(body.payment).toEqual({
      paidAmount: PRICE,
      balance: 0,
      status: 'PAID',
    });

    const over = await as(ctx, admin).post(paymentsUrl(), {
      amount: 500,
      method: 'CASH',
    });
    expect(over.status).toBe(201);
    body = over.body.data as BookingBody;
    expect(body.payment).toEqual({
      paidAmount: PRICE + 500,
      balance: -500,
      status: 'PAID',
    });
    expect(body.payments).toHaveLength(11);
  });

  it('el listado trae `payment` pero no `payments[]`', async () => {
    const list = await as(ctx, admin).get(`/admin/bookings?date=${DATE}`);
    expect(list.status).toBe(200);
    const row = (list.body.data as BookingBody[]).find(
      (b) => b.id === bookingId,
    );
    expect(row?.payment.status).toBe('PAID');
    expect(row?.payments).toBeUndefined();

    expect(row?.payment).toEqual({
      paidAmount: PRICE + 500,
      balance: -500,
      status: 'PAID',
    });
  });

  it('void anula con motivo y baja el pagado; repetir → 409 PAYMENT_ALREADY_VOIDED', async () => {
    const detail = (await as(ctx, admin).get(`/admin/bookings/${bookingId}`))
      .body.data as BookingBody;
    // payments viene createdAt desc; con clock fijo todos comparten createdAt, así que buscamos por nota.
    const target = detail.payments?.find((p) => p.note === 'Juan');
    expect(target).toBeDefined();

    const res = await as(ctx, admin).patch(voidUrl(target!.id), {
      reason: 'Error de carga',
    });
    expect(res.status).toBe(200);
    const body = res.body.data as BookingBody;
    expect(body.payment).toEqual({
      paidAmount: PRICE + 500 - 2000,
      balance: -500 + 2000,
      status: 'PARTIAL',
    });
    const voided = body.payments?.find((p) => p.id === target!.id);
    expect(voided).toMatchObject({
      voidedAt: '2026-09-12T15:00:00-03:00',
      voidedBy: { id: admin.id, name: 'Admin Demo' },
      voidReason: 'Error de carga',
    });
    // El historial conserva el pago anulado.
    expect(body.payments).toHaveLength(11);

    const again = await as(ctx, admin).patch(voidUrl(target!.id), {});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('PAYMENT_ALREADY_VOIDED');
  });

  it('void sin body también funciona (reason opcional)', async () => {
    const created = await createPayment({
      bookingId,
      registeredById: admin.id,
      amount: 100,
    });
    const res = await as(ctx, admin).patch(voidUrl(created.id));
    expect(res.status).toBe(200);
    const voided = (res.body.data as BookingBody).payments?.find(
      (p) => p.id === created.id,
    );
    expect(voided?.voidedAt).toBeDefined();
    expect(voided?.voidReason).toBeUndefined();
  });

  it.each([
    ['amount 0', { amount: 0, method: 'CASH' }, 'amount'],
    ['amount negativo', { amount: -1, method: 'CASH' }, 'amount'],
    ['amount decimal', { amount: 1.5, method: 'CASH' }, 'amount'],
    ['method inválido', { amount: 100, method: 'CARD' }, 'method'],
    [
      'note de 121',
      { amount: 100, method: 'CASH', note: 'x'.repeat(121) },
      'note',
    ],
  ])('%s → 400 VALIDATION_ERROR', async (_label, body, field) => {
    const res = await as(ctx, admin).post(paymentsUrl(), body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveProperty(field);
  });

  it('reserva cancelada → POST 409 BOOKING_NOT_PAYABLE; void sobre ella → 200', async () => {
    const cancelled = await createBooking({
      courtId: futbol.id,
      customerId: customer.id,
      startsAt: new Date('2026-09-13T21:00:00-03:00'),
      endsAt: new Date('2026-09-13T22:00:00-03:00'),
      status: 'CANCELLED',
      price: PRICE,
    });
    const paid = await createPayment({
      bookingId: cancelled.id,
      registeredById: admin.id,
      amount: 3000,
    });

    const post = await as(ctx, admin).post(paymentsUrl(cancelled.id), {
      amount: 100,
      method: 'CASH',
    });
    expect(post.status).toBe(409);
    expect(post.body.error.code).toBe('BOOKING_NOT_PAYABLE');
    expect(post.body.error.message).toBe(
      'Esta reserva está cancelada; no admite pagos.',
    );

    const voided = await as(ctx, admin).patch(voidUrl(paid.id, cancelled.id));
    expect(voided.status).toBe(200);
    expect((voided.body.data as BookingBody).payment.paidAmount).toBe(0);
  });

  it('pago inexistente o de otra reserva → 404; reserva inexistente → 404; uuid inválido → 400', async () => {
    const other = await createBooking({
      courtId: futbol.id,
      customerId: customer.id,
      startsAt: new Date('2026-09-13T22:00:00-03:00'),
      endsAt: new Date('2026-09-13T23:00:00-03:00'),
      price: PRICE,
    });
    const otherPayment = await createPayment({
      bookingId: other.id,
      registeredById: admin.id,
    });

    const cross = await as(ctx, admin).patch(voidUrl(otherPayment.id));
    expect(cross.status).toBe(404);
    expect(cross.body.error.message).toBe('Pago no encontrado.');

    const ghost = await as(ctx, admin).patch(
      voidUrl('99999999-9999-4999-8999-999999999999'),
    );
    expect(ghost.status).toBe(404);

    const noBooking = await as(ctx, admin).post(
      paymentsUrl('99999999-9999-4999-8999-999999999999'),
      { amount: 100, method: 'CASH' },
    );
    expect(noBooking.status).toBe(404);
    expect(noBooking.body.error.message).toBe('Reserva no encontrada.');

    const badUuid = await as(ctx, admin).post(paymentsUrl('nope'), {
      amount: 100,
      method: 'CASH',
    });
    expect(badUuid.status).toBe(400);
  });

  it('ana → 403 en ambos; sin token → 401; el jugador no ve pagos en su reserva', async () => {
    const post = await as(ctx, ana).post(paymentsUrl(), {
      amount: 100,
      method: 'CASH',
    });
    expect(post.status).toBe(403);
    const patch = await as(ctx, ana).patch(
      voidUrl('99999999-9999-4999-8999-999999999999'),
    );
    expect(patch.status).toBe(403);

    const anon = await request(ctx.app.getHttpServer())
      .post(`${ctx.prefix}${paymentsUrl()}`)
      .send({ amount: 100, method: 'CASH' });
    expect(anon.status).toBe(401);
  });

  it('la DB rechaza un pago con amount 0 (payments_amount_positive_chk)', async () => {
    await expect(
      prisma.payment.create({
        data: {
          bookingId,
          registeredById: admin.id,
          amount: 0,
          method: 'CASH',
        },
      }),
    ).rejects.toThrow(/payments_amount_positive_chk/);
  });
});
