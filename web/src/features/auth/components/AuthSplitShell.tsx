import Image from 'next/image';
import { VolleyballIcon } from 'lucide-react';
import { APP_NAME } from '@/lib/app-name';
import { cn } from '@/lib/utils';

interface Props {
  /** Etiqueta corta en lima sobre la imagen. */
  eyebrow: string;
  /** Titular de la imagen (lado izquierdo). */
  title: string;
  /** Texto secundario de la imagen. */
  description: string;
  /** Formulario y contenido del lado derecho. */
  children: React.ReactNode;
  /** El alta de complejo tiene dos bloques de campos y necesita más ancho. */
  wide?: boolean;
}

/** Pantalla dividida de auth: imagen a la izquierda, formulario a la derecha. */
export function AuthSplitShell({
  eyebrow,
  title,
  description,
  children,
  wide,
}: Props) {
  return (
    <main className="flex flex-1 flex-col lg:flex-row">
      {/* Imagen y mensaje de marca, solo en pantallas grandes. */}
      <aside className="relative hidden lg:block lg:w-1/2">
        <Image
          src="/login-court.jpg"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
        <div className="from-sidebar/90 via-sidebar/45 to-sidebar/15 absolute inset-0 bg-linear-to-t" />
        <div className="text-sidebar-foreground absolute inset-x-0 top-0 flex items-center gap-2 p-8">
          <VolleyballIcon className="size-6" />
          <span className="text-lg font-semibold">{APP_NAME}</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-8">
          <p className="text-highlight text-sm font-medium">{eyebrow}</p>
          <p className="text-sidebar-foreground max-w-md text-3xl font-semibold text-balance">
            {title}
          </p>
          <p className="text-sidebar-foreground/75 max-w-md text-sm">
            {description}
          </p>
        </div>
      </aside>

      {/* Formulario. */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className={cn('w-full', wide ? 'max-w-md' : 'max-w-sm')}>
          <div className="mb-8 flex items-center gap-2 text-lg font-semibold lg:hidden">
            <VolleyballIcon className="text-primary size-6" />
            {APP_NAME}
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
