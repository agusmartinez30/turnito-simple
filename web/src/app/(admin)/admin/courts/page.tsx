import type { Metadata } from 'next';
import { CourtsList } from '@/features/admin-courts/components/CourtsList';

export const metadata: Metadata = { title: 'Canchas' };

export default function AdminCourtsPage() {
  return <CourtsList />;
}
