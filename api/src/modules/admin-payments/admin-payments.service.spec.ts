import { Test } from '@nestjs/testing';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { BOOKING_DETAIL_INCLUDE } from '../../shared/serializers/booking.serializer';
import { customerSearch } from '../../shared/customers/customer-search';
import {
  PAYMENT_LEDGER_INCLUDE,
  PAYMENT_PROOF_LEDGER_INCLUDE,
} from '../../shared/serializers/payment-ledger.serializer';
import {
  bookingFixture,
  complexFixture,
  NOW,
  paymentFixture,
} from '../../shared/testing/fixtures';
import { Clock, FixedClock } from '../../shared/time/clock';
import { ComplexService } from '../complex/complex.service';
import {
  ADMIN_PAYMENT_MESSAGES,
  AdminPaymentsService,
  PROOFS_LEDGER_CAP,
} from './admin-payments.service';

const ADMIN = 'u-admin';
const BOOKING_ID = bookingFixture().id;
const PAYMENT_ID = paymentFixture().id;

describe('AdminPaymentsService', () => {
  let service: AdminPaymentsService;
  let booking: { findFirst: jest.Mock; findUniqueOrThrow: jest.Mock };
  let payment: {
    create: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
    findMany: jest.Mock;
    groupBy: jest.Mock;
  };
  let paymentProof: { findMany: jest.Mock };

  beforeEach(async () => {
    paymentProof = { findMany: jest.fn().mockResolvedValue([]) };
    booking = {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: BOOKING_ID, status: 'CONFIRMED' }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue(bookingFixture({ payments: [paymentFixture()] })),
    };
    payment = {
      create: jest.fn().mockResolvedValue(paymentFixture()),
      findFirst: jest.fn().mockResolvedValue(paymentFixture()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminPaymentsService,
        {
          provide: PrismaService,
          useValue: { booking, payment, paymentProof },
        },
        {
          provide: ComplexService,
          useValue: {
            findByIdOrThrow: () => Promise.resolve(complexFixture),
          },
        },
        { provide: Clock, useValue: new FixedClock(NOW) },
      ],
    }).compile();
    service = moduleRef.get(AdminPaymentsService);
  });

  const expectError = async (promise: Promise<unknown>, code: ErrorCode) => {
    const error = (await promise.catch((e: unknown) => e)) as AppException;
    expect(error).toBeInstanceOf(AppException);
    expect(error.code).toBe(code);
  };

  describe('register', () => {
    it('en CONFIRMED crea el pago con registeredById, createdAt = NOW y note null si no viene; devuelve el detalle', async () => {
      const result = await service.register(
        complexFixture.id,
        ADMIN,
        BOOKING_ID,
        {
          amount: 2000,
          method: 'CASH',
        },
      );

      expect(payment.create).toHaveBeenCalledWith({
        data: {
          bookingId: BOOKING_ID,
          amount: 2000,
          method: 'CASH',
          note: null,
          registeredById: ADMIN,
          createdAt: NOW,
        },
      });
      expect(booking.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: BOOKING_ID },
        include: BOOKING_DETAIL_INCLUDE,
      });
      expect(result.payments).toHaveLength(1);
    });

    it('guarda la nota cuando viene', async () => {
      await service.register(complexFixture.id, ADMIN, BOOKING_ID, {
        amount: 2000,
        method: 'TRANSFER',
        note: 'Juan',
      });
      const data = (
        payment.create.mock.calls[0][0] as { data: { note: string } }
      ).data;
      expect(data.note).toBe('Juan');
    });

    it('en PENDING también acepta', async () => {
      booking.findFirst.mockResolvedValue({
        id: BOOKING_ID,
        status: 'PENDING',
      });
      await service.register(complexFixture.id, ADMIN, BOOKING_ID, {
        amount: 500,
        method: 'CASH',
      });
      expect(payment.create).toHaveBeenCalled();
    });

    it('en CANCELLED → BOOKING_NOT_PAYABLE sin crear nada', async () => {
      booking.findFirst.mockResolvedValue({
        id: BOOKING_ID,
        status: 'CANCELLED',
      });
      await expectError(
        service.register(complexFixture.id, ADMIN, BOOKING_ID, {
          amount: 500,
          method: 'CASH',
        }),
        ErrorCode.BOOKING_NOT_PAYABLE,
      );
      expect(payment.create).not.toHaveBeenCalled();
    });

    it('reserva inexistente → NOT_FOUND', async () => {
      booking.findFirst.mockResolvedValue(null);
      await expectError(
        service.register(complexFixture.id, ADMIN, 'ghost', {
          amount: 500,
          method: 'CASH',
        }),
        ErrorCode.NOT_FOUND,
      );
    });

    it('no valida sobrepago: un monto mayor al precio se acepta', async () => {
      await service.register(complexFixture.id, ADMIN, BOOKING_ID, {
        amount: 999_999,
        method: 'CASH',
      });
      expect(payment.create).toHaveBeenCalled();
    });
  });

  describe('void', () => {
    it('anula con voidedAt = NOW, voidedById y voidReason; devuelve el detalle', async () => {
      const result = await service.void(
        complexFixture.id,
        ADMIN,
        BOOKING_ID,
        PAYMENT_ID,
        'Error',
      );

      expect(payment.findFirst).toHaveBeenCalledWith({
        where: { id: PAYMENT_ID, bookingId: BOOKING_ID },
      });
      expect(payment.updateMany).toHaveBeenCalledWith({
        where: { id: PAYMENT_ID, bookingId: BOOKING_ID, voidedAt: null },
        data: { voidedAt: NOW, voidedById: ADMIN, voidReason: 'Error' },
      });
      expect(result.id).toBe(BOOKING_ID);
    });

    it('sin motivo → voidReason null', async () => {
      await service.void(complexFixture.id, ADMIN, BOOKING_ID, PAYMENT_ID);
      const data = (
        payment.updateMany.mock.calls[0][0] as { data: { voidReason: unknown } }
      ).data;
      expect(data.voidReason).toBeNull();
    });

    it('ya anulado → PAYMENT_ALREADY_VOIDED sin tocar la DB', async () => {
      payment.findFirst.mockResolvedValue(paymentFixture({ voidedAt: NOW }));
      await expectError(
        service.void(complexFixture.id, ADMIN, BOOKING_ID, PAYMENT_ID),
        ErrorCode.PAYMENT_ALREADY_VOIDED,
      );
      expect(payment.updateMany).not.toHaveBeenCalled();
    });

    it('carrera: updateMany con count 0 → PAYMENT_ALREADY_VOIDED', async () => {
      payment.updateMany.mockResolvedValue({ count: 0 });
      await expectError(
        service.void(complexFixture.id, ADMIN, BOOKING_ID, PAYMENT_ID),
        ErrorCode.PAYMENT_ALREADY_VOIDED,
      );
    });

    it('pago inexistente o de otra reserva → NOT_FOUND', async () => {
      payment.findFirst.mockResolvedValue(null);
      await expectError(
        service.void(complexFixture.id, ADMIN, 'other-booking', PAYMENT_ID),
        ErrorCode.NOT_FOUND,
      );
      expect(payment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    const findManyArgs = () =>
      payment.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
        orderBy: unknown;
        take: number;
        include: unknown;
      };
    const groupByArgs = () =>
      payment.groupBy.mock.calls[0][0] as { where: Record<string, unknown> };

    // 2026-09-12 en Buenos Aires = [2026-09-12T03:00Z, 2026-09-13T03:00Z)
    const DAY_12 = {
      gte: new Date('2026-09-12T03:00:00.000Z'),
      lt: new Date('2026-09-13T03:00:00.000Z'),
    };

    it('sin params → hoy del clock, solo vigentes, createdAt desc, limit e include del ledger', async () => {
      const res = await service.list(complexFixture.id, { limit: 100 });
      expect(res.range).toEqual({ from: '2026-09-12', to: '2026-09-12' });
      expect(findManyArgs()).toEqual({
        where: {
          createdAt: DAY_12,
          booking: { AND: [{ court: { complexId: complexFixture.id } }] },
          voidedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: PAYMENT_LEDGER_INCLUDE,
      });
      expect(groupByArgs().where).toEqual({
        createdAt: DAY_12,
        booking: { AND: [{ court: { complexId: complexFixture.id } }] },
        voidedAt: null,
      });
    });

    it('date → ese día; from/to → inclusive (to + 1); solo from → to = from', async () => {
      await service.list(complexFixture.id, { date: '2026-09-12', limit: 100 });
      expect(findManyArgs().where.createdAt).toEqual(DAY_12);

      payment.findMany.mockClear();
      const range = await service.list(complexFixture.id, {
        from: '2026-09-10',
        to: '2026-09-12',
        limit: 100,
      });
      expect(range.range).toEqual({ from: '2026-09-10', to: '2026-09-12' });
      expect(findManyArgs().where.createdAt).toEqual({
        gte: new Date('2026-09-10T03:00:00.000Z'),
        lt: new Date('2026-09-13T03:00:00.000Z'),
      });

      payment.findMany.mockClear();
      const single = await service.list(complexFixture.id, {
        from: '2026-09-11',
        limit: 100,
      });
      expect(single.range).toEqual({ from: '2026-09-11', to: '2026-09-11' });
    });

    it('voided: true → findMany sin filtro de anulados; groupBy siempre solo vigentes', async () => {
      await service.list(complexFixture.id, { voided: true, limit: 50 });
      expect(findManyArgs().where).toEqual({
        createdAt: DAY_12,
        booking: { AND: [{ court: { complexId: complexFixture.id } }] },
      });
      expect(findManyArgs().take).toBe(50);
      expect(groupByArgs().where).toEqual({
        createdAt: DAY_12,
        booking: { AND: [{ court: { complexId: complexFixture.id } }] },
        voidedAt: null,
      });
    });

    it('method y q entran en el where (q vía customerSearch sobre la reserva)', async () => {
      await service.list(complexFixture.id, {
        method: 'TRANSFER',
        q: 'ana',
        limit: 100,
      });
      const scoped = {
        method: 'TRANSFER',
        booking: {
          AND: [
            { court: { complexId: complexFixture.id } },
            customerSearch('ana'),
          ],
        },
      };
      expect(findManyArgs().where).toMatchObject(scoped);
      expect(groupByArgs().where).toMatchObject(scoped);
    });

    it('reduce el groupBy a totals por método; sin filas → todo 0', async () => {
      payment.groupBy.mockResolvedValue([
        { method: 'CASH', _sum: { amount: 20000 }, _count: { _all: 2 } },
        { method: 'TRANSFER', _sum: { amount: 5000 }, _count: { _all: 1 } },
      ]);
      const res = await service.list(complexFixture.id, { limit: 100 });
      expect(res.totals).toEqual({
        collected: 25000,
        cash: 20000,
        transfer: 5000,
        count: 3,
      });

      payment.groupBy.mockResolvedValue([]);
      const empty = await service.list(complexFixture.id, { limit: 100 });
      expect(empty.totals).toEqual({
        collected: 0,
        cash: 0,
        transfer: 0,
        count: 0,
      });
    });

    describe('proofs', () => {
      const proofArgs = () =>
        paymentProof.findMany.mock.calls[0][0] as {
          where: { AND: unknown[] };
          orderBy: unknown;
          take: number;
          include: unknown;
        };
      const scope = { booking: { court: { complexId: complexFixture.id } } };

      it('PENDING always (no date filter), scoped by complex, capped, one query with includes', async () => {
        await service.list(complexFixture.id, { limit: 10 });
        expect(proofArgs()).toEqual({
          where: {
            AND: [scope, { OR: [{ status: 'PENDING' }] }],
          },
          orderBy: { createdAt: 'desc' },
          take: PROOFS_LEDGER_CAP,
          include: PAYMENT_PROOF_LEDGER_INCLUDE,
        });
      });

      it('voided: true adds REJECTED inside the date range', async () => {
        await service.list(complexFixture.id, { voided: true, limit: 100 });
        expect(proofArgs().where.AND[1]).toEqual({
          OR: [
            { status: 'PENDING' },
            { status: 'REJECTED', createdAt: DAY_12 },
          ],
        });
      });

      it('method CASH hides proofs without querying', async () => {
        const res = await service.list(complexFixture.id, {
          method: 'CASH',
          limit: 100,
        });
        expect(res.proofs).toEqual([]);
        expect(paymentProof.findMany).not.toHaveBeenCalled();
      });

      it('method TRANSFER keeps proofs', async () => {
        await service.list(complexFixture.id, {
          method: 'TRANSFER',
          limit: 100,
        });
        expect(paymentProof.findMany).toHaveBeenCalledTimes(1);
      });

      it('q matches payerName (insensitive) or the booking customer', async () => {
        await service.list(complexFixture.id, { q: 'juan', limit: 100 });
        expect(proofArgs().where.AND[2]).toEqual({
          OR: [
            { payerName: { contains: 'juan', mode: 'insensitive' } },
            { booking: customerSearch('juan') },
          ],
        });
      });

      it('never feeds the totals (groupBy only reads payments)', async () => {
        paymentProof.findMany.mockResolvedValue([{ id: 'pr-1' }]);
        const res = await service.list(complexFixture.id, { limit: 100 });
        expect(res.proofs).toHaveLength(1);
        expect(res.totals.count).toBe(0);
      });
    });

    it('fecha inexistente → VALIDATION_ERROR con details del campo', async () => {
      await expect(
        service.list(complexFixture.id, { date: '2026-02-30', limit: 100 }),
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
        details: { date: [ADMIN_PAYMENT_MESSAGES.invalidDate] },
      });
      await expect(
        service.list(complexFixture.id, { from: '2026-13-01', limit: 100 }),
      ).rejects.toMatchObject({
        details: { from: [ADMIN_PAYMENT_MESSAGES.invalidDate] },
      });
      expect(payment.findMany).not.toHaveBeenCalled();
    });

    it('to < from → VALIDATION_ERROR details.to', async () => {
      await expect(
        service.list(complexFixture.id, {
          from: '2026-09-13',
          to: '2026-09-12',
          limit: 100,
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
        details: { to: [ADMIN_PAYMENT_MESSAGES.rangeInverted] },
      });
    });
  });
});
