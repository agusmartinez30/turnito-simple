import { Injectable } from '@nestjs/common';
import { BookingStatus, Complex, Court, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { isUniqueViolation } from '../prisma-errors';
import {
  BookingWithRelations,
  BOOKING_INCLUDE,
} from '../serializers/booking.serializer';
import { isDateInBookingWindow } from '../time/booking-window';
import { businessDateOf, generateSlots, SlotInterval } from '../time/slots';
import { todayInTz } from '../time/tz';

/** Columnas del índice único parcial `bookings_court_starts_at_active_uidx` (Prisma no da el nombre). */
const COURT_SLOT_UNIQUE_COLUMNS = ['court_id', 'starts_at'] as const;

/** Estados que ocupan un turno: una solicitud pendiente bloquea igual que una reserva confirmada. */
export const ACTIVE_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.PENDING,
];

export const BOOKING_MESSAGES = {
  slotUnavailable: 'Ese turno ya no está disponible.',
  inPast: 'Ese turno ya pasó.',
  validation: 'Revisá los datos ingresados.',
  invalidSlot: 'El horario no corresponde a un turno válido de esta cancha',
  tooFarAhead: (days: number) =>
    `Solo se puede reservar hasta ${days} días adelante`,
};

export interface AssertSlotInput {
  court: Court;
  complex: Complex;
  startsAt: Date;
  now: Date;
  /** `true` para jugadores (BOOKING_MAX_DAYS_AHEAD); `false` para el admin. */
  enforceWindow: boolean;
  maxDaysAhead: number;
}

/**
 * Reglas de reserva compartidas por jugador y admin (docs/06-admin-bookings.md §booking-core).
 * La cancha activa la resuelve el llamador (CourtsService.findActiveOrThrow) para conservar el orden de errores.
 */
@Injectable()
export class BookingCore {
  constructor(private readonly prisma: PrismaService) {}

  /** Orden: pasado → ventana de días → inicio exacto de slot. Devuelve el slot [startsAt, endsAt). */
  assertSlotBookable(input: AssertSlotInput): SlotInterval {
    const { court, complex, startsAt, now, enforceWindow, maxDaysAhead } =
      input;

    if (startsAt < now) {
      throw new AppException(
        ErrorCode.BOOKING_IN_PAST,
        BOOKING_MESSAGES.inPast,
      );
    }

    // Dia de agenda: en canchas que cierran de madrugada, un turno de 00:30 es de la grilla
    // del dia anterior (docs/03-courts.md). Rige tanto para la ventana como para el slot.
    const localDate = businessDateOf(startsAt, court, complex.timezone);
    if (
      enforceWindow &&
      !isDateInBookingWindow(
        localDate,
        todayInTz(now, complex.timezone),
        maxDaysAhead,
      )
    ) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        BOOKING_MESSAGES.validation,
        {
          startsAt: [BOOKING_MESSAGES.tooFarAhead(maxDaysAhead)],
        },
      );
    }

    const slot = generateSlots({
      date: localDate,
      timezone: complex.timezone,
      openTime: court.openTime,
      closeTime: court.closeTime,
      slotDurationMinutes: court.slotDurationMinutes,
    }).find((s) => s.startsAt.getTime() === startsAt.getTime());
    if (!slot) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        BOOKING_MESSAGES.validation,
        {
          startsAt: [BOOKING_MESSAGES.invalidSlot],
        },
      );
    }
    return slot;
  }

  /**
   * INSERT sin SELECT previo: las constraints son la fuente de verdad.
   * Un único `create` es atómico; el `include` evita releer.
   * Antes barre un PENDING vencido en ese slot que el cron aún no procesó (docs/09-public-requests.md).
   */
  async insert(
    data: Prisma.BookingUncheckedCreateInput,
    status: 'CONFIRMED' | 'PENDING',
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<BookingWithRelations> {
    await this.expirePendingForSlot(
      data.courtId,
      new Date(data.startsAt),
      now,
      tx,
    );
    try {
      const client = tx ?? this.prisma;
      return await client.booking.create({
        data: { ...data, status },
        include: BOOKING_INCLUDE,
      });
    } catch (err) {
      if (isUniqueViolation(err, COURT_SLOT_UNIQUE_COLUMNS)) {
        throw new AppException(
          ErrorCode.SLOT_UNAVAILABLE,
          BOOKING_MESSAGES.slotUnavailable,
        );
      }
      // Un cliente sí puede tener dos turnos superpuestos en canchas distintas
      // (un grupo alquilando dos): no hay exclusion sobre customer_id.
      throw err;
    }
  }

  /** Atajo para la reserva manual, el turno fijo y el pedido público confirmado. */
  insertConfirmed(
    data: Prisma.BookingUncheckedCreateInput,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<BookingWithRelations> {
    return this.insert(data, BookingStatus.CONFIRMED, now, tx);
  }

  /** Un PENDING cuyo vencimiento ya pasó se cancela como lo haría el cron, para no bloquear el slot. */
  async expirePendingForSlot(
    courtId: string,
    startsAt: Date,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const affected = await client.booking.findMany({
      where: {
        courtId,
        startsAt,
        status: BookingStatus.PENDING,
        expiresAt: { lte: now },
      },
      select: { id: true },
    });
    if (affected.length === 0) return 0;

    const { count } = await client.booking.updateMany({
      where: {
        id: { in: affected.map((b) => b.id) },
        status: BookingStatus.PENDING,
        expiresAt: { lte: now },
      },
      data: expiredPendingData(now),
    });
    return count;
  }
}

export const PENDING_EXPIRED_REASON = 'Venció sin confirmación';

/** Datos del UPDATE que vence un PENDING. */
export function expiredPendingData(
  now: Date,
): Prisma.BookingUncheckedUpdateManyInput {
  return {
    status: BookingStatus.CANCELLED,
    cancelledAt: now,
    cancelledById: null,
    cancellationReason: PENDING_EXPIRED_REASON,
  };
}
