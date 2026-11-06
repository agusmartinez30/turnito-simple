import { Booking, Complex, Court, Customer } from '@prisma/client';
import { BookingWithRelations } from '../serializers/booking.serializer';
import { PaymentWithRelations } from '../serializers/payment.serializer';

/**
 * Fixtures compartidos por los specs unitarios (Prisma mockeado).
 * "Ahora" de referencia: 2026-09-12 15:00 en Buenos Aires.
 */

export const BA = 'America/Argentina/Buenos_Aires';
export const NOW = new Date('2026-09-12T15:00:00-03:00');

export const complexFixture: Complex = {
  id: 'c1',
  slug: 'complejo-demo',
  name: 'Complejo Demo',
  address: 'Av. Siempreviva 742',
  timezone: BA,
  cancellationWindowHours: 24,
  autoConfirmPublicRequests: false,
  instagramUrl: null,
  facebookUrl: null,
  tiktokUrl: null,
  youtubeUrl: null,
  contactWhatsapp: null,
  primaryColor: null,
  secondaryColor: null,
  logoUrl: null,
  bankCbu: null,
  bankAlias: null,
  bankHolderName: null,
  createdAt: NOW,
  updatedAt: NOW,
};

export function courtFixture(overrides: Partial<Court> = {}): Court {
  return {
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
    ...overrides,
  };
}

/** Cliente del complejo: quien reserva (docs/17-admin-customers.md). No es una cuenta. */
export function customerFixture(overrides: Partial<Customer> = {}): Customer {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    complexId: 'c1',
    firstName: 'Ana',
    lastName: 'Jugadora',
    phone: '+5491100000001',
    note: null,
    isActive: true,
    source: 'PUBLIC',
    createdById: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** Cuenta de jugador heredada del MVP; hoy solo sirve para verificar el guard de rol. */
export const anaFixture = {
  id: 'u-ana',
  name: 'Ana Jugadora',
  email: 'ana@demo.com',
  phone: '+5491100000001',
  passwordHash: '',
  role: 'PLAYER' as const,
  complexId: null,
  createdAt: NOW,
  updatedAt: NOW,
};

export const adminFixture = {
  id: 'u-admin',
  name: 'Admin Demo',
  email: 'admin@demo.com',
  phone: null,
  passwordHash: '',
  role: 'ADMIN' as const,
  complexId: 'c1',
  createdAt: NOW,
  updatedAt: NOW,
};

export function paymentFixture(
  overrides: Partial<PaymentWithRelations> = {},
): PaymentWithRelations {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    bookingId: '33333333-3333-4333-8333-333333333333',
    amount: 2000,
    method: 'CASH',
    note: null,
    payerName: null,
    proofId: null,
    registeredById: adminFixture.id,
    createdAt: NOW,
    voidedAt: null,
    voidedById: null,
    voidReason: null,
    registeredBy: { id: adminFixture.id, name: adminFixture.name },
    voidedBy: null,
    ...overrides,
  };
}

export function bookingFixture(
  overrides: Partial<Booking> &
    Partial<
      Pick<
        BookingWithRelations,
        'customer' | 'court' | 'createdBy' | 'payments'
      >
    > = {},
): BookingWithRelations {
  const { customer, court, createdBy, ...rest } = overrides;
  const hasCustomer = 'customer' in overrides;
  return {
    id: '33333333-3333-4333-8333-333333333333',
    courtId: courtFixture().id,
    customerId: customerFixture().id,
    startsAt: new Date('2026-09-13T17:00:00-03:00'),
    endsAt: new Date('2026-09-13T18:30:00-03:00'),
    status: 'CONFIRMED',
    price: 12000,
    source: 'ADMIN',
    note: null,
    createdById: null,
    createdAt: NOW,
    cancelledAt: null,
    cancelledById: null,
    cancellationReason: null,
    expiresAt: null,
    confirmedAt: null,
    confirmedById: null,
    startedAt: null,
    startedById: null,
    finishedAt: null,
    finishedById: null,
    court: court ?? courtFixture(),
    customer: hasCustomer ? (customer ?? null) : customerFixture(),
    createdBy: createdBy ?? null,
    confirmedBy: null,
    startedBy: null,
    finishedBy: null,
    payments: [],
    ...rest,
  };
}
