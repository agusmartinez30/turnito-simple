import { GoalIcon, VolleyballIcon, type LucideIcon } from 'lucide-react';
import type { Sport } from '@/types';

/**
 * Tono de gris de la superficie de cada cancha. El tema es blanco y negro, así que cada
 * deporte se distingue por un paso de gris distinto (y por su ícono), no por color.
 *
 * Es **ilustración, no estado**: identifica el deporte en la miniatura de la cancha y no
 * codifica nunca disponibilidad, pago ni confirmación (eso vive en los tokens
 * success / warning / destructive). Fuente de verdad única para `CourtLines` (/app) y
 * `CourtImage` (admin).
 *
 * Los grises son oscuros a propósito: las líneas y el ícono van en blanco encima.
 * Las clases van escritas literales, no compuestas, porque Tailwind escanea el fuente.
 */
export const SPORT_SURFACE: Record<
  Sport,
  { icon: LucideIcon; bg: string; gradient: string }
> = {
  PADEL: {
    icon: VolleyballIcon,
    bg: 'bg-[oklch(0.4_0_0)]',
    gradient: 'from-[oklch(0.4_0_0)] to-[oklch(0.26_0_0)]',
  },
  FOOTBALL_5: {
    icon: GoalIcon,
    bg: 'bg-[oklch(0.5_0_0)]',
    gradient: 'from-[oklch(0.5_0_0)] to-[oklch(0.36_0_0)]',
  },
  FOOTBALL_7: {
    icon: GoalIcon,
    bg: 'bg-[oklch(0.3_0_0)]',
    gradient: 'from-[oklch(0.3_0_0)] to-[oklch(0.18_0_0)]',
  },
  TENNIS: {
    icon: VolleyballIcon,
    bg: 'bg-[oklch(0.58_0_0)]',
    gradient: 'from-[oklch(0.58_0_0)] to-[oklch(0.42_0_0)]',
  },
};
