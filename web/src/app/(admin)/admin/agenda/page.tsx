import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AgendaView } from '@/features/admin-agenda/components/AgendaView';

export const metadata: Metadata = { title: 'Agenda' };

export default function AdminAgendaPage() {
  return (
    <Suspense>
      <AgendaView />
    </Suspense>
  );
}
