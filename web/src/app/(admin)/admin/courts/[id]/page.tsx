import type { Metadata } from 'next';
import { EditCourtPage } from '@/features/admin-courts/components/CourtFormPage';

export const metadata: Metadata = { title: 'Editar cancha' };

export default async function AdminEditCourtPage({
  params,
}: PageProps<'/admin/courts/[id]'>) {
  const { id } = await params;
  return <EditCourtPage id={id} />;
}
