import { api } from '@/lib/api/client';
import type { SuperAdminComplex, SuperAdminRevenue } from '@/types/admin';

/** `month` is `YYYY-MM`; the API defaults to the current month of each complex. */
export function listSuperAdminComplexes(
  month?: string,
): Promise<SuperAdminComplex[]> {
  return api.get<SuperAdminComplex[]>('/super-admin/complexes', {
    query: { month },
  });
}

export function setComplexSuspension(
  id: string,
  suspended: boolean,
): Promise<SuperAdminComplex> {
  return api.patch<SuperAdminComplex>(
    `/super-admin/complexes/${id}/suspension`,
    {
      body: { suspended },
    },
  );
}

/** `month` is `YYYY-MM`; the API defaults to the current month of the complex. */
export function getComplexRevenue(
  id: string,
  month?: string,
): Promise<SuperAdminRevenue> {
  return api.get<SuperAdminRevenue>(`/super-admin/complexes/${id}/revenue`, {
    query: { month },
  });
}
