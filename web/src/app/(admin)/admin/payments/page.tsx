import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PaymentsLedger } from '@/features/admin-payments/components/PaymentsLedger';

export const metadata: Metadata = { title: 'Pagos' };

export default function AdminPaymentsPage() {
  return (
    <Suspense>
      <PaymentsLedger />
    </Suspense>
  );
}
