import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { Env } from '../../config/env.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_STATUSES } from '../../shared/bookings/booking-core';
import { isDateInBookingWindow } from '../../shared/time/booking-window';
import { Clock } from '../../shared/time/clock';
import { generateSlots } from '../../shared/time/slots';
import {
  isValidLocalDate,
  toComplexIso,
  todayInTz,
} from '../../shared/time/tz';
import { ComplexService } from '../complex/complex.service';
import { CourtsService } from './courts.service';

export type SlotStatus = 'AVAILABLE' | 'BOOKED' | 'BLOCKED' | 'PAST';

export interface TimeSlotResponse {
  startsAt: string; // ISO con offset del complejo
  endsAt: string;
  status: SlotStatus;
}

export interface AvailabilityResponse {
  date: string;
  timezone: string;
  slots: TimeSlotResponse[];
}

@Injectable()
export class AvailabilityService {
  private readonly maxDaysAhead: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly courts: CourtsService,
    private readonly complex: ComplexService,
    private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.maxDaysAhead = config.get('BOOKING_MAX_DAYS_AHEAD', { infer: true });
  }

  /** Grilla del día con estado real (docs/03-courts.md §"Asignación de estado"). */
  async getAvailability(
    courtId: string,
    date: string,
    complexId?: string,
  ): Promise<AvailabilityResponse> {
    const court = await this.courts.findActiveOrThrow(courtId, complexId);
    const complex = await this.complex.findByIdOrThrow(court.complexId);
    const now = this.clock.now();

    this.assertDateInWindow(date, todayInTz(now, complex.timezone));

    const slots = generateSlots({
      date,
      timezone: complex.timezone,
      openTime: court.openTime,
      closeTime: court.closeTime,
      slotDurationMinutes: court.slotDurationMinutes,
    });
    if (slots.length === 0) {
      return { date, timezone: complex.timezone, slots: [] };
    }

    // Una sola query: inicios de las reservas confirmadas de esta cancha en el rango del día.
    const booked = await this.prisma.booking.findMany({
      where: {
        courtId: court.id,
        status: { in: ACTIVE_STATUSES },
        startsAt: {
          gte: slots[0].startsAt,
          lt: slots[slots.length - 1].endsAt,
        },
      },
      select: { startsAt: true },
    });
    const bookedStarts = new Set(booked.map((b) => b.startsAt.getTime()));

    return {
      date,
      timezone: complex.timezone,
      slots: slots.map((slot) => ({
        startsAt: toComplexIso(slot.startsAt, complex.timezone),
        endsAt: toComplexIso(slot.endsAt, complex.timezone),
        status: this.statusFor(slot.startsAt, now, bookedStarts),
      })),
    };
  }

  /** Precedencia: PAST > BOOKED > BLOCKED (nunca en MVP) > AVAILABLE. */
  private statusFor(
    startsAt: Date,
    now: Date,
    bookedStarts: Set<number>,
  ): SlotStatus {
    if (startsAt < now) return 'PAST';
    if (bookedStarts.has(startsAt.getTime())) return 'BOOKED';
    return 'AVAILABLE';
  }

  /** Pública: la reusa la disponibilidad por deporte (docs/09-public-requests.md). */
  assertDateInWindow(date: string, today: string): void {
    if (!isValidLocalDate(date)) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Revisá los datos ingresados.',
        {
          date: ['La fecha no es válida'],
        },
      );
    }
    if (!isDateInBookingWindow(date, today, this.maxDaysAhead)) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Revisá los datos ingresados.',
        {
          date: [
            `Solo se puede consultar disponibilidad hasta ${this.maxDaysAhead} días adelante`,
          ],
        },
      );
    }
  }
}
