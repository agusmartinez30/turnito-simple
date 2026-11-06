import { api } from '@/lib/api/client';
import type { Sport } from '@/types';
import type { AdminCourt } from '@/types/admin';

export interface CreateCourtPayload {
  name: string;
  sport: Sport;
  surface?: string;
  isIndoor: boolean;
  imageUrl?: string;
  sortOrder?: number;
  openTime: string;
  closeTime: string;
  slotDurationMinutes: number;
  pricePerSlot: number;
  isActive?: boolean;
}

/** `surface` / `imageUrl` en `null` borran el valor; `undefined` no toca el campo. */
export type UpdateCourtPayload = Partial<
  Omit<CreateCourtPayload, 'surface' | 'imageUrl'>
> & {
  surface?: string | null;
  imageUrl?: string | null;
};

export function listAdminCourts(): Promise<AdminCourt[]> {
  return api.get<AdminCourt[]>('/admin/courts');
}

export function getAdminCourt(id: string): Promise<AdminCourt> {
  return api.get<AdminCourt>(`/admin/courts/${id}`);
}

export function createCourt(payload: CreateCourtPayload): Promise<AdminCourt> {
  return api.post<AdminCourt>('/admin/courts', { body: payload });
}

export function updateCourt(
  id: string,
  payload: UpdateCourtPayload,
): Promise<AdminCourt> {
  return api.patch<AdminCourt>(`/admin/courts/${id}`, { body: payload });
}
