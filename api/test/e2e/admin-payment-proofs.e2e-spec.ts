import { BookingStatus } from '@prisma/client';
import { StubStorageProvider } from '../../src/modules/storage/providers/stub.provider';
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

/** Admin review of payment proofs (docs/23-public-payment-link.md). */
describe('Admin payment proofs (e2e)', () => {
  let ctx: TestContext;
  let admin: Session;
  let ana: Session;
  let courtId: string;
  let customerId: string;
  let seq = 0;

  const newBooking = (status: BookingStatus = BookingStatus.CONFIRMED) => {
    seq += 1;
    return createBooking({
      courtId,
      customerId,
      startsAt: new Date(Date.UTC(2031, 0, 1, 12 + seq, 0, 0)),
      status,
      price: 10000,
    });
  };

  /** Creates a PENDING proof with a private file in the stub storage. */
  const newProof = async (
    bookingId: string,
    extra: {
      declaredAmount?: number;
      playersCount?: number;
      payerName?: string;
    } = {},
  ) => {
    const fileKey = `payment-proofs/${bookingId}/aa${seq}.pdf`;
    await ctx.app.get(StubStorageProvider).uploadPrivate({
      key: fileKey,
      body: Buffer.from('%PDF-1.7\n%%EOF\n'),
      contentType: 'application/pdf',
      bucket: 'paymentProofs',
    });
    return prisma.paymentProof.create({
      data: {
        bookingId,
        fileKey,
        payerName: extra.payerName ?? 'Juan Pérez',
        playersCount: extra.playersCount ?? null,
        declaredAmount: extra.declaredAmount ?? 6000,
      },
    });
  };

  const base = (bookingId: string) =>
    `/admin/bookings/${bookingId}/payment-proofs`;

  beforeAll(async () => {
    await resetDatabase();
    ctx = await createTestApp();
    [admin, ana] = await Promise.all([
      loginAs(ctx, 'admin@demo.com'),
      loginAs(ctx, 'ana@demo.com'),
    ]);
    courtId = (await getCourtByName('Pádel 1')).id;
    customerId = (await createCustomer({ complexId: (await getComplex()).id }))
      .id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lists proofs newest first', async () => {
    const booking = await newBooking();
    const first = await newProof(booking.id);
    await prisma.paymentProof.update({
      where: { id: first.id },
      data: {
        status: 'REJECTED',
        rejectReason: 'Ilegible',
        createdAt: new Date('2020-01-01T00:00:00Z'),
      },
    });
    const second = await newProof(booking.id);

    const res = await as(ctx, admin).get(base(booking.id));
    expect(res.status).toBe(200);
    const data = res.body.data as Array<{ id: string; status: string }>;
    expect(data.map((p) => p.id)).toEqual([second.id, first.id]);
    expect(data[0]).toMatchObject({
      status: 'PENDING',
      payerName: 'Juan Pérez',
      playersCount: null,
      declaredAmount: 6000,
      amount: null,
      reviewedAt: null,
      rejectReason: null,
    });
    expect(data[1]).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'Ilegible',
    });
  });

  it('returns a signed url for the private file', async () => {
    const booking = await newBooking();
    const proof = await newProof(booking.id);
    const res = await as(ctx, admin).get(
      `${base(booking.id)}/${proof.id}/file`,
    );
    expect(res.status).toBe(200);
    expect(typeof res.body.data.url).toBe('string');
    expect(res.body.data.url).toMatch(/^data:application\/pdf/);
  });

  it('approve defaults to the declared amount (one TRANSFER payment); twice conflicts', async () => {
    const booking = await newBooking();
    await createPayment({
      bookingId: booking.id,
      registeredById: admin.id,
      amount: 4000,
    });
    const proof = await newProof(booking.id, {
      declaredAmount: 2500,
      playersCount: 2,
    });

    const res = await as(ctx, admin).post(
      `${base(booking.id)}/${proof.id}/approve`,
      {},
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'APPROVED',
      amount: 2500,
      declaredAmount: 2500,
    });

    const payments = await prisma.payment.findMany({
      where: { bookingId: booking.id, method: 'TRANSFER' },
    });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      amount: 2500,
      registeredById: admin.id,
    });
    const stored = await prisma.paymentProof.findUniqueOrThrow({
      where: { id: proof.id },
    });
    expect(stored.status).toBe('APPROVED');
    expect(stored.reviewedById).toBe(admin.id);
    expect(stored.reviewedAt).not.toBeNull();

    const again = await as(ctx, admin).post(
      `${base(booking.id)}/${proof.id}/approve`,
      {},
    );
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('PAYMENT_PROOF_NOT_PENDING');
    expect(
      await prisma.payment.count({ where: { bookingId: booking.id } }),
    ).toBe(2);
  });

  it('several PENDING proofs of one booking are approved independently', async () => {
    const booking = await newBooking();
    const a = await newProof(booking.id, { declaredAmount: 3000 });
    const b = await newProof(booking.id, { declaredAmount: 4000 });
    for (const proof of [a, b]) {
      const res = await as(ctx, admin).post(
        `${base(booking.id)}/${proof.id}/approve`,
        {},
      );
      expect(res.status).toBe(200);
    }
    const payments = await prisma.payment.findMany({
      where: { bookingId: booking.id, method: 'TRANSFER' },
      orderBy: { amount: 'asc' },
    });
    expect(payments.map((p) => p.amount)).toEqual([3000, 4000]);
  });

  it('approve accepts an explicit amount', async () => {
    const booking = await newBooking();
    const proof = await newProof(booking.id);
    const res = await as(ctx, admin).post(
      `${base(booking.id)}/${proof.id}/approve`,
      { amount: 2500 },
    );
    expect(res.status).toBe(200);
    expect(res.body.data.amount).toBe(2500);
    const payment = await prisma.payment.findFirstOrThrow({
      where: { bookingId: booking.id },
    });
    expect(payment.amount).toBe(2500);
  });

  it('reject keeps no payment and stores the reason', async () => {
    const booking = await newBooking();
    const proof = await newProof(booking.id);

    const bad = await as(ctx, admin).post(
      `${base(booking.id)}/${proof.id}/reject`,
      {},
    );
    expect(bad.status).toBe(400);

    const res = await as(ctx, admin).post(
      `${base(booking.id)}/${proof.id}/reject`,
      { reason: 'Monto ilegible' },
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'Monto ilegible',
    });
    expect(
      await prisma.payment.count({ where: { bookingId: booking.id } }),
    ).toBe(0);

    const again = await as(ctx, admin).post(
      `${base(booking.id)}/${proof.id}/reject`,
      { reason: 'otra vez' },
    );
    expect(again.status).toBe(409);
  });

  it('404s for a booking of another complex', async () => {
    const other = await prisma.complex.create({
      data: {
        slug: 'otro-club-admin',
        name: 'Otro Club',
        address: 'Calle 1',
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });
    const otherCourt = await prisma.court.create({
      data: {
        complexId: other.id,
        name: 'Cancha X',
        sport: 'PADEL',
        slotDurationMinutes: 60,
        openTime: '08:00',
        closeTime: '23:00',
        pricePerSlot: 1000,
      },
    });
    const foreign = await createBooking({
      courtId: otherCourt.id,
      customerId,
      startsAt: new Date(Date.UTC(2031, 5, 1, 12, 0, 0)),
      price: 1000,
    });
    const proof = await newProof(foreign.id);

    expect((await as(ctx, admin).get(base(foreign.id))).status).toBe(404);
    expect(
      (await as(ctx, admin).get(`${base(foreign.id)}/${proof.id}/file`)).status,
    ).toBe(404);
    expect(
      (await as(ctx, admin).post(`${base(foreign.id)}/${proof.id}/approve`, {}))
        .status,
    ).toBe(404);
  });

  it('forbids non-admin users', async () => {
    const booking = await newBooking();
    const proof = await newProof(booking.id);
    expect((await as(ctx, ana).get(base(booking.id))).status).toBe(403);
    expect(
      (await as(ctx, ana).post(`${base(booking.id)}/${proof.id}/approve`, {}))
        .status,
    ).toBe(403);
  });

  it('approve on a cancelled booking is BOOKING_NOT_PAYABLE and the proof stays PENDING', async () => {
    const booking = await newBooking(BookingStatus.CANCELLED);
    const proof = await newProof(booking.id);
    const res = await as(ctx, admin).post(
      `${base(booking.id)}/${proof.id}/approve`,
      {},
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_NOT_PAYABLE');
    const stored = await prisma.paymentProof.findUniqueOrThrow({
      where: { id: proof.id },
    });
    expect(stored.status).toBe('PENDING');
    expect(stored.reviewedAt).toBeNull();
    expect(
      await prisma.payment.count({ where: { bookingId: booking.id } }),
    ).toBe(0);
  });

  describe('unified ledger (GET /admin/payments → proofs)', () => {
    interface LedgerBody {
      totals: { count: number; collected: number };
      payments: Array<{ id: string }>;
      proofs: Array<{
        id: string;
        status: string;
        payerName: string;
        declaredAmount: number;
        rejectReason: string | null;
        booking: { id: string; court: { name: string } };
      }>;
    }
    const ledger = async (query = '') => {
      const res = await as(ctx, admin).get(`/admin/payments${query}`);
      expect(res.status).toBe(200);
      return res.body.data as LedgerBody;
    };
    // The fixed test clock sits in 2026; a far-away day proves the date range is ignored for PENDING.
    const OTHER_DAY = '?date=2020-01-01';
    const ids = (body: LedgerBody) => body.proofs.map((p) => p.id);

    it('returns PENDING proofs outside the date range, never in totals', async () => {
      const booking = await newBooking();
      const proof = await newProof(booking.id, { declaredAmount: 7000 });
      const body = await ledger(OTHER_DAY);
      expect(ids(body)).toContain(proof.id);
      const row = body.proofs.find((p) => p.id === proof.id);
      expect(row).toMatchObject({
        status: 'PENDING',
        payerName: 'Juan Pérez',
        declaredAmount: 7000,
        booking: { id: booking.id, court: { name: 'Pádel 1' } },
      });
      expect(body.totals.count).toBe(0);
      expect(body.totals.collected).toBe(0);
    });

    it('excludes proofs of other complexes', async () => {
      const other = await prisma.complex.create({
        data: {
          slug: 'otro-club-ledger',
          name: 'Otro Club Ledger',
          address: 'Calle 2',
          timezone: 'America/Argentina/Buenos_Aires',
        },
      });
      const otherCourt = await prisma.court.create({
        data: {
          complexId: other.id,
          name: 'Cancha Y',
          sport: 'PADEL',
          slotDurationMinutes: 60,
          openTime: '08:00',
          closeTime: '23:00',
          pricePerSlot: 1000,
        },
      });
      const foreign = await createBooking({
        courtId: otherCourt.id,
        customerId,
        startsAt: new Date(Date.UTC(2031, 6, 1, 12, 0, 0)),
        price: 1000,
      });
      const proof = await newProof(foreign.id);
      expect(ids(await ledger(OTHER_DAY))).not.toContain(proof.id);
    });

    it('shows REJECTED only with voided=true and inside the date range', async () => {
      const booking = await newBooking();
      const proof = await newProof(booking.id);
      await prisma.paymentProof.update({
        where: { id: proof.id },
        data: {
          status: 'REJECTED',
          rejectReason: 'Ilegible',
          createdAt: new Date('2020-01-01T15:00:00Z'),
        },
      });
      expect(ids(await ledger(OTHER_DAY))).not.toContain(proof.id);
      const withVoided = await ledger(`${OTHER_DAY}&voided=true`);
      expect(withVoided.proofs.find((p) => p.id === proof.id)).toMatchObject({
        status: 'REJECTED',
        rejectReason: 'Ilegible',
      });
      // Same flag, different day: rejected proofs respect the range.
      expect(ids(await ledger('?date=2020-01-05&voided=true'))).not.toContain(
        proof.id,
      );
    });

    it('does not duplicate APPROVED proofs (their payment is the row)', async () => {
      const booking = await newBooking();
      const proof = await newProof(booking.id, { declaredAmount: 4000 });
      const approve = await as(ctx, admin).post(
        `${base(booking.id)}/${proof.id}/approve`,
        {},
      );
      expect(approve.status).toBe(200);
      const body = await ledger('?voided=true');
      expect(ids(body)).not.toContain(proof.id);
    });

    it('method=CASH hides proofs; method=TRANSFER keeps them', async () => {
      const booking = await newBooking();
      const proof = await newProof(booking.id);
      expect((await ledger(`${OTHER_DAY}&method=CASH`)).proofs).toEqual([]);
      expect(ids(await ledger(`${OTHER_DAY}&method=TRANSFER`))).toContain(
        proof.id,
      );
    });

    it('q matches the payer name case-insensitively', async () => {
      const booking = await newBooking();
      const proof = await newProof(booking.id, {
        payerName: 'Zulema Quiroga',
      });
      const hit = await ledger(`${OTHER_DAY}&q=zulema`);
      expect(ids(hit)).toEqual([proof.id]);
      expect(ids(await ledger(`${OTHER_DAY}&q=nadie-asi`))).toEqual([]);
    });
  });
});
