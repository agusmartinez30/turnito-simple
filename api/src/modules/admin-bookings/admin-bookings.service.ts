import { Injectable } from '@nestjs/common';
import { BookingSource, BookingStatus, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ACTIVE_STATUSES,
  BookingCore,
} from '../../shared/bookings/booking-core';
import { customerSearch } from '../../shared/customers/customer-search';
import {
  BOOKING_DETAIL_INCLUDE,
  BOOKING_INCLUDE,
  BookingWithPayments,
  BookingWithRelations,
} from '../../shared/serializers/booking.serializer';
import { Clock } from '../../shared/time/clock';
import {
  addLocalDays,
  localDateInTz,
  localTimeToUtc,
  todayInTz,
} from '../../shared/time/tz';
import { ComplexService } from '../complex/complex.service';
import { CourtsService } from '../courts/courts.service';
import { CustomersService } from '../customers/customers.service';
import { CreateAdminBookingDto } from './dto/create-admin-booking.dto';
import { ListAdminBookingsDto } from './dto/list-admin-bookings.dto';

export const ADMIN_BOOKING_MESSAGES = {
  notFound: 'Reserva no encontrada.',
  alreadyCancelled: 'Esta reserva ya fue cancelada.',
  alreadyFinished: 'Ese turno ya terminó.',
  notPending: 'La solicitud ya no está pendiente.',
  notConfirmed: 'Solo se puede iniciar un turno confirmado.',
  alreadyStarted: 'Ese turno ya fue iniciado.',
  notToday: 'Solo se puede iniciar un turno del día de hoy.',
  notStarted: 'Ese turno todavía no fue iniciado.',
};

