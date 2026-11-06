import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CustomersList } from '@/features/admin-customers/components/CustomersList';

export const metadata: Metadata = { title: 'Clientes' };

export default function AdminCustomersPage() {
  return (
    <Suspense>
      <CustomersList />
    </Suspense>
  );
}
