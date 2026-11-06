/** Modelo de datos tal como lo consume la web (docs/00-overview.md). */

export type Sport = 'PADEL' | 'FOOTBALL_5' | 'FOOTBALL_7' | 'TENNIS';

export interface Complex {
  id: string;
  /** Identificador de las rutas públicas: /app/[slug] (docs/16-multi-complex.md). */
  slug: string;
  name: string;
  address: string;
  timezone: string; // IANA, ej. "America/Argentina/Buenos_Aires"
  cancellationWindowHours: number;
  autoConfirmPublicRequests: boolean;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  /** WhatsApp público de contacto, '+' + dígitos: botón "Inscribirme" de los torneos. */
  contactWhatsapp: string | null;
  /** Hex #rrggbb. null = paleta Clubix (lib/theme.ts, docs/19-branding.md). */
  primaryColor: string | null;
  secondaryColor: string | null;
  /** URL pública del logo. Solo lectura: se cambia subiendo un archivo (docs/19-branding.md). */
  logoUrl: string | null;
  /** Datos bancarios para transferencias (solo en las respuestas de admin). */
  bankCbu: string | null;
  bankAlias: string | null;
  bankHolderName: string | null;
}

export interface Court {
  id: string;
  complexId: string;
  name: string;
  sport: Sport;
  surface?: string;
  isIndoor: boolean;
  slotDurationMinutes: number;
  openTime: string; // "08:00" (hora local del complejo)
  closeTime: string; // "23:00"
  pricePerSlot: number;
  isActive: boolean;
  imageUrl?: string;
}

export type TimeSlotStatus = 'AVAILABLE' | 'BOOKED' | 'BLOCKED' | 'PAST';

/** Derivado. Lo devuelve la API por día y cancha. */
export interface TimeSlot {
  startsAt: string; // ISO-8601 con offset
  endsAt: string;
  status: TimeSlotStatus;
}

export interface Availability {
  date: string; // YYYY-MM-DD
  timezone: string;
  slots: TimeSlot[];
}

/** PENDING: solicitud pública sin confirmar (docs/10-public-request.md). */
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';

/** Quién canceló una reserva: un admin desde el panel o el vencimiento automático. */
export type BookingActor = 'ADMIN' | 'SYSTEM';

export type UserRole = 'PLAYER' | 'ADMIN';

export type CourtSummary = Pick<
  Court,
  'id' | 'name' | 'sport' | 'isIndoor' | 'imageUrl'
>;

export interface Booking {
  id: string;
  courtId: string;
  court: CourtSummary;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  price: number;
  createdAt: string;
  cancelledAt?: string;
  cancelledBy?: BookingActor;
  cancellationReason?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  /** Complejo que administra; null para jugadores (docs/16-multi-complex.md). */
  complexId: string | null;
}

export interface AuthResult {
  accessToken: string;
  expiresAt: string;
  user: User;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'EMAIL_ALREADY_EXISTS'
  | 'SLOT_UNAVAILABLE'
  | 'BOOKING_IN_PAST'
  | 'BOOKING_ALREADY_CANCELLED'
  | 'BOOKING_ALREADY_FINISHED'
  | 'COURT_NAME_ALREADY_EXISTS'
  | 'CUSTOMER_PHONE_ALREADY_EXISTS'
  | 'CUSTOMER_ARCHIVED'
  | 'COURT_HAS_FUTURE_BOOKINGS'
  | 'BOOKING_NOT_PENDING'
  | 'BOOKING_NOT_CONFIRMED'
  | 'BOOKING_ALREADY_STARTED'
  | 'BOOKING_NOT_TODAY'
  | 'BOOKING_NOT_STARTED'
  | 'BOOKING_NOT_PAYABLE'
  | 'PAYMENT_ALREADY_VOIDED'
  | 'PAYMENT_PROOF_NOT_PENDING'
  | 'RATE_LIMITED'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'LOGO_UPLOAD_FAILED'
  | 'INTERNAL_ERROR'
  /** Solo del lado de la web: fetch falló antes de recibir respuesta. */
  | 'NETWORK_ERROR';

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, string[]>;
  };
}

export type PublicComplex = Pick<
  Complex,
  | 'slug'
  | 'name'
  | 'address'
  | 'timezone'
  | 'cancellationWindowHours'
  | 'instagramUrl'
  | 'facebookUrl'
  | 'tiktokUrl'
  | 'youtubeUrl'
  | 'contactWhatsapp'
  | 'primaryColor'
  | 'secondaryColor'
  | 'logoUrl'
>;
