import type { Metadata } from 'next';
import { CustomerDetailPage } from '@/features/admin-customers/components/CustomerDetailPage';

export const metadata: Metadata = { title: 'Cliente' };

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerDetailPage id={id} />;
}
