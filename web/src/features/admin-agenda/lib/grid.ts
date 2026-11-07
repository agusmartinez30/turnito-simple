import type { AdminBooking } from '@/types/admin';
import {
  type SlotStart,
  slotStartsFor,
} from '@/features/admin-bookings/lib/slot-starts';

interface CourtSchedule {
  id: string;
  openTime: string;
  closeTime: string;
  slotDurationMinutes: number;
}

export interface AgendaRow extends SlotStart {
  /** Epoch ms of `startsAt`, used as the row identity. */
  time: number;
}

export function cellKey(courtId: string, time: number): string {
  return `${courtId}|${time}`;
}

/**
 * Union of the slot starts of every court for a business day, sorted by time. Courts with
 * different hours or durations share one row set; a court without a slot at a row is "closed" there.
 */
export function buildAgendaRows(
  date: string,
  courts: CourtSchedule[],
  timezone: string,
): AgendaRow[] {
  const rows = new Map<number, AgendaRow>();
  for (const court of courts) {
    for (const slot of slotStartsFor(date, court, timezone)) {
      const time = new Date(slot.startsAt).getTime();
      if (!rows.has(time)) rows.set(time, { ...slot, time });
    }
  }
  return [...rows.values()].sort((a, b) => a.time - b.time);
}

/** Set of `cellKey`s where a court has a bookable slot. */
export function buildSlotIndex(
  date: string,
  courts: CourtSchedule[],
  timezone: string,
): Set<string> {
  const index = new Set<string>();
  for (const court of courts) {
    for (const slot of slotStartsFor(date, court, timezone)) {
      index.add(cellKey(court.id, new Date(slot.startsAt).getTime()));
    }
  }
  return index;
}

/** Active (non-cancelled) bookings indexed by court and start instant. */
export function indexBookings(
  bookings: AdminBooking[],
): Map<string, AdminBooking> {
  const map = new Map<string, AdminBooking>();
  for (const b of bookings) {
    if (b.status === 'CANCELLED') continue;
    map.set(cellKey(b.courtId, new Date(b.startsAt).getTime()), b);
  }
  return map;
}
