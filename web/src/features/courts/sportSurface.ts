import { GoalIcon, VolleyballIcon, type LucideIcon } from 'lucide-react';
import type { Sport } from '@/types';

/**
 * Color de la superficie real de cada cancha: vidrio azul del pádel, césped del fútbol,
 * polvo de ladrillo del tenis.
 *
 * Es **ilustración, no estado**: identifica el deporte en la miniatura de la cancha y no
 * codifica nunca disponibilidad, pago ni confirmación (eso vive en los tokens
 * success / warning / destructive). Fuente de verdad única para `CourtLines` (/app) y
 * `CourtImage` (admin), que antes describían lo mismo con dos paletas distintas.
 *
 * Las clases van escritas literales, no compuestas, porque Tailwind escanea el fuente.
 */
export const SPORT_SURFACE: Record<
  Sport,
  { icon: LucideIcon; bg: string; gradient: string }
> = {
  PADEL: {
    icon: VolleyballIcon,
    bg: 'bg-[oklch(0.5_0.13_268.6)]',
    gradient: 'from-[oklch(0.5_0.13_268.6)] to-[oklch(0.36_0.12_268.6)]',
  },
  FOOTBALL_5: {
    icon: GoalIcon,
    bg: 'bg-[oklch(0.5_0.13_150)]',
    gradient: 'from-[oklch(0.5_0.13_150)] to-[oklch(0.36_0.11_152)]',
  },
  FOOTBALL_7: {
    icon: GoalIcon,
    bg: 'bg-[oklch(0.45_0.12_150)]',
    gradient: 'from-[oklch(0.45_0.12_150)] to-[oklch(0.32_0.1_152)]',
  },
  TENNIS: {
    icon: VolleyballIcon,
    bg: 'bg-[oklch(0.58_0.15_45)]',
    gradient: 'from-[oklch(0.58_0.15_45)] to-[oklch(0.42_0.14_40)]',
  },
};
