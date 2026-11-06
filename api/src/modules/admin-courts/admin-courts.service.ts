import { Injectable } from '@nestjs/common';
import { Court, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_STATUSES } from '../../shared/bookings/booking-core';
import { isUniqueViolationOn } from '../../shared/prisma-errors';
import { Clock } from '../../shared/time/clock';
import { generateSlots } from '../../shared/time/slots';
import { ComplexService } from '../complex/complex.service';
import { COURT_NOT_FOUND_MESSAGE } from '../courts/courts.service';
import { CreateCourtDto } from './dto/create-court.dto';
import { UpdateCourtDto } from './dto/update-court.dto';

export const ADMIN_COURT_MESSAGES = {
  nameExists: 'Ya existe una cancha con ese nombre.',
  hasFutureBookings: (n: number) =>
    `La cancha tiene ${n} reservas futuras. Cancelalas antes de desactivarla.`,
  validation: 'Revisá los datos ingresados.',
  closeEqualsOpen: 'Debe ser distinta de la hora de apertura',
  noSlotFits: 'No entra ningún turno completo en ese horario',
  noChanges: 'No hay cambios',
};

export type CourtWithFutureCount = {
  court: Court;
  futureBookingsCount: number;
};

/**
 * CRUD de canchas del admin (docs/07-admin-courts.md). A diferencia de CourtsService, ve las inactivas.
 * Todo recibe `complexId`: una cancha de otro complejo es 404, igual que una inexistente (docs/15-multi-complex.md).
 */
