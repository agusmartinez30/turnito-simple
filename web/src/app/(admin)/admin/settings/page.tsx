import type { Metadata } from 'next';
import { SettingsPage } from '@/features/admin-settings/components/SettingsPage';

export const metadata: Metadata = { title: 'Mi complejo' };

export default function AdminSettingsPage() {
  return <SettingsPage />;
}
