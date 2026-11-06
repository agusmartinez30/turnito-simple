import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import {
  bookingFixture,
  complexFixture,
  courtFixture,
  customerFixture,
  NOW,
} from '../../shared/testing/fixtures';
import { Clock, FixedClock } from '../../shared/time/clock';
import { PublicBookingsService } from './public-bookings.service';

function row(overrides: Record<string, unknown> = {}) {
  const base = bookingFixture({ price: 10000 });
  return {
    id: base.id,
    startsAt: base.startsAt,
    endsAt: base.endsAt,
    price: base.price,
    court: { name: courtFixture().name, sport: courtFixture().sport },
    customer: {
      firstName: customerFixture().firstName,
      lastName: customerFixture().lastName,
    },
    payments: [] as Array<{ amount: number; voidedAt: Date | null }>,
    paymentProofs: [] as Array<{ id: string }>,
    ...overrides,
  };
}

describe('PublicBookingsService', () => {
  let service: PublicBookingsService;
  let findMany: jest.Mock;

  beforeEach(async () => {
    findMany = jest.fn().mockResolvedValue([row()]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PublicBookingsService,
        { provide: PrismaService, useValue: { booking: { findMany } } },
        { provide: Clock, useValue: new FixedClock(NOW) },
      ],
    }).compile();
    service = moduleRef.get(PublicBookingsService);
  });

  it('queries only the complex, confirmed, within yesterday 00:00 .. tomorrow 00:00 local', async () => {
    await service.list(complexFixture);
    const args = findMany.mock.calls[0][0];
    expect(args.where.court).toEqual({ complexId: complexFixture.id });
    expect(args.where.status).toBe('CONFIRMED');
    // NOW = 2026-09-12 15:00 BA (-03:00) -> window 2026-09-11 00:00 .. 2026-09-13 00:00 BA
    expect(args.where.startsAt.gte).toEqual(
      new Date('2026-09-11T00:00:00-03:00'),
    );
    expect(args.where.startsAt.lt).toEqual(
      new Date('2026-09-13T00:00:00-03:00'),
    );
    expect(args.orderBy).toEqual({ startsAt: 'desc' });
  });

  it('maps a minimal, PII-free shape', async () => {
    const [item] = await service.list(complexFixture);
    expect(Object.keys(item).sort()).toEqual(
      [
        'court',
        'customerName',
        'endsAt',
        'id',
        'payment',
        'price',
        'startsAt',
      ].sort(),
    );
    expect(Object.keys(item.court).sort()).toEqual(['name', 'sport']);
    expect(Object.keys(item.payment).sort()).toEqual([
      'hasPendingProof',
      'paidAmount',
      'status',
    ]);
    expect(item.customerName).toBe('Ana Jugadora');
    expect(item.startsAt).toBe('2026-09-13T17:00:00-03:00');
  });

  it('builds the name from first name only, or null without customer', async () => {
    findMany.mockResolvedValue([
      row({ customer: { firstName: 'Ana', lastName: null } }),
      row({ customer: null }),
    ]);
    const items = await service.list(complexFixture);
    expect(items.map((i) => i.customerName)).toEqual(['Ana', null]);
  });

  it('summarizes payments ignoring voided ones and flags pending proofs', async () => {
    findMany.mockResolvedValue([
      row({
        payments: [
          { amount: 4000, voidedAt: null },
          { amount: 3000, voidedAt: new Date() },
        ],
        paymentProofs: [{ id: 'p1' }],
      }),
    ]);
    const [item] = await service.list(complexFixture);
    expect(item.payment).toEqual({
      paidAmount: 4000,
      status: 'PARTIAL',
      hasPendingProof: true,
    });
  });
});
