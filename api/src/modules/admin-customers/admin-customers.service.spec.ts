import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { complexFixture, customerFixture } from '../../shared/testing/fixtures';
import { CustomersService } from '../customers/customers.service';
import { AdminCustomersService } from './admin-customers.service';
import { ListCustomersDto } from './dto/list-customers.dto';

const ADMIN = 'u-admin';
const base = customerFixture();

const query = (
  overrides: Partial<ListCustomersDto> = {},
): ListCustomersDto => ({ status: 'active', limit: 100, ...overrides });

const uniqueErr = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6',
    meta: { target: ['complex_id', 'phone'] },
  });

describe('AdminCustomersService', () => {
  let service: AdminCustomersService;
  let customer: {
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  let booking: {
    groupBy: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    findFirst: jest.Mock;
  };
  let payment: { aggregate: jest.Mock };
  let findOrThrow: jest.Mock;

  beforeEach(async () => {
    customer = {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(base),
      update: jest.fn().mockResolvedValue(base),
    };
    booking = {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    };
    payment = { aggregate: jest.fn().mockResolvedValue({ _sum: {} }) };
    findOrThrow = jest.fn().mockResolvedValue(base);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminCustomersService,
        {
          provide: PrismaService,
          useValue: { customer, booking, payment },
        },
        { provide: CustomersService, useValue: { findOrThrow } },
      ],
    }).compile();
    service = moduleRef.get(AdminCustomersService);
  });

  describe('list', () => {
    it('por defecto solo los activos, ordenados por nombre', async () => {
      await service.list(complexFixture.id, query());
      expect(customer.findMany.mock.calls[0][0]).toMatchObject({
        where: { complexId: complexFixture.id, isActive: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        take: 100,
      });
    });

    it('status archived / all cambian o sacan el filtro', async () => {
      await service.list(complexFixture.id, query({ status: 'archived' }));
      expect(customer.findMany.mock.calls[0][0].where.isActive).toBe(false);

      customer.findMany.mockClear();
      await service.list(complexFixture.id, query({ status: 'all' }));
      expect(customer.findMany.mock.calls[0][0].where).not.toHaveProperty(
        'isActive',
      );
    });

    it('sin resultados no dispara el groupBy del último turno', async () => {
      await expect(service.list(complexFixture.id, query())).resolves.toEqual(
        [],
      );
      expect(booking.groupBy).not.toHaveBeenCalled();
    });

    it('arma los agregados en dos queries, sin N+1', async () => {
      customer.findMany.mockResolvedValue([
        { ...base, _count: { bookings: 3 } },
        { ...base, id: 'c2', _count: { bookings: 0 } },
      ]);
      const last = new Date('2026-09-13T20:00:00.000Z');
      booking.groupBy.mockResolvedValue([
        { customerId: base.id, _max: { startsAt: last } },
      ]);

      const rows = await service.list(complexFixture.id, query());

      expect(booking.groupBy).toHaveBeenCalledTimes(1);
      expect(rows[0].aggregates).toEqual({
        bookingsCount: 3,
        lastBookingAt: last,
      });
      // El que nunca reservó no aparece en el groupBy.
      expect(rows[1].aggregates).toEqual({
        bookingsCount: 0,
        lastBookingAt: null,
      });
      expect(rows[0].customer).not.toHaveProperty('_count');
    });
  });

  describe('detail', () => {
    it('facturado = solo CONFIRMED; pagado = pagos vigentes; saldo = la resta', async () => {
      booking.groupBy.mockResolvedValue([
        { status: 'CONFIRMED', _count: { _all: 2 }, _sum: { price: 24000 } },
        { status: 'PENDING', _count: { _all: 1 }, _sum: { price: 12000 } },
        { status: 'CANCELLED', _count: { _all: 3 }, _sum: { price: 36000 } },
      ]);
      payment.aggregate.mockResolvedValue({ _sum: { amount: 9000 } });

      const detail = await service.detail(complexFixture.id, base.id);

      expect(detail.stats).toEqual({
        bookings: { confirmed: 2, pending: 1, cancelled: 3 },
        billed: 24000,
        paid: 9000,
        balance: 15000,
      });
    });

    it('saldo negativo = a favor', async () => {
      booking.groupBy.mockResolvedValue([
        { status: 'CONFIRMED', _count: { _all: 1 }, _sum: { price: 10000 } },
      ]);
      payment.aggregate.mockResolvedValue({ _sum: { amount: 12000 } });
      const detail = await service.detail(complexFixture.id, base.id);
      expect(detail.stats.balance).toBe(-2000);
    });

    it('sin turnos ni pagos, todo en cero', async () => {
      const detail = await service.detail(complexFixture.id, base.id);
      expect(detail.stats).toEqual({
        bookings: { confirmed: 0, pending: 0, cancelled: 0 },
        billed: 0,
        paid: 0,
        balance: 0,
      });
      expect(detail.aggregates.lastBookingAt).toBeNull();
    });

    it('un cliente de otro complejo es 404 (lo resuelve CustomersService)', async () => {
      findOrThrow.mockRejectedValue(new Error('404'));
      await expect(
        service.detail(complexFixture.id, 'ajeno'),
      ).rejects.toThrow();
      expect(booking.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('guarda el complejo y quién lo cargó', async () => {
      await service.create(complexFixture.id, ADMIN, { firstName: 'Carlos' });
      expect(customer.create).toHaveBeenCalledWith({
        data: {
          firstName: 'Carlos',
          complexId: complexFixture.id,
          createdById: ADMIN,
        },
      });
    });

    it('teléfono repetido → CUSTOMER_PHONE_ALREADY_EXISTS', async () => {
      customer.create.mockRejectedValue(uniqueErr());
      await expect(
        service.create(complexFixture.id, ADMIN, {
          firstName: 'Carlos',
          phone: '+5491100000077',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.CUSTOMER_PHONE_ALREADY_EXISTS,
        message: 'Ya hay un cliente con ese teléfono.',
      });
    });
  });

  describe('update', () => {
    it('body vacío → VALIDATION_ERROR sin tocar la DB', async () => {
      await expect(
        service.update(complexFixture.id, base.id, {}),
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
        details: { _: ['No hay cambios'] },
      });
      expect(findOrThrow).not.toHaveBeenCalled();
      expect(customer.update).not.toHaveBeenCalled();
    });

    it('copia solo lo presente; null borra el valor', async () => {
      await service.update(complexFixture.id, base.id, {
        lastName: null,
        isActive: false,
      });
      expect(customer.update).toHaveBeenCalledWith({
        where: { id: base.id },
        data: { lastName: null, isActive: false },
      });
    });

    it('valida el complejo antes de escribir', async () => {
      findOrThrow.mockRejectedValue(new Error('404'));
      await expect(
        service.update(complexFixture.id, 'ajeno', { firstName: 'X' }),
      ).rejects.toThrow();
      expect(customer.update).not.toHaveBeenCalled();
    });
  });
});
