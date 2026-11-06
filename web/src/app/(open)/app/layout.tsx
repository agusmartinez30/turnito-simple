import type { Metadata } from 'next';
import { Bricolage_Grotesque } from 'next/font/google';
import { OpenShell } from '@/features/public-request/components/OpenShell';

export const metadata: Metadata = {
  title: { default: 'Pedir turno', template: '%s · Pedir turno' },
};

/** Tipografía display de /app (títulos, horas grandes). Solo se carga en esta superficie. */
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz', 'wdth'],
  display: 'swap',
});

/** Rutas abiertas /app/[slug]/* (docs/10-public-request.md): se sirven con o sin sesión y no miran la cookie. */
export default function OpenLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      {/* En <body> y no en un wrapper: los Dialog/Sheet se portalean y también la necesitan. */}
      <style>{`body:has([data-surface='open']){--font-display:${display.style.fontFamily};}`}</style>
      <OpenShell>{children}</OpenShell>
    </>
  );
}
