import type {
  Booking,
  BookingActor,
  BookingStatus,
  Court,
  CourtSummary,
} from './index';

/** Tipos del panel de administración . */

/** Cliente del complejo, sin cuenta (docs/17-admin-customers.md / 18-admin-customers.md). */
export interface BookingCustomer {
  id: string;
  name: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  isActive: boolean;
}

export type BookingSource = 'PLAYER' | 'ADMIN' | 'PUBLIC';

export type CustomerSource = 'PUBLIC' | 'ADMIN';

export type CustomerStatusFilter = 'active' | 'archived' | 'all';

/** Pagos por turno (docs/12-admin-payments.md). */
export type PaymentMethod = 'CASH' | 'TRANSFER';
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export type PaymentProofStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Comprobante de transferencia subido desde el link público de pago. */
export interface PaymentProof {
  id: string;
  status: PaymentProofStatus;
  /** Nombre de quien paga, cargado por el jugador. */
  payerName: string;
  /** Cuántos jugadores cubre la transferencia (opcional). */
  playersCount: number | null;
  /** Monto que el jugador declara (0 en filas anteriores al cambio). */
  declaredAmount: number;
  /** Monto acreditado al aprobar; null mientras está pendiente o rechazado. */
  amount: number | null;
  createdAt: string;
  reviewedAt: string | null;
  rejectReason: string | null;
}

/** Derivado por la API: Σ pagos no anulados contra `price`. `balance < 0` = saldo a favor. */
export interface PaymentSummary {
  paidAmount: number;
  balance: number;
  status: PaymentStatus;
}

export interface Payment {
  id: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
  payerName?: string;
  proofId?: string;
  createdAt: string;
  registeredBy: { id: string; name: string };
  voidedAt?: string;
  voidedBy?: { id: string; name: string };
  voidReason?: string;
}

/** Turno al que pertenece una fila del listado de caja. */
export interface LedgerBooking {
  id: string;
  status: BookingStatus;
  price: number;
  startsAt: string;
  endsAt: string;
  court: CourtSummary;
  customer: BookingCustomer | null;
}

/** Fila del listado de pagos (`/admin/payments`): el pago más el turno al que pertenece. */
export interface PaymentLedgerRow extends Payment {
  booking: LedgerBooking;
}

/** Comprobante del listado de caja: PENDING siempre, REJECTED solo con `voided`. Nunca suma en totales. */
export interface PaymentProofLedgerRow {
  id: string;
  status: PaymentProofStatus;
  payerName: string;
  playersCount: number | null;
  /** Monto declarado por el pagador; no es dinero cobrado. */
  declaredAmount: number;
  createdAt: string;
  reviewedAt: string | null;
  rejectReason: string | null;
  booking: LedgerBooking;
}

export interface PaymentLedgerTotals {
  collected: number; // cash + transfer
  cash: number;
  transfer: number;
  count: number; // pagos vigentes del período
}

export interface PaymentLedger {
  range: { from: string; to: string }; // YYYY-MM-DD, días locales inclusive
  totals: PaymentLedgerTotals; // nunca incluyen anulados; independientes de `limit`
  payments: PaymentLedgerRow[]; // createdAt desc
  proofs: PaymentProofLedgerRow[]; // createdAt desc; PENDING sin importar el rango
}

/** Reserva tal como la ve el panel: la reserva más el cliente y la trazabilidad. */
export interface AdminBooking extends Booking {
  customer: BookingCustomer | null;
  source: BookingSource;
  note?: string;
  createdBy?: { id: string; name: string };
  cancelledBy?: BookingActor;
  cancellationReason?: string;
  expiresAt?: string; // solo PENDING
  confirmedAt?: string;
  confirmedBy?: { id: string; name: string };
  startedAt?: string; // inicio manual del turno desde el panel (docs/13-turn-progress.md)
  startedBy?: { id: string; name: string };
  finishedAt?: string; // fin manual: congela el cronómetro
  finishedBy?: { id: string; name: string };
  payment: PaymentSummary;
  payments?: Payment[]; // solo en el detalle y en las respuestas de pagos (createdAt desc)
}

/** Cancha con los campos administrativos que la web de jugadores no ve. */
export interface AdminCourt extends Court {
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  futureBookingsCount: number;
}

/** Fila del listado de `/admin/customers`. */
export interface AdminCustomer extends BookingCustomer {
  note?: string;
  source: CustomerSource;
  createdAt: string;
  bookingsCount: number;
  lastBookingAt?: string;
}

export interface CustomerStats {
  bookings: {
    confirmed: number;
    pending: number;
    cancelled: number;
  };
  billed: number;
  paid: number;
  balance: number;
}

export interface AdminCustomerDetail extends AdminCustomer {
  stats: CustomerStats;
  bookings: AdminBooking[];
}

/** Complejo con sus métricas del mes, para el panel de plataforma (docs/26-super-admin.md). */
export interface SuperAdminComplex {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
  /** `null` = activo. */
  suspendedAt: string | null;
  /** Mes de las métricas (YYYY-MM). */
  month: string;
  bookingsCount: number;
  proofsCount: number;
  approvedProofsCount: number;
  /** `null` si no hay reservas en el mes. */
  proofsPerBooking: number | null;
  approvedProofsPerBooking: number | null;
}
