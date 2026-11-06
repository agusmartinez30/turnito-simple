'use client';

import Link from 'next/link';
import { ComplexMark } from '@/components/layout/ComplexMark';
import { Skeleton } from '@/components/ui/skeleton';
import { APP_NAME } from '@/lib/app-name';
import { usePublicComplex, usePublicHome } from '../hooks';

/**
 * Layout de /app/[slug] (docs/10-public-request.md › OpenShell): header mínimo, sin panel.
 * Los clientes no tienen cuenta, así que tampoco hay "Ingresar" / "Mi cuenta".
 * `data-surface="open"` activa los tokens de color y tipografía de esta superficie (globals.css).
 */
export function OpenShell({ children }: { children: React.ReactNode }) {
  const complex = usePublicComplex();
  const home = usePublicHome();
  const socials: SocialLink[] = complex.data
    ? [
        {
          href: complex.data.instagramUrl,
          label: 'Instagram',
          Icon: InstagramIcon,
        },
        {
          href: complex.data.facebookUrl,
          label: 'Facebook',
          Icon: FacebookIcon,
        },
        { href: complex.data.tiktokUrl, label: 'TikTok', Icon: TikTokIcon },
        { href: complex.data.youtubeUrl, label: 'YouTube', Icon: YoutubeIcon },
      ].flatMap((item) => (item.href ? [{ ...item, href: item.href }] : []))
    : [];

  return (
    <div data-surface="open" className="flex min-h-full flex-1 flex-col">
      <header className="bg-background/90 supports-backdrop-filter:bg-background/75 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-xl items-center px-4">
          <Link
            href={home}
            className="focus-visible:ring-ring/50 -mx-2 flex min-w-0 items-center gap-3 rounded-lg px-2 py-1 outline-none focus-visible:ring-[3px]"
            aria-label="Inicio"
          >
            {/*
             * Acá el logo es la marca del complejo al que el cliente le está pidiendo turno, no
             * un ícono de navegación: va a 40 px — dos tercios del header — y con `fluid`, así un
             * logo cuadrado ocupa los 40 px de alto en vez de encogerse al 18 que pedía la caja
             * apaisada del ícono de la cancha. El `max-w` frena a un wordmark muy ancho antes de
             * que le coma el lugar al nombre.
             */}
            <ComplexMark
              logoUrl={complex.data?.logoUrl}
              pending={complex.isPending}
              fluid
              className="h-10 max-w-32 rounded-lg p-1"
              fallback={<Mark />}
            />
            <span className="font-display truncate text-lg font-semibold tracking-tight">
              {complex.data ? (
                complex.data.name
              ) : complex.isPending ? (
                <Skeleton className="h-4 w-28" />
              ) : (
                APP_NAME
              )}
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-10 px-4 pt-8 pb-16">
        {children}
      </main>

      {complex.data && (
        <footer className="text-muted-foreground mx-auto w-full max-w-xl px-4 pb-8 text-xs">
          {socials.length > 0 && (
            <div className="mb-4 flex items-center gap-3">
              {socials.map(({ href, label, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className={SOCIAL_LINK}
                >
                  <Icon className="size-4.5" />
                </a>
              ))}
            </div>
          )}
          <p>{complex.data.name}</p>
          {complex.data.address && <p>{complex.data.address}</p>}
        </footer>
      )}
    </div>
  );
}

/**
 * Ícono de red del footer. El contorno es `border` a secas, o sea `--border`, que en esta
 * superficie es blanco al 22%: sobre el fondo de marca se lee como un filete y no como una caja,
 * y sigue al matiz del complejo sin que haya que calcular nada acá.
 *
 * El círculo también arregla el área táctil: pasa de los 18 px del glifo a 36, que es el
 * `icon-lg` del design system.
 */
const SOCIAL_LINK =
  'text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-foreground/10 focus-visible:ring-ring/50 flex size-9 items-center justify-center rounded-full border transition-colors focus-visible:ring-[3px] focus-visible:outline-none';

type SocialIcon = (props: { className?: string }) => React.ReactNode;

type SocialLink = { href: string; label: string; Icon: SocialIcon };

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 1 1-2.31-2.83v-3.5a6.37 6.37 0 1 0 5.76 6.33V8.69a8.18 8.18 0 0 0 4.77 1.52V6.69z" />
    </svg>
  );
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </svg>
  );
}

/** Fallback de la marca cuando el complejo no subió su logo: una cancha en miniatura. */
function Mark() {
  return (
    <svg
      viewBox="0 0 28 18"
      aria-hidden
      className="text-primary h-6 w-9.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    >
      <rect x="1" y="1" width="26" height="16" rx="2" />
      <line x1="14" y1="1" x2="14" y2="17" />
      <circle cx="14" cy="9" r="3" />
    </svg>
  );
}
