import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Complex, Court } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { Clock, FixedClock } from '../../shared/time/clock';
import { ComplexService } from '../complex/complex.service';
import { AvailabilityService } from './availability.service';
import { CourtsService } from './courts.service';

const BA = 'America/Argentina/Buenos_Aires';
const MAX_DAYS = 14;

// "Ahora": 2026-09-12 15:00 en Buenos Aires.
const NOW = new Date('2026-09-12T15:00:00-03:00');

const complex: Complex = {
  id: 'c1',
  slug: 'complejo-demo',
  name: 'Complejo Demo',
  address: 'x',
  timezone: BA,
  cancellationWindowHours: 24,
  autoConfirmPublicRequests: false,
  instagramUrl: null,
  facebookUrl: null,
  tiktokUrl: null,
  youtubeUrl: null,
  contactWhatsapp: null,
  logoUrl: null,
  bankCbu: null,
  bankAlias: null,
  bankHolderName: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const court: Court = {
  id: '22222222-2222-4222-8222-222222222222',
  complexId: 'c1',
  name: 'Pádel 1',
  sport: 'PADEL',
  surface: 'cemento',
  isIndoor: true,
  slotDurationMinutes: 90,
  openTime: '08:00',
  closeTime: '23:00',
  pricePerSlot: 12000,
  isActive: true,
  imageUrl: null,
  sortOrder: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let clock: FixedClock;
  let findMany: jest.Mock;
  let findActiveOrThrow: jest.Mock;

  beforeEach(async () => {
    clock = new FixedClock(NOW);
    findMany = jest.fn().mockResolvedValue([]);
    findActiveOrThrow = jest.fn().mockResolvedValue(court);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: PrismaService, useValue: { booking: { findMany } } },
        { provide: CourtsService, useValue: { findActiveOrThrow } },
        {
          provide: ComplexService,
          useValue: { findByIdOrThrow: () => Promise.resolve(complex) },
        },
        { provide: Clock, useValue: clock },
        { provide: ConfigService, useValue: { get: () => MAX_DAYS } },
      ],
    }).compile();

    service = moduleRef.get(AvailabilityService);
  });

  const statusAt = async (date: string, hhmm: string) => {
    const result = await service.getAvailability(court.id, date);
    const slot = result.slots.find((s) =>
      s.startsAt.startsWith(`${date}T${hhmm}`),
    );
    if (!slot) throw new Error(`No hay slot a las ${hhmm}`);
    return slot.status;
  };

  it('slot con startsAt < now → PAST aunque tenga reserva', async () => {
    // 14:00 -03:00 = 17:00Z, reservado; pero ya pasó (now = 15:00 local).
    findMany.mockResolvedValue([
      { startsAt: new Date('2026-09-12T17:00:00.000Z') },
    ]);
    expect(await statusAt('2026-09-12', '14:00')).toBe('PAST');
    expect(await statusAt('2026-09-12', '15:30')).toBe('AVAILABLE');
  });

  it('slot con reserva CONFIRMED → BOOKED; la query filtra status CONFIRMED y courtId', async () => {
    findMany.mockResolvedValue([
      { startsAt: new Date('2026-09-13T20:00:00.000Z') },
    ]); // 17:00 -03
    expect(await statusAt('2026-09-13', '17:00')).toBe('BOOKED');
    expect(await statusAt('2026-09-13', '18:30')).toBe('AVAILABLE');

    const where = (
      findMany.mock.calls[0][0] as { where: Record<string, unknown> }
    ).where;
    expect(where).toMatchObject({
      courtId: court.id,
      status: { in: ['CONFIRMED', 'PENDING'] },
    });
    // Solo se consulta el rango del día: [primer slot, fin del último).
    expect(where.startsAt).toEqual({
      gte: new Date('2026-09-13T11:00:00.000Z'),
      lt: new Date('2026-09-14T02:00:00.000Z'),
    });
  });

  it('una reserva CANCELLED no marca BOOKED (el service no la recibe porque la query filtra)', async () => {
    findMany.mockResolvedValue([]);
    expect(await statusAt('2026-09-13', '17:00')).toBe('AVAILABLE');
  });

  it('una solicitud PENDING se ve como BOOKED (el jugador no distingue)', async () => {
    findMany.mockResolvedValue([
      { startsAt: new Date('2026-09-13T20:00:00.000Z') },
    ]);
    expect(await statusAt('2026-09-13', '17:00')).toBe('BOOKED');
  });

  it('date = ayer → VALIDATION_ERROR con details.date', async () => {
    const err = await service
      .getAvailability(court.id, '2026-09-11')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).code).toBe(ErrorCode.VALIDATION_ERROR);
    expect((err as AppException).details).toEqual({
      date: [expect.stringContaining('14 días')],
    });
  });

  it('date = hoy + MAX → VALIDATION_ERROR; hoy + MAX - 1 → OK', async () => {
    await expect(
      service.getAvailability(court.id, '2026-09-26'),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
    await expect(
      service.getAvailability(court.id, '2026-09-25'),
    ).resolves.toMatchObject({
      date: '2026-09-25',
      timezone: BA,
    });
  });

  it("date = '2026-02-30' → VALIDATION_ERROR (fecha inexistente)", async () => {
    await expect(
      service.getAvailability(court.id, '2026-02-30'),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      details: { date: ['La fecha no es válida'] },
    });
  });

  it('"hoy" se evalúa en el timezone del complejo, no en UTC', async () => {
    // 01:00Z del 13 = 22:00 del 12 en BA → "hoy" sigue siendo el 12 y el 12 es consultable.
    clock.set(new Date('2026-09-13T01:00:00.000Z'));
    await expect(
      service.getAvailability(court.id, '2026-09-12'),
    ).resolves.toMatchObject({
      date: '2026-09-12',
    });
  });

  it('cancha cerrada (open >= close) → slots: []', async () => {
    findActiveOrThrow.mockResolvedValue({
      ...court,
      openTime: '10:00',
      closeTime: '10:00',
    });
    const result = await service.getAvailability(court.id, '2026-09-13');
    expect(result.slots).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('respuesta: eco de date, timezone del complejo, ISO con offset -03:00 y orden ascendente', async () => {
    const result = await service.getAvailability(court.id, '2026-09-13');
    expect(result.date).toBe('2026-09-13');
    expect(result.timezone).toBe(BA);
    expect(result.slots).toHaveLength(10);
    expect(result.slots[0]).toEqual({
      startsAt: '2026-09-13T08:00:00-03:00',
      endsAt: '2026-09-13T09:30:00-03:00',
      status: 'AVAILABLE',
    });
    const starts = result.slots.map((s) => s.startsAt);
    expect([...starts].sort()).toEqual(starts);
  });

  it('propaga NOT_FOUND de CourtsService', async () => {
    findActiveOrThrow.mockRejectedValue(
      new AppException(ErrorCode.NOT_FOUND, 'Cancha no encontrada.'),
    );
    await expect(
      service.getAvailability('nope', '2026-09-13'),
    ).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});