@Injectable()
export class AdminCourtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly complex: ComplexService,
    private readonly clock: Clock,
  ) {}

  /** Todas, activas e inactivas, con su cantidad de reservas futuras resuelta en una sola query agrupada. */
  async list(complexId: string): Promise<CourtWithFutureCount[]> {
    const [courts, counts] = await Promise.all([
      this.prisma.court.findMany({
        where: { complexId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.booking.groupBy({
        by: ['courtId'],
        where: {
          court: { complexId },
          status: { in: ACTIVE_STATUSES },
          startsAt: { gte: this.clock.now() },
        },
        _count: { _all: true },
      }),
    ]);
    const countByCourt = new Map(counts.map((c) => [c.courtId, c._count._all]));
    return courts.map((court) => ({
      court,
      futureBookingsCount: countByCourt.get(court.id) ?? 0,
    }));
  }

  async findOrThrow(
    complexId: string,
    id: string,
  ): Promise<CourtWithFutureCount> {
    const { court } = await this.findOrThrowBare(complexId, id);
    return { court, futureBookingsCount: await this.futureBookingsCount(id) };
  }

  async create(
    complexId: string,
    dto: CreateCourtDto,
  ): Promise<CourtWithFutureCount> {
    const complex = await this.complex.findByIdOrThrow(complexId);
    this.assertScheduleValid(
      dto.openTime,
      dto.closeTime,
      dto.slotDurationMinutes,
      complex.timezone,
    );

    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(complexId));
    try {
      const court = await this.prisma.court.create({
        data: {
          complexId: complex.id,
          name: dto.name,
          sport: dto.sport,
          surface: dto.surface ?? null,
          isIndoor: dto.isIndoor,
          slotDurationMinutes: dto.slotDurationMinutes,
          openTime: dto.openTime,
          closeTime: dto.closeTime,
          pricePerSlot: dto.pricePerSlot,
          imageUrl: dto.imageUrl ?? null,
          sortOrder,
          isActive: dto.isActive ?? true,
        },
      });
      return { court, futureBookingsCount: 0 };
    } catch (err) {
      throw mapNameConflict(err);
    }
  }

  /** Reglas de docs/07-admin-courts.md §"Reglas al editar". */
  async update(
    complexId: string,
    id: string,
    dto: UpdateCourtDto,
  ): Promise<CourtWithFutureCount> {
    const data = toUpdateData(dto);
    if (Object.keys(data).length === 0) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        ADMIN_COURT_MESSAGES.validation,
        {
          _: [ADMIN_COURT_MESSAGES.noChanges],
        },
      );
    }

    const { court: current } = await this.findOrThrowBare(complexId, id);
    const next = {
      openTime: dto.openTime ?? current.openTime,
      closeTime: dto.closeTime ?? current.closeTime,
      slotDurationMinutes:
        dto.slotDurationMinutes ?? current.slotDurationMinutes,
    };

    const deactivating = data.isActive === false && current.isActive;
    if (deactivating) {
      const n = await this.futureBookingsCount(id);
      if (n > 0) {
        throw new AppException(
          ErrorCode.COURT_HAS_FUTURE_BOOKINGS,
          ADMIN_COURT_MESSAGES.hasFutureBookings(n),
          {
            futureBookings: [String(n)],
          },
        );
      }
    }

    const complex = await this.complex.findByIdOrThrow(complexId);
    this.assertScheduleValid(
      next.openTime,
      next.closeTime,
      next.slotDurationMinutes,
      complex.timezone,
    );

    try {
      const court = await this.prisma.court.update({ where: { id }, data });
      return { court, futureBookingsCount: await this.futureBookingsCount(id) };
    } catch (err) {
      throw mapNameConflict(err);
    }
  }

  private async findOrThrowBare(
    complexId: string,
    id: string,
  ): Promise<{ court: Court }> {
    const court = await this.prisma.court.findFirst({
      where: { id, complexId },
    });
    if (!court)
      throw new AppException(ErrorCode.NOT_FOUND, COURT_NOT_FOUND_MESSAGE);
    return { court };
  }

  private futureBookingsCount(courtId: string): Promise<number> {
    return this.prisma.booking.count({
      where: {
        courtId,
        status: { in: ACTIVE_STATUSES },
        startsAt: { gte: this.clock.now() },
      },
    });
  }

  private async nextSortOrder(complexId: string): Promise<number> {
    const max = await this.prisma.court.aggregate({
      where: { complexId },
      _max: { sortOrder: true },
    });
    return max._max.sortOrder === null ? 0 : max._max.sortOrder + 1;
  }

  /**
   * openTime !== closeTime y al menos un turno completo. Un cierre menor que la apertura es del
   * día siguiente (turnos trasnoche, docs/03-courts.md). Un día fijo sin DST alcanza para la aritmética.
   */
  private assertScheduleValid(
    openTime: string,
    closeTime: string,
    slotDurationMinutes: number,
    timezone: string,
  ): void {
    if (openTime === closeTime) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        ADMIN_COURT_MESSAGES.validation,
        {
          closeTime: [ADMIN_COURT_MESSAGES.closeEqualsOpen],
        },
      );
    }
    const slots = generateSlots({
      date: '2000-01-03',
      timezone,
      openTime,
      closeTime,
      slotDurationMinutes,
    });
    if (slots.length === 0) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        ADMIN_COURT_MESSAGES.validation,
        {
          slotDurationMinutes: [ADMIN_COURT_MESSAGES.noSlotFits],
        },
      );
    }
  }
}

/** Solo las propiedades presentes en el body; `null` en surface/imageUrl borra el valor. */
function toUpdateData(dto: UpdateCourtDto): Prisma.CourtUncheckedUpdateInput {
  const data: Prisma.CourtUncheckedUpdateInput = {};
  if (dto.name !== undefined) data.name = dto.name;
  if (dto.sport !== undefined) data.sport = dto.sport;
  if (dto.surface !== undefined) data.surface = dto.surface;
  if (dto.isIndoor !== undefined) data.isIndoor = dto.isIndoor;
  if (dto.slotDurationMinutes !== undefined)
    data.slotDurationMinutes = dto.slotDurationMinutes;
  if (dto.openTime !== undefined) data.openTime = dto.openTime;
  if (dto.closeTime !== undefined) data.closeTime = dto.closeTime;
  if (dto.pricePerSlot !== undefined) data.pricePerSlot = dto.pricePerSlot;
  if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
  if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
  if (dto.isActive !== undefined) data.isActive = dto.isActive;
  return data;
}

/** El unique (complexId, name) se traduce a 409; cualquier otro error se relanza tal cual. */
function mapNameConflict(err: unknown): unknown {
  if (isUniqueViolationOn(err, 'name')) {
    return new AppException(
      ErrorCode.COURT_NAME_ALREADY_EXISTS,
      ADMIN_COURT_MESSAGES.nameExists,
    );
  }
  return err;
}
