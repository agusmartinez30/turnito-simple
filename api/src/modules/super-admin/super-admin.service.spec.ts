import { Test } from '@nestjs/testing';
import { BookingStatus, PaymentProofStatus } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { Clock, FixedClock } from '../../shared/time/clock';
import { BA, NOW } from '../../shared/testing/fixtures';
import { ComplexService } from '../complex/complex.service';
import { SuperAdminService } from './super-admin.service';

const row = (
  id: string,
  courts: string[],
  overrides: Record<string, unknown> = {},
) => ({
  id,
  slug: `slug-${id}`,
  name: `Complejo ${id}`,
  timezone: BA,
  createdAt: NOW,
  suspendedAt: null,
  courts: courts.map((c) => ({ id: c })),
  ...overrides,
});

const proof = (courtId: string, status: PaymentProofStatus) => ({
  status,
  booking: { courtId },
});

describe('SuperAdminService', () => {
  let service: SuperAdminService;
  let complexModel: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  let booking: { groupBy: jest.Mock };
  let paymentProof: { findMany: jest.Mock };
  let invalidate: jest.Mock;

  beforeEach(async () => {
    complexModel = {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
    };
    booking = { groupBy: jest.fn().mockResolvedValue([]) };
    paymentProof = { findMany: jest.fn().mockResolvedValue([]) };
    invalidate = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuperAdminService,
        {
          provide: PrismaService,
          useValue: { complex: complexModel, booking, paymentProof },
        },
        { provide: Clock, useValue: new FixedClock(NOW) },
        { provide: ComplexService, useValue: { invalidate } },
      ],
    }).compile();
    service = moduleRef.get(SuperAdminService);
  });

  describe('listComplexes', () => {
    it('counts bookings and proofs per complex and computes the ratios', async () => {
      complexModel.findMany.mockResolvedValue([
        row('a', ['a1', 'a2']),
        row('b', ['b1']),
      ]);
      booking.groupBy.mockResolvedValue([
        { courtId: 'a1', _count: { _all: 3 } },
        { courtId: 'a2', _count: { _all: 1 } },
        { courtId: 'b1', _count: { _all: 2 } },
      ]);
      paymentProof.findMany.mockResolvedValue([
        proof('a1', PaymentProofStatus.APPROVED),
        proof('a1', PaymentProofStatus.REJECTED),
        proof('a2', PaymentProofStatus.APPROVED),
        proof('a2', PaymentProofStatus.PENDING),
        proof('b1', PaymentProofStatus.PENDING),
      ]);

      const result = await service.listComplexes('2026-09');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'a',
        month: '2026-09',
        bookingsCount: 4,
        proofsCount: 4,
        approvedProofsCount: 2,
        proofsPerBooking: 1,
        approvedProofsPerBooking: 0.5,
      });
      expect(result[1]).toMatchObject({
        id: 'b',
        bookingsCount: 2,
        proofsCount: 1,
        approvedProofsCount: 0,
        proofsPerBooking: 0.5,
        approvedProofsPerBooking: 0,
      });
    });

    it('returns null ratios (not NaN) when the complex has zero bookings', async () => {
      complexModel.findMany.mockResolvedValue([row('a', ['a1'])]);

      const [only] = await service.listComplexes('2026-09');

      expect(only).toMatchObject({
        bookingsCount: 0,
        proofsCount: 0,
        approvedProofsCount: 0,
        proofsPerBooking: null,
        approvedProofsPerBooking: null,
      });
    });

    it('handles a complex without courts', async () => {
      complexModel.findMany.mockResolvedValue([row('a', [])]);

      const [only] = await service.listComplexes('2026-09');

      expect(only.bookingsCount).toBe(0);
      expect(only.proofsPerBooking).toBeNull();
    });

    it('bounds the month in the complex timezone and excludes cancelled bookings', async () => {
      complexModel.findMany.mockResolvedValue([row('a', ['a1'])]);

      await service.listComplexes('2026-09');

      const args = booking.groupBy.mock.calls[0][0];
      expect(args.by).toEqual(['courtId']);
      expect(args.where.courtId).toEqual({ in: ['a1'] });
      expect(args.where.status).toEqual({ not: BookingStatus.CANCELLED });
      expect(args.where.startsAt.gte).toEqual(
        new Date('2026-09-01T00:00:00-03:00'),
      );
      expect(args.where.startsAt.lt).toEqual(
        new Date('2026-10-01T00:00:00-03:00'),
      );
      const proofWhere = paymentProof.findMany.mock.calls[0][0].where.booking;
      expect(proofWhere.status).toEqual({ not: BookingStatus.CANCELLED });
      expect(proofWhere.startsAt.gte).toEqual(
        new Date('2026-09-01T00:00:00-03:00'),
      );
    });

    it('runs one query batch per distinct timezone with that zone bounds', async () => {
      complexModel.findMany.mockResolvedValue([
        row('a', ['a1']),
        row('b', ['b1'], { timezone: 'Europe/Madrid' }),
      ]);
      booking.groupBy
        .mockResolvedValueOnce([{ courtId: 'a1', _count: { _all: 1 } }])
        .mockResolvedValueOnce([{ courtId: 'b1', _count: { _all: 5 } }]);

      const result = await service.listComplexes('2026-09');

      expect(booking.groupBy).toHaveBeenCalledTimes(2);
      expect(booking.groupBy.mock.calls[1][0].where.startsAt.gte).toEqual(
        new Date('2026-08-31T22:00:00Z'), // Madrid is UTC+2 in September
      );
      expect(result.map((r) => r.bookingsCount)).toEqual([1, 5]);
    });

    it('defaults to the current month in the complex timezone', async () => {
      complexModel.findMany.mockResolvedValue([row('a', ['a1'])]);

      const [only] = await service.listComplexes();

      expect(only.month).toBe('2026-09');
    });
  });

  describe('setSuspension', () => {
    it('suspends: stores suspendedAt, invalidates the complex cache and returns the summary', async () => {
      complexModel.findUnique.mockResolvedValue(row('a', ['a1']));
      complexModel.update.mockResolvedValue(
        row('a', ['a1'], { suspendedAt: NOW }),
      );

      const result = await service.setSuspension('a', true);

      expect(complexModel.update.mock.calls[0][0]).toMatchObject({
        where: { id: 'a' },
        data: { suspendedAt: NOW },
      });
      expect(invalidate).toHaveBeenCalledWith('a');
      expect(result).toMatchObject({ id: 'a', suspendedAt: NOW });
    });

    it('suspending an already suspended complex keeps the original date', async () => {
      const earlier = new Date('2026-08-01T00:00:00Z');
      complexModel.findUnique.mockResolvedValue(
        row('a', ['a1'], { suspendedAt: earlier }),
      );
      complexModel.update.mockResolvedValue(
        row('a', ['a1'], { suspendedAt: earlier }),
      );

      await service.setSuspension('a', true);

      expect(complexModel.update.mock.calls[0][0].data.suspendedAt).toBe(
        earlier,
      );
    });

    it('activates: clears suspendedAt', async () => {
      complexModel.findUnique.mockResolvedValue(
        row('a', ['a1'], { suspendedAt: NOW }),
      );
      complexModel.update.mockResolvedValue(row('a', ['a1']));

      const result = await service.setSuspension('a', false);

      expect(complexModel.update.mock.calls[0][0].data.suspendedAt).toBeNull();
      expect(invalidate).toHaveBeenCalledWith('a');
      expect(result.suspendedAt).toBeNull();
    });

    it('unknown complex → NOT_FOUND', async () => {
      complexModel.findUnique.mockResolvedValue(null);

      await expect(service.setSuspension('nope', true)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
      expect(complexModel.update).not.toHaveBeenCalled();
    });
  });
});
