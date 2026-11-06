import type { Metadata } from 'next';
import { AdminBookingDetail } from '@/features/admin-bookings/components/AdminBookingDetail';

export const metadata: Metadata = { title: 'Reserva' };

export default async function AdminBookingPage({
  params,
}: PageProps<'/admin/bookings/[id]'>) {
  const { id } = await params;
  return <AdminBookingDetail id={id} />;
}
