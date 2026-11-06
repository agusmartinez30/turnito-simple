import type { Metadata } from 'next';
import { NewCustomerPage } from '@/features/admin-customers/components/CustomerFormPage';

export const metadata: Metadata = { title: 'Nuevo cliente' };

export default function AdminNewCustomerPage() {
  return <NewCustomerPage />;
}
