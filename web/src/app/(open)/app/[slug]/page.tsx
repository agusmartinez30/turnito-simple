import type { Metadata } from 'next';
import { PublicBookingsView } from '@/features/public-bookings/components/PublicBookingsView';

export const metadata: Metadata = { title: 'Pagar turno' };

export default function PublicBookingsPage() {
  return <PublicBookingsView />;
}
