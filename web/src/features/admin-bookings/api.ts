import { api } from '@/lib/api/client';
import type { BookingStatus } from '@/types';
import type { AdminBooking, AdminCustomer } from '@/types/admin';

export interface AdminBookingFilters {
  date?: string;
  from?: string;
  to?: string;
  courtId?: string;
  status?: BookingStatus;
  q?: string;
  order?: 'asc' | 'desc';
  limit?: number;
}

export function listAdminBookings(
  filters: AdminBookingFilters = {},
): Promise<AdminBooking[]> {
  return api.get<AdminBooking[]>('/admin/bookings', { query: { ...filters } });
}

export function getAdminBooking(id: string): Promise<AdminBooking> {
  return api.get<AdminBooking>(`/admin/bookings/${id}`);
}

export function cancelAdminBooking(
  id: string,
  reason?: string,
): Promise<AdminBooking> {
  return api.patch<AdminBooking>(`/admin/bookings/${id}/cancel`, {
    body: reason ? { reason } : {},
  });
}

/** PENDING → CONFIRMED (docs/10-public-request.md). */
export function confirmAdminBooking(id: string): Promise<AdminBooking> {
  return api.patch<AdminBooking>(`/admin/bookings/${id}/confirm`);
}

/** Inicio manual del turno (docs/13-turn-progress.md): solo CONFIRMED de hoy, una vez. */
export function startAdminBooking(id: string): Promise<AdminBooking> {
  return api.patch<AdminBooking>(`/admin/bookings/${id}/start`);
}

/** Fin manual del turno iniciado: congela el cronómetro. */
export function finishAdminBooking(id: string): Promise<AdminBooking> {
  return api.patch<AdminBooking>(`/admin/bookings/${id}/finish`);
}

export interface CreateAdminBookingPayload {
  courtId: string;
  startsAt: string;
  customerId?: string;
  price?: number;
  note?: string;
}

export function createAdminBooking(
  payload: CreateAdminBookingPayload,
): Promise<AdminBooking> {
  return api.post<AdminBooking>('/admin/bookings', { body: payload });
}

export function searchCustomers(
  q: string,
  limit = 10,
): Promise<AdminCustomer[]> {
  return api.get<AdminCustomer[]>('/admin/customers', {
    query: { q, limit, status: 'active' },
  });
}
