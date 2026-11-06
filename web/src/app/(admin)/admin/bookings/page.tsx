import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminBookingsList } from '@/features/admin-bookings/components/AdminBookingsList';

export const metadata: Metadata = { title: 'Reservas' };

export default function AdminBookingsPage() {
  return (
    <Suspense>
      <AdminBookingsList />
    </Suspense>
  );
}
