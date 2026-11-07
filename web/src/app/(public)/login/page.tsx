import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthSplitShell } from '@/features/auth/components/AuthSplitShell';
import { LoginForm } from '@/features/auth/components/LoginForm';

export const metadata: Metadata = { title: 'Ingresar' };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const next = firstParam(params.next);
  const expired = firstParam(params.expired) === '1';
  const registerHref = next
    ? `/register?next=${encodeURIComponent(next)}`
    : '/register';

  return (
    <AuthSplitShell
      eyebrow="Cobros de tu complejo, en un solo lugar"
      title="Gestioná los pagos de tus canchas"
      description="Seguí quién pagó, quién debe y cuánto cobraste, sin planillas ni mensajes de ida y vuelta."
    >
      <h1 className="text-2xl font-semibold">Ingresar</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        Controlá los pagos y cobros de tu complejo.
      </p>
      <LoginForm next={next} expired={expired} />
      <p className="text-muted-foreground mt-6 text-center text-sm">
        ¿Todavía no cargaste tu complejo?{' '}
        <Link
          href={registerHref}
          className="text-primary font-medium hover:underline"
        >
          Crealo
        </Link>
      </p>
    </AuthSplitShell>
  );
}
