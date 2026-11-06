'use client';

import { useSyncExternalStore } from 'react';

/** `true` si el media query matchea. En SSR devuelve `false`. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Breakpoint `md` de Tailwind (768 px): a partir de acá el diálogo de reserva es `Dialog`, no `Sheet`. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)');
}
