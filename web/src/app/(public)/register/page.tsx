import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthSplitShell } from '@/features/auth/components/AuthSplitShell';
import { RegisterForm } from '@/features/auth/components/RegisterForm';

export const metadata: Metadata = { title: 'Crear complejo' };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RegisterPage({
  searchParams,
}: PageProps<'/register'>) {
  const next = firstParam((await searchParams).next);
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login';

  return (
    <AuthSplitShell
      wide
      eyebrow="Cobros de tu complejo, en un solo lugar"
      title="Empezá a gestionar tus pagos hoy"
      description="Cargá tu cuenta y tu complejo en dos pasos. Las canchas se agregan después desde el panel."
    >
      <h1 className="text-2xl font-semibold">Creá tu complejo</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        Dos pasos y listo: tu cuenta y tu complejo.
      </p>
      <RegisterForm next={next} />
      <p className="text-muted-foreground mt-6 text-center text-sm">
        ¿Ya tenés cuenta?{' '}
        <Link
          href={loginHref}
          className="text-primary font-medium hover:underline"
        >
          Ingresá
        </Link>
      </p>
    </AuthSplitShell>
  );
}
