import type { Metadata } from 'next';
import { NewCourtPage } from '@/features/admin-courts/components/CourtFormPage';

export const metadata: Metadata = { title: 'Nueva cancha' };

export default function AdminNewCourtPage() {
  return <NewCourtPage />;
}
