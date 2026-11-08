import type { Metadata } from 'next';
import { AdminGate } from '@/features/admin-shell/components/AdminGate';

export const metadata: Metadata = {
  title: { default: 'Administración', template: '%s · Administración' },
};

/**
 * Layout del panel: el proxy garantiza cookie + role en el JWT; AdminGate confirma contra /auth/me
 * y monta el shell y el realtime según el rol (el realtime es solo del complejo).
 */
export default function AdminLayout({ children }: LayoutProps<'/'>) {
  return <AdminGate>{children}</AdminGate>;
}
