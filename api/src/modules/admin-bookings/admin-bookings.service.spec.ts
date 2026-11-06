import { Test } from '@nestjs/testing';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingCore } from '../../shared/bookings/booking-core';
import { BOOKING_INCLUDE } from '../../shared/serializers/booking.serializer';
import {
  bookingFixture,
  complexFixture,
  courtFixture,
  customerFixture,
  NOW,
} from '../../shared/testing/fixtures';
import { Clock, FixedClock } from '../../shared/time/clock';
import { ComplexService } from '../complex/complex.service';
import { CourtsService } from '../courts/courts.service';
import { CustomersService } from '../customers/customers.service';
import { AdminBookingsService } from './admin-bookings.service';
import { ListAdminBookingsDto } from './dto/list-admin-bookings.dto';

const ADMIN = 'u-admin';
const court = courtFixture();
const customer = customerFixture();

describe('AdminBookingsService', () => {
  let service: AdminBookingsService;
  let clock: FixedClock;
  let booking: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  let findCustomer: jest.Mock;
  let findActiveOrThrow: jest.Mock;

  beforeEach(async () => {
    clock = new FixedClock(NOW);
    booking = {
      create: jest.fn().mockResolvedValue(bookingFixture()),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue(bookingFixture({ status: 'CANCELLED' })),
    };
    findCustomer = jest.fn().mockResolvedValue(customer);
    findActiveOrThrow = jest.fn().mockResolvedValue(court);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminBookingsService,
        BookingCore,
        { provide: PrismaService, useValue: { booking } },
        { provide: CourtsService, useValue: { findActiveOrThrow } },
        {
          provide: ComplexService,
          useValue: {
            findByIdOrThrow: () => Promise.resolve(complexFixture),
          },
        },
        {
          provide: CustomersService,
          useValue: { findActiveOrThrow: findCustomer },
        },
        { provide: Clock, useValue: clock },
      ],
    }).compile();
    service = moduleRef.get(AdminBookingsService);
  });

  const createdData = () =>
    (booking.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;

  describe('create', () => {
    const t17 = '2026-09-13T17:00:00-03:00';

    it('cliente inexistente o de otro complejo → NOT_FOUND antes de tocar la cancha', async () => {
      findCustomer.mockRejectedValue(
        new AppException(ErrorCode.NOT_FOUND, 'Cliente no encontrado.'),
      );
      await expect(
        service.create(complexFixture.id, ADMIN, {
          courtId: court.id,
          startsAt: t17,
          customerId: 'ghost',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: 'Cliente no encontrado.',
      });
      expect(findActiveOrThrow).not.toHaveBeenCalled();
    });

    it('cliente archivado → CUSTOMER_ARCHIVED (lo resuelve CustomersService)', async () => {
      findCustomer.mockRejectedValue(
        new AppException(
          ErrorCode.CUSTOMER_ARCHIVED,
          'Ese cliente está archivado.',
        ),
      );
      await expect(
        service.create(complexFixture.id, ADMIN, {
          courtId: court.id,
          startsAt: t17,
          customerId: customer.id,
        }),
      ).rejects.toMatchObject({ code: ErrorCode.CUSTOMER_ARCHIVED });
    });

    it('cuelga del cliente, source ADMIN, createdById y price de lista', async () => {
      await service.create(complexFixture.id, ADMIN, {
        courtId: court.id,
        startsAt: t17,
        customerId: customer.id,
      });
      expect(findCustomer).toHaveBeenCalledWith(complexFixture.id, customer.id);
      expect(createdData()).toEqual({
        courtId: court.id,
        customerId: customer.id,
        startsAt: new Date('2026-09-13T20:00:00.000Z'),
        endsAt: new Date('2026-09-13T21:30:00.000Z'),
        price: 12000,
        source: 'ADMIN',
        note: null,
        createdById: ADMIN,
        status: 'CONFIRMED',
      });
    });

    it('sin cliente: no consulta clientes, inserta customerId null', async () => {
      await service.create(complexFixture.id, ADMIN, {
        courtId: court.id,
        startsAt: t17,
      });
      expect(findCustomer).not.toHaveBeenCalled();
      expect(createdData()).toMatchObject({
        courtId: court.id,
        customerId: null,
        startsAt: new Date('2026-09-13T20:00:00.000Z'),
        endsAt: new Date('2026-09-13T21:30:00.000Z'),
        price: 12000,
        source: 'ADMIN',
        note: null,
        createdById: ADMIN,
        status: 'CONFIRMED',
      });
    });

    it('price override y note', async () => {
      await service.create(complexFixture.id, ADMIN, {
        courtId: court.id,
        startsAt: t17,
        customerId: customer.id,
        price: 8000,
        note: 'Trae 4',
      });
      expect(createdData()).toMatchObject({
        customerId: customer.id,
        price: 8000,
        note: 'Trae 4',
      });
    });

    it('sin ventana de días: hoy + 60 → OK; pasado → BOOKING_IN_PAST', async () => {
      await expect(
        service.create(complexFixture.id, ADMIN, {
          courtId: court.id,
          startsAt: '2026-11-11T17:00:00-03:00',
          customerId: customer.id,
        }),
      ).resolves.toBeDefined();
      await expect(
        service.create(complexFixture.id, ADMIN, {
          courtId: court.id,
          startsAt: '2026-09-12T14:00:00-03:00',
          customerId: customer.id,
        }),
      ).rejects.toMatchObject({ code: ErrorCode.BOOKING_IN_PAST });
    });
  });

  describe('confirm', () => {
    const id = bookingFixture().id;
    const pending = () =>
      bookingFixture({
        status: 'PENDING',
        source: 'PUBLIC',
        customer: customerFixture({ firstName: 'Carlos', lastName: null }),
        expiresAt: new Date(NOW.getTime() + 3_600_000),
      });

    it('PENDING vigente → CONFIRMED con confirmedAt/confirmedById y expiresAt null', async () => {
      booking.findFirst.mockResolvedValue(pending());
      booking.findUniqueOrThrow.mockResolvedValue(
        bookingFixture({ status: 'CONFIRMED' }),
      );
      const result = await service.confirm(complexFixture.id, ADMIN, id);
      expect(result.status).toBe('CONFIRMED');
      expect(booking.updateMany).toHaveBeenCalledWith({
        where: { id, status: 'PENDING' },
        data: {
          status: 'CONFIRMED',
          confirmedAt: NOW,
          confirmedById: ADMIN,
          expiresAt: null,
        },
      });
    });

    it('CONFIRMED, CANCELLED o vencida → BOOKING_NOT_PENDING sin escribir', async () => {
      for (const b of [
        bookingFixture({ status: 'CONFIRMED' }),
        bookingFixture({ status: 'CANCELLED', cancelledAt: NOW }),
        { ...pending(), expiresAt: new Date(NOW.getTime() - 1) },
      ]) {
        booking.findFirst.mockResolvedValue(b);
        await expect(
          service.confirm(complexFixture.id, ADMIN, id),
        ).rejects.toMatchObject({
          code: ErrorCode.BOOKING_NOT_PENDING,
          message: 'La solicitud ya no está pendiente.',
        });
      }
      expect(booking.updateMany).not.toHaveBeenCalled();
    });

    it('count === 0 (carrera) → BOOKING_NOT_PENDING; inexistente → NOT_FOUND', async () => {
      booking.findFirst.mockResolvedValue(pending());
      booking.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.confirm(complexFixture.id, ADMIN, id),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_NOT_PENDING,
      });
      booking.findFirst.mockResolvedValue(null);
      await expect(
        service.confirm(complexFixture.id, ADMIN, id),
      ).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('cancel acepta una PENDING (rechazo) y la marca como cancelada por el admin', async () => {
      booking.findFirst.mockResolvedValue(pending());
      await service.cancel(complexFixture.id, ADMIN, id, 'Sin lugar');
      expect(booking.updateMany).toHaveBeenCalledWith({
        where: { id, status: { in: ['CONFIRMED', 'PENDING'] } },
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledById: ADMIN,
          cancellationReason: 'Sin lugar',
          expiresAt: null,
        }),
      });
    });
  });

  describe('start', () => {
    const id = bookingFixture().id;
    // NOW es 2026-09-12 12:00 -03: el fixture (13/09) no es de hoy.
    const today = (overrides: Parameters<typeof bookingFixture>[0] = {}) =>
      bookingFixture({
        startsAt: new Date('2026-09-12T17:00:00-03:00'),
        endsAt: new Date('2026-09-12T18:30:00-03:00'),
        ...overrides,
      });

    it('CONFIRMED de hoy → setea startedAt/startedById y devuelve el detalle', async () => {
      booking.findFirst.mockResolvedValue(today());
      booking.findUniqueOrThrow.mockResolvedValue(
        bookingFixture({ startedAt: NOW, startedById: ADMIN }),
      );
      const result = await service.start(complexFixture.id, ADMIN, id);
      expect(result.startedAt).toEqual(NOW);
      expect(booking.updateMany).toHaveBeenCalledWith({
        where: { id, status: 'CONFIRMED', startedAt: null },
        data: { startedAt: NOW, startedById: ADMIN },
      });
    });

    it('PENDING o CANCELLED → BOOKING_NOT_CONFIRMED; ya iniciada → BOOKING_ALREADY_STARTED; sin escribir', async () => {
      for (const [b, code] of [
        [today({ status: 'PENDING' }), ErrorCode.BOOKING_NOT_CONFIRMED],
        [
          { ...today(), status: 'CANCELLED', cancelledAt: NOW },
          ErrorCode.BOOKING_NOT_CONFIRMED,
        ],
        [{ ...today(), startedAt: NOW }, ErrorCode.BOOKING_ALREADY_STARTED],
      ] as const) {
        booking.findFirst.mockResolvedValue(b);
        await expect(
          service.start(complexFixture.id, ADMIN, id),
        ).rejects.toMatchObject({ code });
      }
      expect(booking.updateMany).not.toHaveBeenCalled();
    });

    it('de otro día (mañana o ayer, día local) → BOOKING_NOT_TODAY', async () => {
      for (const b of [
        bookingFixture(), // 13/09
        bookingFixture({
          startsAt: new Date('2026-09-11T23:30:00-03:00'),
          endsAt: new Date('2026-09-12T01:00:00-03:00'),
        }),
      ]) {
        booking.findFirst.mockResolvedValue(b);
        await expect(
          service.start(complexFixture.id, ADMIN, id),
        ).rejects.toMatchObject({
          code: ErrorCode.BOOKING_NOT_TODAY,
          message: 'Solo se puede iniciar un turno del día de hoy.',
        });
      }
      expect(booking.updateMany).not.toHaveBeenCalled();
    });

    it('count === 0 (carrera) → BOOKING_ALREADY_STARTED; inexistente → NOT_FOUND', async () => {
      booking.findFirst.mockResolvedValue(today());
      booking.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.start(complexFixture.id, ADMIN, id),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_ALREADY_STARTED,
      });
      booking.findFirst.mockResolvedValue(null);
      await expect(
        service.start(complexFixture.id, ADMIN, id),
      ).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });
  });

  describe('finish', () => {
    const id = bookingFixture().id;
    const started = (overrides: Parameters<typeof bookingFixture>[0] = {}) =>
      bookingFixture({
        startedAt: new Date(NOW.getTime() - 30 * 60_000),
        startedById: ADMIN,
        ...overrides,
      });

    it('iniciada → setea finishedAt/finishedById y devuelve el detalle', async () => {
      booking.findFirst.mockResolvedValue(started());
      booking.findUniqueOrThrow.mockResolvedValue(
        started({ finishedAt: NOW, finishedById: ADMIN }),
      );
      const result = await service.finish(complexFixture.id, ADMIN, id);
      expect(result.finishedAt).toEqual(NOW);
      expect(booking.updateMany).toHaveBeenCalledWith({
        where: {
          id,
          status: 'CONFIRMED',
          startedAt: { not: null },
          finishedAt: null,
        },
        data: { finishedAt: NOW, finishedById: ADMIN },
      });
    });

    it('sin iniciar o no confirmada → BOOKING_NOT_STARTED; ya finalizada → BOOKING_ALREADY_FINISHED; sin escribir', async () => {
      for (const [b, code] of [
        [bookingFixture(), ErrorCode.BOOKING_NOT_STARTED],
        [
          started({ status: 'CANCELLED', cancelledAt: NOW }),
          ErrorCode.BOOKING_NOT_STARTED,
        ],
        [started({ finishedAt: NOW }), ErrorCode.BOOKING_ALREADY_FINISHED],
      ] as const) {
        booking.findFirst.mockResolvedValue(b);
        await expect(
          service.finish(complexFixture.id, ADMIN, id),
        ).rejects.toMatchObject({
          code,
        });
      }
      expect(booking.updateMany).not.toHaveBeenCalled();
    });

    it('count === 0 (carrera) → BOOKING_ALREADY_FINISHED; inexistente → NOT_FOUND', async () => {
      booking.findFirst.mockResolvedValue(started());
      booking.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.finish(complexFixture.id, ADMIN, id),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_ALREADY_FINISHED,
      });
      booking.findFirst.mockResolvedValue(null);
      await expect(
        service.finish(complexFixture.id, ADMIN, id),
      ).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });
  });

  describe('cancel', () => {
    const id = bookingFixture().id;

    it('con 1 h de anticipación → OK, setea cancelledById y cancellationReason', async () => {
      booking.findFirst.mockResolvedValue(
        bookingFixture({
          startsAt: new Date('2026-09-12T16:00:00-03:00'),
          endsAt: new Date('2026-09-12T17:30:00-03:00'),
        }),
      );
      await service.cancel(complexFixture.id, ADMIN, id, 'Llamó');
      expect(booking.updateMany).toHaveBeenCalledWith({
        where: { id, status: { in: ['CONFIRMED', 'PENDING'] } },
        data: {
          status: 'CANCELLED',
          cancelledAt: NOW,
          cancelledById: ADMIN,
          cancellationReason: 'Llamó',
          expiresAt: null,
        },
      });
    });

    it('sin motivo → cancellationReason null', async () => {
      booking.findFirst.mockResolvedValue(bookingFixture());
      await service.cancel(complexFixture.id, ADMIN, id);
      expect(
        (
          booking.updateMany.mock.calls[0][0] as {
            data: { cancellationReason: unknown };
          }
        ).data.cancellationReason,
      ).toBeNull();
    });

    it('endsAt <= now → BOOKING_ALREADY_FINISHED; en curso → OK', async () => {
      booking.findFirst.mockResolvedValue(
        bookingFixture({
          startsAt: new Date('2026-09-12T13:30:00-03:00'),
          endsAt: new Date('2026-09-12T15:00:00-03:00'),
        }),
      );
      await expect(
        service.cancel(complexFixture.id, ADMIN, id),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_ALREADY_FINISHED,
        message: 'Ese turno ya terminó.',
      });
      expect(booking.updateMany).not.toHaveBeenCalled();

      booking.findFirst.mockResolvedValue(
        bookingFixture({
          startsAt: new Date('2026-09-12T14:30:00-03:00'),
          endsAt: new Date('2026-09-12T16:00:00-03:00'),
        }),
      );
      await expect(
        service.cancel(complexFixture.id, ADMIN, id),
      ).resolves.toBeDefined();
    });

    it('ya cancelada → BOOKING_ALREADY_CANCELLED; count 0 (carrera) → BOOKING_ALREADY_CANCELLED; inexistente → NOT_FOUND', async () => {
      booking.findFirst.mockResolvedValue(
        bookingFixture({ status: 'CANCELLED', cancelledAt: NOW }),
      );
      await expect(
        service.cancel(complexFixture.id, ADMIN, id),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_ALREADY_CANCELLED,
      });

      booking.findFirst.mockResolvedValue(bookingFixture());
      booking.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.cancel(complexFixture.id, ADMIN, id),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_ALREADY_CANCELLED,
      });

      booking.findFirst.mockResolvedValue(null);
      const err = await service
        .cancel(complexFixture.id, ADMIN, id)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.NOT_FOUND);
    });
  });

  describe('list', () => {
    const query = (q: Partial<ListAdminBookingsDto>): ListAdminBookingsDto =>
      Object.assign(new ListAdminBookingsDto(), q);
    const lastCall = () =>
      booking.findMany.mock.calls[0][0] as {
        where: unknown;
        orderBy: unknown;
        take: number;
      };

    it('date → rango [00:00, 24:00) local, ignora from/to, orden asc', async () => {
      await service.list(
        complexFixture.id,
        query({
          date: '2026-09-13',
          from: '2020-01-01T00:00:00Z',
          to: '2020-01-02T00:00:00Z',
        }),
      );
      expect(lastCall()).toMatchObject({
        where: {
          AND: [
            { court: { complexId: complexFixture.id } },
            {
              startsAt: {
                gte: new Date('2026-09-13T03:00:00.000Z'),
                lt: new Date('2026-09-14T03:00:00.000Z'),
              },
            },
          ],
        },
        orderBy: { startsAt: 'asc' },
        take: 100,
      });
    });

    it('q → OR sobre firstName/lastName/phone del cliente, insensitive; sin filtros → desc', async () => {
      await service.list(complexFixture.id, query({ q: 'car%los' }));
      const contains = { contains: 'car%los', mode: 'insensitive' };
      expect(lastCall()).toMatchObject({
        where: {
          AND: [
            { court: { complexId: complexFixture.id } },
            {
              customer: {
                is: {
                  AND: [
                    {
                      OR: [
                        { firstName: contains },
                        { lastName: contains },
                        { phone: contains },
                      ],
                    },
                  ],
                },
              },
            },
          ],
        },
        orderBy: { startsAt: 'desc' },
      });
    });

    it('from → endsAt > from y orden asc; courtId/status/limit se aplican; order explícito gana', async () => {
      await service.list(
        complexFixture.id,
        query({
          from: '2026-09-12T18:00:00Z',
          courtId: court.id,
          status: 'CONFIRMED',
          limit: 5,
          order: 'desc',
        }),
      );
      expect(lastCall()).toEqual({
        where: {
          AND: [
            { court: { complexId: complexFixture.id } },
            { endsAt: { gt: new Date('2026-09-12T18:00:00Z') } },
            { courtId: court.id },
            { status: 'CONFIRMED' },
          ],
        },
        orderBy: { startsAt: 'desc' },
        take: 5,
        include: BOOKING_INCLUDE,
      });
    });

    it('sin ningún filtro → solo el scope del complejo', async () => {
      await service.list(complexFixture.id, query({}));
      expect(lastCall().where).toEqual({
        AND: [{ court: { complexId: complexFixture.id } }],
      });
    });
  });
});