/** Reservas vistas por el admin (docs/06-admin-bookings.md). */
@Injectable()
export class AdminBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courts: CourtsService,
    private readonly complex: ComplexService,
    private readonly customers: CustomersService,
    private readonly clock: Clock,
    private readonly core: BookingCore,
  ) {}

  /** Sin BOOKING_MAX_DAYS_AHEAD; sí "no en el pasado" y "inicio exacto de slot". */
  async create(
    complexId: string,
    adminId: string,
    dto: CreateAdminBookingDto,
  ): Promise<BookingWithRelations> {
    const customer = dto.customerId
      ? await this.customers.findActiveOrThrow(complexId, dto.customerId)
      : null;
    const court = await this.courts.findActiveOrThrow(dto.courtId, complexId);
    const complex = await this.complex.findByIdOrThrow(complexId);

    const now = this.clock.now();
    const slot = this.core.assertSlotBookable({
      court,
      complex,
      startsAt: new Date(dto.startsAt),
      now,
      enforceWindow: false,
      maxDaysAhead: 0,
    });

    const booking = await this.core.insertConfirmed(
      {
        courtId: court.id,
        customerId: customer?.id ?? null,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        price: dto.price ?? court.pricePerSlot,
        source: BookingSource.ADMIN,
        note: dto.note ?? null,
        createdById: adminId,
      },
      now,
    );
    return booking;
  }

  async list(
    complexId: string,
    query: ListAdminBookingsDto,
  ): Promise<BookingWithRelations[]> {
    const conditions: Prisma.BookingWhereInput[] = [{ court: { complexId } }];

    if (query.date) {
      const { timezone } = await this.complex.findByIdOrThrow(complexId);
      conditions.push({
        startsAt: {
          gte: localTimeToUtc(query.date, '00:00', timezone),
          lt: localTimeToUtc(addLocalDays(query.date, 1), '00:00', timezone),
        },
      });
    } else {
      // `endsAt > from` para que una reserva en curso siga apareciendo.
      if (query.from) conditions.push({ endsAt: { gt: new Date(query.from) } });
      if (query.to) conditions.push({ startsAt: { lt: new Date(query.to) } });
    }

    if (query.courtId) conditions.push({ courtId: query.courtId });
    if (query.status) conditions.push({ status: query.status });
    if (query.q) conditions.push(customerSearch(query.q));

    const order = query.order ?? (query.date || query.from ? 'asc' : 'desc');

    return this.prisma.booking.findMany({
      where: { AND: conditions },
      orderBy: { startsAt: order },
      take: query.limit,
      include: BOOKING_INCLUDE,
    });
  }

  /**
   * Detalle: trae el historial de pagos completo (docs/11-admin-payments.md).
   * Una reserva de otro complejo es 404, igual que una inexistente.
   */
  async findOrThrow(
    complexId: string,
    id: string,
  ): Promise<BookingWithPayments> {
    const booking = await this.prisma.booking.findFirst({
      where: { id, court: { complexId } },
      include: BOOKING_DETAIL_INCLUDE,
    });
    if (!booking)
      throw new AppException(
        ErrorCode.NOT_FOUND,
        ADMIN_BOOKING_MESSAGES.notFound,
      );
    return booking;
  }

  /** Solicitud PENDING → CONFIRMED. Una vencida no se confirma. */
  async confirm(
    complexId: string,
    adminId: string,
    id: string,
  ): Promise<BookingWithPayments> {
    const booking = await this.findOrThrow(complexId, id);
    const now = this.clock.now();
    const pending =
      booking.status === BookingStatus.PENDING &&
      (!booking.expiresAt || booking.expiresAt > now);
    if (!pending) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_PENDING,
        ADMIN_BOOKING_MESSAGES.notPending,
      );
    }

    const { count } = await this.prisma.booking.updateMany({
      where: { id, status: BookingStatus.PENDING },
      data: {
        status: BookingStatus.CONFIRMED,
        confirmedAt: now,
        confirmedById: adminId,
        expiresAt: null,
      },
    });
    if (count === 0) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_PENDING,
        ADMIN_BOOKING_MESSAGES.notPending,
      );
    }

    return this.prisma.booking.findUniqueOrThrow({
      where: { id },
      include: BOOKING_DETAIL_INCLUDE,
    });
  }

  /**
   * Inicio manual del turno (docs/12-turn-progress.md): solo CONFIRMED, del día de hoy
   * (día local del complejo) y no iniciado. Sin restricción de hora: el cliente puede llegar antes.
   */
  async start(
    complexId: string,
    adminId: string,
    id: string,
  ): Promise<BookingWithPayments> {
    const booking = await this.findOrThrow(complexId, id);
    const now = this.clock.now();

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_CONFIRMED,
        ADMIN_BOOKING_MESSAGES.notConfirmed,
      );
    }
    if (booking.startedAt) {
      throw new AppException(
        ErrorCode.BOOKING_ALREADY_STARTED,
        ADMIN_BOOKING_MESSAGES.alreadyStarted,
      );
    }
    const { timezone } = await this.complex.findByIdOrThrow(complexId);
    if (
      localDateInTz(booking.startsAt, timezone) !== todayInTz(now, timezone)
    ) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_TODAY,
        ADMIN_BOOKING_MESSAGES.notToday,
      );
    }

    const { count } = await this.prisma.booking.updateMany({
      where: { id, status: BookingStatus.CONFIRMED, startedAt: null },
      data: { startedAt: now, startedById: adminId },
    });
    if (count === 0) {
      throw new AppException(
        ErrorCode.BOOKING_ALREADY_STARTED,
        ADMIN_BOOKING_MESSAGES.alreadyStarted,
      );
    }

    return this.prisma.booking.findUniqueOrThrow({
      where: { id },
      include: BOOKING_DETAIL_INCLUDE,
    });
  }

  /** Fin manual del turno iniciado: congela el cronómetro. Una vez; sin fin no hay reinicio. */
  async finish(
    complexId: string,
    adminId: string,
    id: string,
  ): Promise<BookingWithPayments> {
    const booking = await this.findOrThrow(complexId, id);
    const now = this.clock.now();

    if (booking.status !== BookingStatus.CONFIRMED || !booking.startedAt) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_STARTED,
        ADMIN_BOOKING_MESSAGES.notStarted,
      );
    }
    if (booking.finishedAt) {
      throw new AppException(
        ErrorCode.BOOKING_ALREADY_FINISHED,
        ADMIN_BOOKING_MESSAGES.alreadyFinished,
      );
    }

    const { count } = await this.prisma.booking.updateMany({
      where: {
        id,
        status: BookingStatus.CONFIRMED,
        startedAt: { not: null },
        finishedAt: null,
      },
      data: { finishedAt: now, finishedById: adminId },
    });
    if (count === 0) {
      throw new AppException(
        ErrorCode.BOOKING_ALREADY_FINISHED,
        ADMIN_BOOKING_MESSAGES.alreadyFinished,
      );
    }

    return this.prisma.booking.findUniqueOrThrow({
      where: { id },
      include: BOOKING_DETAIL_INCLUDE,
    });
  }

  /** Sin ventana de anticipación. Un turno en curso sí se puede cancelar; uno terminado no. Acepta PENDING (rechazo). */
  async cancel(
    complexId: string,
    adminId: string,
    id: string,
    reason?: string,
  ): Promise<BookingWithPayments> {
    const booking = await this.findOrThrow(complexId, id);
    const now = this.clock.now();
    if (booking.status === BookingStatus.CANCELLED) {
      throw new AppException(
        ErrorCode.BOOKING_ALREADY_CANCELLED,
        ADMIN_BOOKING_MESSAGES.alreadyCancelled,
      );
    }
    if (booking.endsAt <= now) {
      throw new AppException(
        ErrorCode.BOOKING_ALREADY_FINISHED,
        ADMIN_BOOKING_MESSAGES.alreadyFinished,
      );
    }

    const { count } = await this.prisma.booking.updateMany({
      where: { id, status: { in: ACTIVE_STATUSES } },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: now,
        cancelledById: adminId,
        cancellationReason: reason ?? null,
        expiresAt: null,
      },
    });
    if (count === 0) {
      throw new AppException(
        ErrorCode.BOOKING_ALREADY_CANCELLED,
        ADMIN_BOOKING_MESSAGES.alreadyCancelled,
      );
    }

    return this.prisma.booking.findUniqueOrThrow({
      where: { id },
      include: BOOKING_DETAIL_INCLUDE,
    });
  }
}
