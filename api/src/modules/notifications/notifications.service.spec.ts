import { Test } from '@nestjs/testing';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { Clock, FixedClock } from '../../shared/time/clock';
import { ComplexService } from '../complex/complex.service';
import {
  NOTIFICATIONS_LIST_LIMIT,
  NotificationsService,
} from './notifications.service';

const NOW = new Date('2026-09-12T15:00:00Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    complexId: 'c1',
    bookingId: 'b1',
    proofId: 'p1',
    type: 'PROOF_SUBMITTED',
    payerName: 'Juan',
    declaredAmount: 4000,
    createdAt: new Date('2026-09-12T14:00:00Z'),
    readAt: null,
    booking: {
      startsAt: new Date('2026-09-13T22:00:00Z'),
      price: 10000,
      court: { name: 'Pádel 1' },
      customer: { firstName: 'Ana', lastName: 'Gómez' },
      payments: [
        { amount: 3000, voidedAt: null },
        { amount: 9999, voidedAt: new Date('2026-09-12T10:00:00Z') },
      ],
    },
    ...overrides,
  };
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let findMany: jest.Mock;
  let count: jest.Mock;
  let findFirst: jest.Mock;
  let update: jest.Mock;
  let updateMany: jest.Mock;

  beforeEach(async () => {
    findMany = jest.fn().mockResolvedValue([row()]);
    count = jest.fn().mockResolvedValue(3);
    findFirst = jest.fn().mockResolvedValue(row());
    update = jest.fn().mockResolvedValue(row({ readAt: NOW }));
    updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: PrismaService,
          useValue: {
            notification: { findMany, count, findFirst, update, updateMany },
          },
        },
        {
          provide: ComplexService,
          useValue: {
            findByIdOrThrow: jest.fn().mockResolvedValue({
              timezone: 'America/Argentina/Buenos_Aires',
            }),
          },
        },
        { provide: Clock, useValue: new FixedClock(NOW) },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
  });

  describe('list', () => {
    it('returns the latest notifications of the complex, newest first, capped', async () => {
      await service.list('c1');
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { complexId: 'c1' },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: NOTIFICATIONS_LIST_LIMIT,
        }),
      );
      expect(NOTIFICATIONS_LIST_LIMIT).toBe(30);
    });

    it('serializes the booking summary with the complex timezone and payment balance', async () => {
      const [item] = await service.list('c1');
      expect(item).toEqual({
        id: 'n1',
        type: 'PROOF_SUBMITTED',
        bookingId: 'b1',
        proofId: 'p1',
        payerName: 'Juan',
        declaredAmount: 4000,
        createdAt: '2026-09-12T14:00:00.000Z',
        readAt: null,
        booking: {
          courtName: 'Pádel 1',
          startsAt: '2026-09-13T19:00:00-03:00',
          customerName: 'Ana Gómez',
          price: 10000,
          paidAmount: 3000,
          balance: 7000,
        },
      });
    });

    it('uses a null customer name for counter bookings and omits a missing last name', async () => {
      findMany.mockResolvedValue([
        row({ booking: { ...row().booking, customer: null } }),
        row({
          booking: {
            ...row().booking,
            customer: { firstName: 'Beto', lastName: null },
          },
        }),
      ]);
      const items = await service.list('c1');
      expect(items[0].booking.customerName).toBeNull();
      expect(items[1].booking.customerName).toBe('Beto');
    });
  });

  describe('unreadCount', () => {
    it('counts the unread notifications of the complex only', async () => {
      expect(await service.unreadCount('c1')).toEqual({ count: 3 });
      expect(count).toHaveBeenCalledWith({
        where: { complexId: 'c1', readAt: null },
      });
    });
  });

  describe('markRead', () => {
    it('marks an unread notification as read at the clock time', async () => {
      const result = await service.markRead('c1', 'n1');
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'n1', complexId: 'c1' } }),
      );
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'n1' }, data: { readAt: NOW } }),
      );
      expect(result.readAt).toBe(NOW.toISOString());
    });

    it('is idempotent: an already read notification keeps its readAt', async () => {
      const earlier = new Date('2026-09-12T14:30:00Z');
      findFirst.mockResolvedValue(row({ readAt: earlier }));
      const result = await service.markRead('c1', 'n1');
      expect(update).not.toHaveBeenCalled();
      expect(result.readAt).toBe(earlier.toISOString());
    });

    it('404s a notification of another complex', async () => {
      findFirst.mockResolvedValue(null);
      const error = await service.markRead('c1', 'other').catch((e) => e);
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe(ErrorCode.NOT_FOUND);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('markAllRead', () => {
    it('marks only the unread ones of the complex', async () => {
      expect(await service.markAllRead('c1')).toEqual({ updated: 2 });
      expect(updateMany).toHaveBeenCalledWith({
        where: { complexId: 'c1', readAt: null },
        data: { readAt: NOW },
      });
    });
  });
});
