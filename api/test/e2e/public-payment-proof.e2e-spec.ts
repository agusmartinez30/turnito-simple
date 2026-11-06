import { BookingStatus } from '@prisma/client';
import request from 'supertest';
import { StubStorageProvider } from '../../src/modules/storage/providers/stub.provider';
import { createTestApp, prisma, resetDatabase, TestContext } from '../setup';
import {
  createBooking,
  createCustomer,
  createPayment,
  createUser,
  getComplex,
  getCourtByName,
} from '../factories';

/** Public payment link of a booking (docs/23-public-payment-link.md). */
describe('Public payment proof (e2e)', () => {
  let ctx: TestContext;
  let complexId: string;
  let courtId: string;
  let customerId: string;
  let userId: string;
  let seq = 0;

  /** Uploads are throttled per IP (20/min); every request gets its own forwarded IP (TRUST_PROXY). */
  let ipSeq = 0;
  const nextIp = () =>
    `10.20.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;

  const PDF = Buffer.from('%PDF-1.7\n%%EOF\n');
  const storage = () => ctx.app.get(StubStorageProvider);
  const url = (id: string, path: string, slug = 'complejo-demo') =>
    `${ctx.prefix}/public/c/${slug}/bookings/${id}/${path}`;
  const get = (id: string, slug?: string) =>
    request(ctx.app.getHttpServer()).get(url(id, 'payment', slug));
  const upload = (
    id: string,
    body: Buffer = PDF,
    filename = 'comprobante.pdf',
    contentType = 'application/pdf',
    fields: Record<string, string> = {
      payerName: 'Juan Pérez',
      amount: '4000',
    },
  ) => {
    const req = request(ctx.app.getHttpServer())
      .post(url(id, 'payment-proof'))
      .set('X-Forwarded-For', nextIp());
    for (const [name, value] of Object.entries(fields)) req.field(name, value);
    return req.attach('file', body, { filename, contentType });
  };
  /** Valid PDF with explicit text fields. */
  const send = (id: string, fields: Record<string, string>) =>
    upload(id, PDF, 'comprobante.pdf', 'application/pdf', fields);

  /** Each test gets its own booking, one slot later than the previous one. */
  const newBooking = (status: BookingStatus = BookingStatus.CONFIRMED) => {
    seq += 1;
    const startsAt = new Date(Date.UTC(2031, 0, 1, 12 + seq, 0, 0));
    return createBooking({
      courtId,
      customerId,
      startsAt,
      status,
      price: 10000,
    });
  };

  beforeAll(async () => {
    await resetDatabase();
    ctx = await createTestApp();
    complexId = (await getComplex()).id;
    courtId = (await getCourtByName('Pádel 1')).id;
    customerId = (await createCustomer({ complexId })).id;
    userId = (await createUser({ complexId })).id;
    await prisma.complex.update({
      where: { id: complexId },
      data: {
        bankCbu: '0000003100012345678901',
        bankAlias: 'club.demo',
        bankHolderName: 'Club Demo SRL',
      },
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('GET payment', () => {
    it('returns bank data, booking summary and no proof', async () => {
      const booking = await newBooking();
      await createPayment({
        bookingId: booking.id,
        registeredById: userId,
        amount: 4000,
      });
      const res = await get(booking.id);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        bank: {
          cbu: '0000003100012345678901',
          alias: 'club.demo',
          holderName: 'Club Demo SRL',
        },
        booking: {
          id: booking.id,
          courtName: 'Pádel 1',
          price: 10000,
          paidAmount: 4000,
          pendingAmount: 6000,
        },
        proofs: { pendingCount: 0, approvedCount: 0, rejectedCount: 0 },
      });
      expect(res.body.data.booking).toMatchObject({
        pendingProofsAmount: 0,
        remaining: 6000,
        fullyCovered: false,
      });
    });

    it('rejects a cancelled booking', async () => {
      const booking = await newBooking(BookingStatus.CANCELLED);
      const res = await get(booking.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('BOOKING_NOT_PAYABLE');
    });

    it('404s for an unknown slug and for a booking of another complex', async () => {
      const booking = await newBooking();
      await prisma.complex.create({
        data: {
          slug: 'otro-club',
          name: 'Otro Club',
          address: 'Calle 1',
          timezone: 'America/Argentina/Buenos_Aires',
        },
      });
      expect((await get(booking.id, 'no-existe')).status).toBe(404);
      const cross = await get(booking.id, 'otro-club');
      expect(cross.status).toBe(404);
      expect(cross.body.error.code).toBe('NOT_FOUND');
    });

    it('404s for an unknown booking id', async () => {
      const res = await get('00000000-0000-4000-8000-000000000000');
      expect(res.status).toBe(404);
    });
  });

  describe('POST payment-proof', () => {
    it('rejects a non-PDF file', async () => {
      const booking = await newBooking();
      const res = await upload(
        booking.id,
        Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
        'foto.png',
        'image/png',
      );
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    });

    it('rejects a .pdf that has no %PDF- magic bytes', async () => {
      const booking = await newBooking();
      const res = await upload(
        booking.id,
        Buffer.from('<html>no soy pdf</html>'),
      );
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
      expect(
        await prisma.paymentProof.count({ where: { bookingId: booking.id } }),
      ).toBe(0);
    });

    it('rejects a missing file', async () => {
      const booking = await newBooking();
      const res = await request(ctx.app.getHttpServer())
        .post(url(booking.id, 'payment-proof'))
        .set('X-Forwarded-For', nextIp())
        .field('payerName', 'Ana')
        .field('amount', '1000');
      expect(res.status).toBe(400);
      expect(res.body.error.details.file).toBeDefined();
    });

    it('rejects a file over 5 MB', async () => {
      const booking = await newBooking();
      const big = Buffer.concat([
        Buffer.from('%PDF-1.7\n'),
        Buffer.alloc(5 * 1024 * 1024 + 1),
      ]);
      const res = await upload(booking.id, big);
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    });

    it('rejects a cancelled booking', async () => {
      const booking = await newBooking(BookingStatus.CANCELLED);
      const res = await upload(booking.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('BOOKING_NOT_PAYABLE');
    });

    it('rejects a fully paid booking', async () => {
      const booking = await newBooking();
      await createPayment({
        bookingId: booking.id,
        registeredById: userId,
        amount: 10000,
      });
      const res = await upload(booking.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('BOOKING_NOT_PAYABLE');
    });

    it('rejects a missing, blank or over-long payer name', async () => {
      const booking = await newBooking();
      const invalid: Array<Record<string, string>> = [
        { amount: '1000' },
        { payerName: '   ', amount: '1000' },
        { payerName: 'x'.repeat(101), amount: '1000' },
      ];
      for (const fields of invalid) {
        const res = await send(booking.id, fields);
        expect(res.status).toBe(400);
        expect(res.body.error.details.payerName).toBeDefined();
      }
      expect(
        await prisma.paymentProof.count({ where: { bookingId: booking.id } }),
      ).toBe(0);
    });

    it('rejects a missing or non-positive amount and out-of-range playersCount', async () => {
      const booking = await newBooking();
      const cases: Array<[Record<string, string>, string]> = [
        [{ payerName: 'Ana' }, 'amount'],
        [{ payerName: 'Ana', amount: '0' }, 'amount'],
        [{ payerName: 'Ana', amount: '10.5' }, 'amount'],
        [
          { payerName: 'Ana', amount: '1000', playersCount: '0' },
          'playersCount',
        ],
        [
          { payerName: 'Ana', amount: '1000', playersCount: '51' },
          'playersCount',
        ],
      ];
      for (const [fields, field] of cases) {
        const res = await send(booking.id, fields);
        expect(res.status).toBe(400);
        expect(res.body.error.details[field]).toBeDefined();
      }
    });

    it('rejects an amount above the remaining balance with details.amount', async () => {
      const booking = await newBooking();
      await createPayment({
        bookingId: booking.id,
        registeredById: userId,
        amount: 4000,
      });
      const res = await send(booking.id, { payerName: 'Ana', amount: '6001' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.amount).toHaveLength(1);
      expect(
        await prisma.paymentProof.count({ where: { bookingId: booking.id } }),
      ).toBe(0);
    });

    it('allows several PENDING proofs; each discounts the remaining balance; no payer data is exposed', async () => {
      const booking = await newBooking();
      const first = await send(booking.id, {
        payerName: 'Ana Gómez',
        playersCount: '2',
        amount: '4000',
      });
      expect(first.status).toBe(201);
      expect(first.body.data.booking).toMatchObject({
        paidAmount: 0,
        pendingProofsAmount: 4000,
        remaining: 6000,
        fullyCovered: false,
      });
      const second = await send(booking.id, {
        payerName: 'Beto Ruiz',
        amount: '6000',
      });
      expect(second.status).toBe(201);
      expect(second.body.data.booking).toMatchObject({
        pendingProofsAmount: 10000,
        remaining: 0,
        fullyCovered: true,
      });
      expect(second.body.data.proofs.pendingCount).toBe(2);

      // Covered by pending proofs -> no more uploads.
      const third = await send(booking.id, { payerName: 'Cami', amount: '1' });
      expect(third.status).toBe(409);
      expect(third.body.error.code).toBe('BOOKING_NOT_PAYABLE');

      const view = await get(booking.id);
      expect(view.status).toBe(200);
      const text = JSON.stringify(view.body);
      expect(text).not.toMatch(/Ana|Beto|payerName|declaredAmount/);
      expect(view.body.data.proofs).toEqual({
        pendingCount: 2,
        approvedCount: 0,
        rejectedCount: 0,
      });

      const proofs = await prisma.paymentProof.findMany({
        where: { bookingId: booking.id },
        orderBy: { declaredAmount: 'asc' },
      });
      expect(proofs).toMatchObject([
        { payerName: 'Ana Gómez', playersCount: 2, declaredAmount: 4000 },
        { payerName: 'Beto Ruiz', playersCount: null, declaredAmount: 6000 },
      ]);
      // The discount is visual: no Payment exists until an admin approves.
      expect(
        await prisma.payment.count({ where: { bookingId: booking.id } }),
      ).toBe(0);
    });

    it('rejected proofs stop discounting the balance', async () => {
      const booking = await newBooking();
      await send(booking.id, { payerName: 'Ana', amount: '7000' });
      await prisma.paymentProof.updateMany({
        where: { bookingId: booking.id },
        data: { status: 'REJECTED', rejectReason: 'Ilegible' },
      });
      const view = await get(booking.id);
      expect(view.body.data.booking).toMatchObject({
        pendingProofsAmount: 0,
        remaining: 10000,
      });
      expect(view.body.data.proofs.rejectedCount).toBe(1);
      expect(JSON.stringify(view.body)).not.toMatch(/Ilegible/);
    });

    it('concurrent uploads near the limit cannot exceed the remaining balance', async () => {
      const booking = await newBooking();
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          send(booking.id, { payerName: `Jugador ${i}`, amount: '4000' }),
        ),
      );
      // 10000 remaining -> at most two 4000 proofs fit.
      expect(results.filter((r) => r.status === 201)).toHaveLength(2);
      const sum = await prisma.paymentProof.aggregate({
        where: { bookingId: booking.id },
        _sum: { declaredAmount: true },
      });
      expect(sum._sum.declaredAmount).toBe(8000);
      expect(
        storage()
          .paymentProofKeys()
          .filter((k) => k.includes(booking.id)),
      ).toHaveLength(2);
    });

    it('stores a private PENDING proof with the payer data', async () => {
      const booking = await newBooking();
      const before = storage().paymentProofKeys().length;
      const dniBefore = storage().privateKeys().length;

      const res = await send(booking.id, {
        payerName: '  Juan Pérez ',
        playersCount: '3',
        amount: '4000',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.proofs.pendingCount).toBe(1);

      const proofs = await prisma.paymentProof.findMany({
        where: { bookingId: booking.id },
      });
      expect(proofs).toHaveLength(1);
      expect(proofs[0]).toMatchObject({
        status: 'PENDING',
        payerName: 'Juan Pérez',
        playersCount: 3,
        declaredAmount: 4000,
        amount: null,
      });
      expect(proofs[0].fileKey).toMatch(
        new RegExp(`^payment-proofs/${booking.id}/[0-9a-f]+\\.pdf$`),
      );
      expect(storage().paymentProofKeys()).toContain(proofs[0].fileKey);
      expect(storage().paymentProofKeys().length).toBe(before + 1);
      // The proof must not land in the documents (DNI) bucket.
      expect(storage().privateKeys().length).toBe(dniBefore);
    });
  });
});
