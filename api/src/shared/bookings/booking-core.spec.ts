import { Test } from '@nestjs/testing';
import { Complex, Court, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { BOOKING_INCLUDE } from '../serializers/booking.serializer';
import { BookingCore } from './booking-core';

const BA = 'America/Argentina/Buenos_Aires';
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

const uniqueErr = new Prisma.PrismaClientKnownRequestError(
  'Unique constraint failed',
  {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['court_id', 'starts_at'] },
  },
);
const exclusionErr = new Prisma.PrismaClientUnknownRequestError(
  'PostgresError { code: "23P01", message: "conflicting key value violates exclusion constraint \\"bookings_user_no_overlap_excl\\"" }',
  { clientVersion: 'test' },
);

describe('BookingCore', () => {
  let core: BookingCore;
  let create: jest.Mock;
  let updateMany: jest.Mock;
  let findMany: jest.Mock;

  beforeEach(async () => {
    create = jest.fn();
    updateMany = jest.fn().mockResolvedValue({ count: 0 });
    findMany = jest.fn().mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingCore,
        {
          provide: PrismaService,
          useValue: { booking: { create, updateMany, findMany } },
        },
      ],
    }).compile();
    core = moduleRef.get(BookingCore);
  });

  const assert = (startsAt: string, enforceWindow = true, now = NOW) =>
    core.assertSlotBookable({
      court,
      complex,
      startsAt: new Date(startsAt),
      now,
      enforceWindow,
      maxDaysAhead: 14,
    });

  describe('assertSlotBookable', () => {
    it('startsAt en el pasado → BOOKING_IN_PAST (antes que cualquier otra regla)', () => {
      expect(() => assert('2026-09-12T14:00:00-03:00')).toThrow(
        expect.objectContaining({ code: ErrorCode.BOOKING_IN_PAST }),
      );
      // Pasado y además fuera de horario: gana "pasado".
      expect(() => assert('2026-09-11T03:00:00-03:00')).toThrow(
        expect.objectContaining({ code: ErrorCode.BOOKING_IN_PAST }),
      );
    });

    it('18:15 en cancha de 90 min desde 08:00 → VALIDATION_ERROR con details.startsAt', () => {
      let err: unknown;
      try {
        assert('2026-09-13T18:15:00-03:00');
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.VALIDATION_ERROR);
      expect((err as AppException).details).toEqual({
        startsAt: [
          'El horario no corresponde a un turno válido de esta cancha',
        ],
      });
    });

    it('fuera de open/close → VALIDATION_ERROR', () => {
      expect(() => assert('2026-09-13T23:00:00-03:00')).toThrow(
        expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }),
      );
      expect(() => assert('2026-09-13T06:30:00-03:00')).toThrow(
        expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }),
      );
    });

    it('con enforceWindow: hoy + 14 → VALIDATION_ERROR; hoy + 13 al último slot → OK', () => {
      expect(() => assert('2026-09-26T08:00:00-03:00')).toThrow(
        expect.objectContaining({
          code: ErrorCode.VALIDATION_ERROR,
          details: {
            startsAt: ['Solo se puede reservar hasta 14 días adelante'],
          },
        }),
      );
      expect(assert('2026-09-25T21:30:00-03:00').endsAt.toISOString()).toBe(
        '2026-09-26T02:00:00.000Z',
      );
    });

    it('sin enforceWindow (admin): hoy + 60 días → OK; el pasado sigue rechazado', () => {
      expect(
        assert('2026-11-11T17:00:00-03:00', false).startsAt.toISOString(),
      ).toBe('2026-11-11T20:00:00.000Z');
      expect(() => assert('2026-09-12T14:00:00-03:00', false)).toThrow(
        expect.objectContaining({ code: ErrorCode.BOOKING_IN_PAST }),
      );
    });

    it('cancha que cierra al día siguiente: 00:30 es un slot del día anterior; a closeTime ya no; la ventana cuenta el día de agenda', () => {
      const lateNight = { ...court, openTime: '22:00', closeTime: '01:00' };
      const assertLate = (startsAt: string) =>
        core.assertSlotBookable({
          court: lateNight,
          complex,
          startsAt: new Date(startsAt),
          now: NOW,
          enforceWindow: true,
          maxDaysAhead: 14,
        });
      // 23:30–01:00 del 13 → arranca 23:30 y termina 01:00 del 14.
      expect(assertLate('2026-09-13T23:30:00-03:00').endsAt.toISOString()).toBe(
        '2026-09-14T04:00:00.000Z',
      );
      // Sin cruce de medianoche 23:30 no entraría (cerraba 23:00): ahora sí.
      expect(() => assertLate('2026-09-14T01:00:00-03:00')).toThrow(
        expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }),
      );
      // Último día de la ventana: 25. Su slot de 23:30 termina el 26 y sigue dentro.
      expect(assertLate('2026-09-25T23:30:00-03:00')).toBeDefined();
      expect(() => assertLate('2026-09-26T22:00:00-03:00')).toThrow(
        expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }),
      );
    });

    it('acepta el instante con cualquier offset y devuelve el slot [startsAt, endsAt)', () => {
      const slot = assert('2026-09-13T20:00:00.000Z'); // = 17:00 -03:00
      expect(slot).toEqual({
        startsAt: new Date('2026-09-13T20:00:00.000Z'),
        endsAt: new Date('2026-09-13T21:30:00.000Z'),
      });
    });
  });

  describe('insertConfirmed', () => {
    const data = {
      courtId: court.id,
      customerId: 'cus-1',
      startsAt: new Date('2026-09-13T20:00:00.000Z'),
      endsAt: new Date('2026-09-13T21:30:00.000Z'),
      price: 12000,
    };

    it('inserta como CONFIRMED con las relaciones incluidas', async () => {
      create.mockResolvedValue({ id: 'b1' });
      await core.insertConfirmed(data, NOW);
      const args = create.mock.calls[0][0] as {
        data: Record<string, unknown>;
        include: Record<string, unknown>;
      };
      expect(args.data).toMatchObject({ ...data, status: 'CONFIRMED' });
      expect(args.include).toEqual(BOOKING_INCLUDE);
    });

    it('traduce P2002 del índice de cancha a SLOT_UNAVAILABLE', async () => {
      create.mockRejectedValue(uniqueErr);
      await expect(core.insertConfirmed(data, NOW)).rejects.toMatchObject({
        code: ErrorCode.SLOT_UNAVAILABLE,
        message: 'Ese turno ya no está disponible.',
      });
    });

    it('un cliente puede tener dos turnos superpuestos: no hay exclusion que traducir', async () => {
      create.mockRejectedValue(exclusionErr);
      await expect(core.insertConfirmed(data, NOW)).rejects.toBe(exclusionErr);
    });

    it('cualquier otro error se propaga sin traducir', async () => {
      create.mockRejectedValue(new Error('boom'));
      await expect(core.insertConfirmed(data, NOW)).rejects.toThrow('boom');
    });
  });
});
