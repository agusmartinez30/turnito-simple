import {
  Booking,
  BookingSource,
  BookingStatus,
  Complex,
  Court,
  Customer,
  CustomerSource,
  Payment,
  PaymentMethod,
  PaymentProof,
  PaymentProofStatus,
  Prisma,
  Sport,
  User,
  UserRole,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { prisma } from '../setup';

/**
 * Factories: insertan directo por Prisma sobre la base del seed.
 * Todas devuelven la entidad creada; los defaults son válidos por sí solos.
 */

let userSeq = 0;
let courtSeq = 0;
let customerSeq = 0;

// Hashear argon2 por cada usuario de test es lento; se reutiliza un hash por proceso.
let cachedHash: { password: string; hash: string } | undefined;
async function hashFor(password: string): Promise<string> {
  if (cachedHash?.password !== password) {
    cachedHash = { password, hash: await argon2.hash(password) };
  }
  return cachedHash.hash;
}

/** Complejo del seed por slug; por defecto Demo, "el complejo" de casi todos los tests. */
export async function getComplex(slug = 'complejo-demo'): Promise<Complex> {
  const complex = await prisma.complex.findUnique({ where: { slug } });
  if (!complex) {
    throw new Error(`No hay complex ${slug}: ¿corriste resetDatabase()?`);
  }
  return complex;
}

export async function getCourtByName(name: string): Promise<Court> {
  const court = await prisma.court.findFirst({ where: { name } });
  if (!court) throw new Error(`No existe la cancha "${name}" en el seed`);
  return court;
}

export interface CreateUserOptions {
  name?: string;
  email?: string;
  phone?: string | null;
  password?: string;
  /** Con `complexId` el usuario se crea como ADMIN de ese complejo. */
  complexId?: string;
}

export async function createUser(
  options: CreateUserOptions = {},
): Promise<User & { password: string }> {
  userSeq += 1;
  const password = options.password ?? 'password123';
  const user = await prisma.user.create({
    data: {
      name: options.name ?? `Usuario ${userSeq}`,
      email: options.email ?? `user${userSeq}-${Date.now()}@test.com`,
      phone: options.phone ?? null,
      passwordHash: await hashFor(password),
      ...(options.complexId
        ? { role: UserRole.ADMIN, complexId: options.complexId }
        : {}),
    },
  });
  return { ...user, password };
}

export async function createCourt(
  overrides: Partial<Omit<Prisma.CourtUncheckedCreateInput, 'id'>> = {},
): Promise<Court> {
  courtSeq += 1;
  const complexId = overrides.complexId ?? (await getComplex()).id;
  return prisma.court.create({
    data: {
      complexId,
      name: `Cancha test ${courtSeq}`,
      sport: Sport.PADEL,
      surface: 'cemento',
      isIndoor: false,
      slotDurationMinutes: 90,
      openTime: '08:00',
      closeTime: '23:00',
      pricePerSlot: 10000,
      isActive: true,
      sortOrder: 50 + courtSeq,
      ...overrides,
    },
  });
}

export interface CreateCustomerOptions {
  complexId: string;
  firstName?: string;
  lastName?: string | null;
  /** `null` = cliente de mostrador sin teléfono; omitido = uno único por cliente. */
  phone?: string | null;
  note?: string;
  isActive?: boolean;
  source?: CustomerSource;
  createdById?: string;
}

/** Cliente del complejo (docs/17-admin-customers.md). El teléfono default es único por llamada. */
export function createCustomer(
  options: CreateCustomerOptions,
): Promise<Customer> {
  customerSeq += 1;
  return prisma.customer.create({
    data: {
      complexId: options.complexId,
      firstName: options.firstName ?? `Cliente${customerSeq}`,
      lastName: options.lastName === undefined ? 'Test' : options.lastName,
      phone:
        options.phone === undefined
          ? `+549110000${String(1000 + customerSeq)}`
          : options.phone,
      note: options.note ?? null,
      isActive: options.isActive ?? true,
      source: options.source ?? CustomerSource.ADMIN,
      createdById: options.createdById ?? null,
    },
  });
}

export interface CreateBookingOptions {
  courtId: string;
  customerId: string;
  startsAt: Date;
  endsAt?: Date;
  status?: BookingStatus;
  price?: number;
  source?: BookingSource;
  /** Solo para PENDING; sin él se usa una hora antes del turno (el CHECK lo exige NOT NULL). */
  expiresAt?: Date;
}

export function createBooking(options: CreateBookingOptions): Promise<Booking> {
  const endsAt =
    options.endsAt ?? new Date(options.startsAt.getTime() + 90 * 60_000);
  const isPending = options.status === BookingStatus.PENDING;
  return prisma.booking.create({
    data: {
      courtId: options.courtId,
      customerId: options.customerId,
      startsAt: options.startsAt,
      endsAt,
      status: options.status ?? BookingStatus.CONFIRMED,
      price: options.price ?? 10000,
      expiresAt:
        options.expiresAt ??
        (isPending ? new Date(options.startsAt.getTime() - 60 * 60_000) : null),
      // El flujo de jugador ya no existe: una reserva de mostrador es lo normal.
      source: options.source ?? BookingSource.ADMIN,
      cancelledAt:
        options.status === BookingStatus.CANCELLED ? new Date() : null,
    },
  });
}

export interface CreatePaymentOptions {
  bookingId: string;
  registeredById: string;
  amount?: number;
  method?: PaymentMethod;
  note?: string;
  /** Lo crea ya anulado (por el mismo admin). */
  voided?: boolean;
  /** Sin él usa `now()` real de la DB: pasarlo cuando el test filtra por fecha. */
  createdAt?: Date;
}

export function createPayment(options: CreatePaymentOptions): Promise<Payment> {
  return prisma.payment.create({
    data: {
      bookingId: options.bookingId,
      registeredById: options.registeredById,
      amount: options.amount ?? 1000,
      method: options.method ?? PaymentMethod.CASH,
      note: options.note ?? null,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      ...(options.voided
        ? { voidedAt: new Date(), voidedById: options.registeredById }
        : {}),
    },
  });
}

export interface CreatePaymentProofOptions {
  bookingId: string;
  status?: PaymentProofStatus;
  declaredAmount?: number;
}

/** Transfer proof attached to a booking (the file key is a placeholder: storage is not read). */
export function createPaymentProof(
  options: CreatePaymentProofOptions,
): Promise<PaymentProof> {
  return prisma.paymentProof.create({
    data: {
      bookingId: options.bookingId,
      fileKey: `test/${options.bookingId}.png`,
      payerName: 'Pagador Test',
      declaredAmount: options.declaredAmount ?? 1000,
      status: options.status ?? PaymentProofStatus.PENDING,
    },
  });
}
