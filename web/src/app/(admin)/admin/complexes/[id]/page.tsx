import type { Metadata } from 'next';
import { ComplexDetail } from '@/features/super-admin/components/ComplexDetail';

export const metadata: Metadata = { title: 'Complejo' };

export default async function SuperAdminComplexDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ComplexDetail id={id} />;
}
