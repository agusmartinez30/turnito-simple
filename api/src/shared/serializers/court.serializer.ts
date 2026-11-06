import { Court, Sport } from '@prisma/client';
import { toComplexIso } from '../time/tz';

/** Forma exacta del contrato `Court`. Omite sortOrder/createdAt/updatedAt; los null se omiten. */
export interface CourtResponse {
  id: string;
  complexId: string;
  name: string;
  sport: Sport;
  surface?: string;
  isIndoor: boolean;
  slotDurationMinutes: number;
  openTime: string;
  closeTime: string;
  pricePerSlot: number;
  isActive: boolean;
  imageUrl?: string;
}

export function toCourtResponse(court: Court): CourtResponse {
  return {
    id: court.id,
    complexId: court.complexId,
    name: court.name,
    sport: court.sport,
    ...(court.surface ? { surface: court.surface } : {}),
    isIndoor: court.isIndoor,
    slotDurationMinutes: court.slotDurationMinutes,
    openTime: court.openTime,
    closeTime: court.closeTime,
    pricePerSlot: court.pricePerSlot,
    isActive: court.isActive,
    ...(court.imageUrl ? { imageUrl: court.imageUrl } : {}),
  };
}

/** Versión embebida en `Booking.court`. */
export interface CourtSummaryResponse {
  id: string;
  name: string;
  sport: Sport;
  isIndoor: boolean;
  imageUrl?: string;
}

export function toCourtSummaryResponse(court: Court): CourtSummaryResponse {
  return {
    id: court.id,
    name: court.name,
    sport: court.sport,
    isIndoor: court.isIndoor,
    ...(court.imageUrl ? { imageUrl: court.imageUrl } : {}),
  };
}

/** Contrato AdminCourt (web/docs/05-admin-overview.md): Court + campos administrativos. */
export interface AdminCourtResponse extends CourtResponse {
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  futureBookingsCount: number;
}

export function toAdminCourtResponse(
  court: Court,
  futureBookingsCount: number,
  timezone: string,
): AdminCourtResponse {
  return {
    ...toCourtResponse(court),
    sortOrder: court.sortOrder,
    createdAt: toComplexIso(court.createdAt, timezone),
    updatedAt: toComplexIso(court.updatedAt, timezone),
    futureBookingsCount,
  };
}
