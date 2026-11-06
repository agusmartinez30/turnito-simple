import type { Metadata } from 'next';
import { PublicPaymentView } from '@/features/public-payment/components/PublicPaymentView';

export const metadata: Metadata = { title: 'Pagar turno' };

export default async function PublicPaymentPage({
  params,
}: PageProps<'/app/[slug]/pagar/[id]'>) {
  const { id } = await params;
  return <PublicPaymentView id={id} />;
}
