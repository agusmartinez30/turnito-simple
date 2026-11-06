import { Injectable } from '@nestjs/common';
import { BookingStatus, Customer, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { customerWhere } from '../../shared/customers/customer-search';
import { isUniqueViolationOn } from '../../shared/prisma-errors';
import { CustomerAggregates } from '../../shared/serializers/customer.serializer';
import {
  BOOKING_INCLUDE,
  BookingWithRelations,
} from '../../shared/serializers/booking.serializer';
import {
  CUSTOMER_MESSAGES,
  CustomersService,
} from '../customers/customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

export const ADMIN_CUSTOMER_MESSAGES = {
  validation: 'Revisá los datos ingresados.',
  noChanges: 'No hay cambios',
};

/** Cuántos turnos del historial trae la ficha. */
const HISTORY_LIMIT = 20;

export interface CustomerWithAggregates {
  customer: Customer;
  aggregates: CustomerAggregates;
}

export interface CustomerStats {
  bookings: { confirmed: number; pending: number; cancelled: number };
  billed: number;
  paid: number;
  balance: number;
}

export interface CustomerDetail extends CustomerWithAggregates {
  stats: CustomerStats;
  bookings: BookingWithRelations[];
}

/**
 * Listado y ficha de clientes del panel (docs/17-admin-customers.md).
 * El alta / edición y las búsquedas puntuales viven en `CustomersService`, que además
 * comparten la reserva manual, el turno fijo y el pedido público.
 */
@Injectable()
export class AdminCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
  ) {}

  /**
   * Dos queries fijas, sin N+1: la página de clientes con su `_count` de turnos, y un
   * `groupBy` acotado a los ids de esa página para el último turno.
   */
  async list(
    complexId: string,
    query: ListCustomersDto,
  ): Promise<CustomerWithAggregates[]> {
    const where: Prisma.CustomerWhereInput = {
      complexId,
      ...(query.status === 'all'
        ? {}
        : { isActive: query.status === 'active' }),
      ...(query.q ? customerWhere(query.q) : {}),
    };

    const customers = await this.prisma.customer.findMany({
      where,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: query.limit,
      include: {
        _count: {
          select: {
            bookings: { where: { status: { not: BookingStatus.CANCELLED } } },
          },
        },
      },
    });
    if (customers.length === 0) return [];

    const lastByCustomer = await this.prisma.booking.groupBy({
      by: ['customerId'],
      where: {
        customerId: { in: customers.map((c) => c.id) },
        status: { not: BookingStatus.CANCELLED },
      },
      _max: { startsAt: true },
    });
    const lastBookingAt = new Map(
      lastByCustomer.map((row) => [row.customerId, row._max.startsAt]),
    );

    return customers.map(({ _count, ...customer }) => ({
      customer,
      aggregates: {
        bookingsCount: _count.bookings,
        lastBookingAt: lastBookingAt.get(customer.id) ?? null,
      },
    }));
  }

  /** Ficha: cuatro queries en paralelo, todas indexadas por `customer_id`. */
  async detail(complexId: string, id: string): Promise<CustomerDetail> {
    const customer = await this.customers.findOrThrow(complexId, id);

    const [byStatus, paidSum, bookings] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ['status'],
        where: { customerId: id },
        _count: { _all: true },
        _sum: { price: true },
      }),
      this.prisma.payment.aggregate({
        where: { voidedAt: null, booking: { customerId: id } },
        _sum: { amount: true },
      }),
      this.prisma.booking.findMany({
        where: { customerId: id },
        orderBy: { startsAt: 'desc' },
        take: HISTORY_LIMIT,
        include: BOOKING_INCLUDE,
      }),
    ]);

    const countOf = (status: BookingStatus) =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;
    // Facturado = solo las confirmadas: un PENDING todavía no se debe, un CANCELLED tampoco.
    const billed =
      byStatus.find((row) => row.status === BookingStatus.CONFIRMED)?._sum
        .price ?? 0;
    // Pagado = todos los pagos vigentes, incluso los de una reserva después cancelada.
    const paid = paidSum._sum.amount ?? 0;

    return {
      customer,
      aggregates: {
        bookingsCount:
          countOf(BookingStatus.CONFIRMED) + countOf(BookingStatus.PENDING),
        // Dentro del historial traído; coherente con el listado, que tampoco cuenta canceladas.
        lastBookingAt:
          bookings.find((b) => b.status !== BookingStatus.CANCELLED)
            ?.startsAt ?? null,
      },
      stats: {
        bookings: {
          confirmed: countOf(BookingStatus.CONFIRMED),
          pending: countOf(BookingStatus.PENDING),
          cancelled: countOf(BookingStatus.CANCELLED),
        },
        billed,
        paid,
        balance: billed - paid,
      },
      bookings,
    };
  }

  async create(
    complexId: string,
    adminId: string,
    dto: CreateCustomerDto,
  ): Promise<CustomerWithAggregates> {
    try {
      const customer = await this.prisma.customer.create({
        data: { ...dto, complexId, createdById: adminId },
      });
      return { customer, aggregates: emptyAggregates() };
    } catch (err) {
      this.rethrowPhoneConflict(err);
    }
  }

  async update(
    complexId: string,
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerWithAggregates> {
    const data = toUpdateData(dto);
    if (Object.keys(data).length === 0) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        ADMIN_CUSTOMER_MESSAGES.validation,
        { _: [ADMIN_CUSTOMER_MESSAGES.noChanges] },
      );
    }
    await this.customers.findOrThrow(complexId, id);
    try {
      const customer = await this.prisma.customer.update({
        where: { id },
        data,
      });
      const [bookingsCount, last] = await Promise.all([
        this.prisma.booking.count({
          where: { customerId: id, status: { not: BookingStatus.CANCELLED } },
        }),
        this.prisma.booking.findFirst({
          where: { customerId: id, status: { not: BookingStatus.CANCELLED } },
          orderBy: { startsAt: 'desc' },
          select: { startsAt: true },
        }),
      ]);
      return {
        customer,
        aggregates: { bookingsCount, lastBookingAt: last?.startsAt ?? null },
      };
    } catch (err) {
      this.rethrowPhoneConflict(err);
    }
  }

  /** El unique `(complex_id, phone)` es la única forma de saber que el teléfono ya estaba. */
  private rethrowPhoneConflict(err: unknown): never {
    if (isUniqueViolationOn(err, 'phone')) {
      throw new AppException(
        ErrorCode.CUSTOMER_PHONE_ALREADY_EXISTS,
        CUSTOMER_MESSAGES.phoneExists,
      );
    }
    throw err;
  }
}

function emptyAggregates(): CustomerAggregates {
  return { bookingsCount: 0, lastBookingAt: null };
}

/** Copia solo las claves presentes: `undefined` no toca el campo, `null` lo borra. */
function toUpdateData(dto: UpdateCustomerDto): Prisma.CustomerUpdateInput {
  const data: Prisma.CustomerUpdateInput = {};
  if (dto.firstName !== undefined) data.firstName = dto.firstName;
  if (dto.lastName !== undefined) data.lastName = dto.lastName;
  if (dto.phone !== undefined) data.phone = dto.phone;
  if (dto.note !== undefined) data.note = dto.note;
  if (dto.isActive !== undefined) data.isActive = dto.isActive;
  return data;
}
