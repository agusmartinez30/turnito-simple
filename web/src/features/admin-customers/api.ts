import { api } from '@/lib/api/client';
import type {
  AdminCustomer,
  AdminCustomerDetail,
  CustomerStatusFilter,
} from '@/types/admin';

export interface CustomerFilters {
  q?: string;
  status?: CustomerStatusFilter;
  limit?: number;
}

export function listCustomers(
  filters: CustomerFilters = {},
): Promise<AdminCustomer[]> {
  return api.get<AdminCustomer[]>('/admin/customers', {
    query: { ...filters },
  });
}

export function getCustomer(id: string): Promise<AdminCustomerDetail> {
  return api.get<AdminCustomerDetail>(`/admin/customers/${id}`);
}

export interface CreateCustomerPayload {
  firstName: string;
  lastName?: string;
  phone?: string;
  note?: string;
}

/** `null` borra el valor; `undefined` no toca el campo. */
export type UpdateCustomerPayload = Partial<
  Omit<CreateCustomerPayload, 'lastName' | 'phone' | 'note'>
> & {
  lastName?: string | null;
  phone?: string | null;
  note?: string | null;
  isActive?: boolean;
};

export function createCustomer(
  payload: CreateCustomerPayload,
): Promise<AdminCustomer> {
  return api.post<AdminCustomer>('/admin/customers', { body: payload });
}

export function updateCustomer(
  id: string,
  payload: UpdateCustomerPayload,
): Promise<AdminCustomer> {
  return api.patch<AdminCustomer>(`/admin/customers/${id}`, { body: payload });
}
