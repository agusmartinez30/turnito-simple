import type { Metadata } from 'next';
import { ComplexesList } from '@/features/super-admin/components/ComplexesList';

export const metadata: Metadata = { title: 'Complejos' };

export default function SuperAdminComplexesPage() {
  return <ComplexesList />;
}
