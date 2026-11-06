import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import {
  complexFixture,
  courtFixture,
  NOW,
} from '../../shared/testing/fixtures';
import { Clock, FixedClock } from '../../shared/time/clock';
import { ComplexService } from '../complex/complex.service';
import { AdminCourtsService } from './admin-courts.service';
import { CreateCourtDto } from './dto/create-court.dto';

const court = courtFixture();
const base: CreateCourtDto = {
  name: 'Pádel 4',
  sport: 'PADEL',
  isIndoor: true,
  openTime: '08:00',
  closeTime: '22:00',
  slotDurationMinutes: 90,
  pricePerSlot: 11000,
};

const nameConflict = new Prisma.PrismaClientKnownRequestError(
  'Unique constraint failed',
  {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['complex_id', 'name'] },
  },
);

describe('AdminCourtsService', () => {
  let service: AdminCourtsService;
  let courtDb: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    aggregate: jest.Mock;
  };
  let bookingDb: { count: jest.Mock; groupBy: jest.Mock };

  beforeEach(async () => {
    courtDb = {
      findMany: jest.fn().mockResolvedValue([court]),
      findFirst: jest.fn().mockResolvedValue(court),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ ...court, ...data }),
        ),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ ...court, ...data }),
        ),
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 99 } }),
    };
    bookingDb = {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminCourtsService,
        {
          provide: PrismaService,
          useValue: { court: courtDb, booking: bookingDb },
        },
        {
          provide: ComplexService,
          useValue: {
            findByIdOrThrow: () => Promise.resolve(complexFixture),
          },
        },
        { provide: Clock, useValue: new FixedClock(NOW) },
      ],
    }).compile();
    service = moduleRef.get(AdminCourtsService);
  });

  describe('create', () => {
    it('closeTime === openTime → VALIDATION_ERROR details.closeTime', async () => {
      await expect(
        service.create(complexFixture.id, { ...base, closeTime: '08:00' }),
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
        details: { closeTime: ['Debe ser distinta de la hora de apertura'] },
      });
      expect(courtDb.create).not.toHaveBeenCalled();
    });

    it('closeTime < openTime = cierra al día siguiente → se crea (turnos trasnoche)', async () => {
      await service.create(complexFixture.id, {
        ...base,
        openTime: '22:00',
        closeTime: '01:00',
        slotDurationMinutes: 90,
      });
      expect(courtDb.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            openTime: '22:00',
            closeTime: '01:00',
          }),
        }),
      );
    });

    it('10:00–10:30 con 60 min → details.slotDurationMinutes', async () => {
      await expect(
        service.create(complexFixture.id, {
          ...base,
          openTime: '10:00',
          closeTime: '10:30',
          slotDurationMinutes: 60,
        }),
      ).rejects.toMatchObject({
        details: {
          slotDurationMinutes: [
            'No entra ningún turno completo en ese horario',
          ],
        },
      });
    });

    it('sin sortOrder → max + 1; con tabla vacía → 0; con sortOrder explícito lo respeta', async () => {
      await service.create(complexFixture.id, base);
      expect(
        (courtDb.create.mock.calls[0][0] as { data: { sortOrder: number } })
          .data.sortOrder,
      ).toBe(100);

      courtDb.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      await service.create(complexFixture.id, base);
      expect(
        (courtDb.create.mock.calls[1][0] as { data: { sortOrder: number } })
          .data.sortOrder,
      ).toBe(0);

      await service.create(complexFixture.id, { ...base, sortOrder: 5 });
      expect(
        (courtDb.create.mock.calls[2][0] as { data: { sortOrder: number } })
          .data.sortOrder,
      ).toBe(5);
    });

    it('defaults: isActive true, surface/imageUrl null, complexId del complejo actual', async () => {
      await service.create(complexFixture.id, base);
      expect(
        (courtDb.create.mock.calls[0][0] as { data: object }).data,
      ).toMatchObject({
        complexId: complexFixture.id,
        isActive: true,
        surface: null,
        imageUrl: null,
      });
    });

    it('P2002 [complex_id, name] → COURT_NAME_ALREADY_EXISTS', async () => {
      courtDb.create.mockRejectedValue(nameConflict);
      await expect(
        service.create(complexFixture.id, base),
      ).rejects.toMatchObject({
        code: ErrorCode.COURT_NAME_ALREADY_EXISTS,
        message: 'Ya existe una cancha con ese nombre.',
      });
    });
  });

  describe('update', () => {
    it('{} → VALIDATION_ERROR details._', async () => {
      await expect(
        service.update(complexFixture.id, court.id, {}),
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
        details: { _: ['No hay cambios'] },
      });
    });

    it('pricePerSlot con 3 reservas futuras → OK y no consulta el count antes de escribir', async () => {
      bookingDb.count.mockResolvedValue(3);
      const result = await service.update(complexFixture.id, court.id, {
        pricePerSlot: 13000,
      });
      expect(result.court.pricePerSlot).toBe(13000);
      expect(result.futureBookingsCount).toBe(3);
      // Solo la lectura posterior (para la respuesta); no hubo chequeo previo.
      expect(bookingDb.count).toHaveBeenCalledTimes(1);
      expect(courtDb.update).toHaveBeenCalledWith({
        where: { id: court.id },
        data: { pricePerSlot: 13000 },
      });
    });

    it('openTime con 3 reservas futuras → OK y mantiene el contador para la respuesta', async () => {
      bookingDb.count.mockResolvedValue(3);
      await expect(
        service.update(complexFixture.id, court.id, { openTime: '09:00' }),
      ).resolves.toMatchObject({
        court: { openTime: '09:00' },
        futureBookingsCount: 3,
      });
      expect(courtDb.update).toHaveBeenCalledWith({
        where: { id: court.id },
        data: { openTime: '09:00' },
      });
    });

    it('openTime igual al actual con reservas futuras → OK (no cambia la grilla)', async () => {
      bookingDb.count.mockResolvedValue(3);
      await expect(
        service.update(complexFixture.id, court.id, { openTime: '08:00' }),
      ).resolves.toBeDefined();
    });

    it('isActive:false con reservas → 409; sin reservas → OK; isActive:true siempre OK', async () => {
      bookingDb.count.mockResolvedValue(1);
      await expect(
        service.update(complexFixture.id, court.id, { isActive: false }),
      ).rejects.toMatchObject({ code: ErrorCode.COURT_HAS_FUTURE_BOOKINGS });

      bookingDb.count.mockResolvedValue(0);
      await expect(
        service.update(complexFixture.id, court.id, { isActive: false }),
      ).resolves.toMatchObject({ court: { isActive: false } });

      bookingDb.count.mockResolvedValue(5);
      courtDb.findFirst.mockResolvedValue(courtFixture({ isActive: false }));
      await expect(
        service.update(complexFixture.id, court.id, { isActive: true }),
      ).resolves.toBeDefined();
    });

    it('surface: null → guarda null', async () => {
      await service.update(complexFixture.id, court.id, { surface: null });
      expect(courtDb.update).toHaveBeenCalledWith({
        where: { id: court.id },
        data: { surface: null },
      });
    });

    it('merge body + actual que deja openTime === closeTime → VALIDATION_ERROR', async () => {
      await expect(
        service.update(complexFixture.id, court.id, { closeTime: '08:00' }),
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
        details: { closeTime: ['Debe ser distinta de la hora de apertura'] },
      });
    });

    it('rename a nombre repetido → COURT_NAME_ALREADY_EXISTS; inexistente → NOT_FOUND', async () => {
      courtDb.update.mockRejectedValue(nameConflict);
      await expect(
        service.update(complexFixture.id, court.id, { name: 'Pádel 2' }),
      ).rejects.toMatchObject({ code: ErrorCode.COURT_NAME_ALREADY_EXISTS });

      courtDb.findFirst.mockResolvedValue(null);
      await expect(
        service.update(complexFixture.id, 'nope', { name: 'Pádel 9' }),
      ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    });
  });

  describe('list', () => {
    it('resuelve futureBookingsCount con un groupBy y 0 para canchas sin reservas', async () => {
      const other = courtFixture({ id: 'c2', name: 'Pádel 2' });
      courtDb.findMany.mockResolvedValue([court, other]);
      bookingDb.groupBy.mockResolvedValue([
        { courtId: 'c2', _count: { _all: 4 } },
      ]);
      const result = await service.list(complexFixture.id);
      expect(result.map((r) => r.futureBookingsCount)).toEqual([0, 4]);
      expect(bookingDb.groupBy).toHaveBeenCalledWith({
        by: ['courtId'],
        where: {
          court: { complexId: complexFixture.id },
          status: { in: ['CONFIRMED', 'PENDING'] },
          startsAt: { gte: NOW },
        },
        _count: { _all: true },
      });
    });
  });
});
