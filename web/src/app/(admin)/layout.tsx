import type { Metadata } from 'next';
import { AdminRealtimeProvider } from '@/features/realtime/AdminRealtimeProvider';
import { AdminGate } from '@/features/admin-shell/components/AdminGate';

export const metadata: Metadata = {
  title: { default: 'Administración', template: '%s · Administración' },
};

/** Layout del panel: el proxy garantiza cookie + role en el JWT; AdminGate confirma contra /auth/me. */
export default function AdminLayout({ children }: LayoutProps<'/'>) {
  return (
    <AdminGate>
      <AdminRealtimeProvider>{children}</AdminRealtimeProvider>
    </AdminGate>
  );
}
