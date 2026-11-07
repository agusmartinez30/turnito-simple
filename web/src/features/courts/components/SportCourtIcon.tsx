import { SPORT_LABELS, isSport } from '@/lib/labels';
import { cn } from '@/lib/utils';
import type { Sport } from '@/types';

/**
 * Football = green, padel = blue. Illustration only: it never encodes payment or
 * booking state (those use the success / warning / destructive tokens).
 * Classes are literal because Tailwind scans the source.
 */
const SPORT_BG: Record<Sport, string> = {
  PADEL: 'bg-blue-600',
  TENNIS: 'bg-blue-600',
  FOOTBALL_5: 'bg-green-600',
  FOOTBALL_7: 'bg-green-600',
};

/** Top-down court line drawings, 24x24 viewBox, stroked with currentColor. */
function CourtLines({ sport }: { sport: Sport }) {
  if (sport === 'PADEL' || sport === 'TENNIS') {
    return (
      <>
        <rect x="6" y="2.5" width="12" height="19" rx="1" />
        <line x1="6" y1="12" x2="18" y2="12" />
        <line x1="12" y1="12" x2="12" y2="17" />
        <line x1="6" y1="17" x2="18" y2="17" />
        <line x1="12" y1="7" x2="12" y2="12" />
        <line x1="6" y1="7" x2="18" y2="7" />
      </>
    );
  }
  return (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="1" />
      <line x1="12" y1="5" x2="12" y2="19" />
      <circle cx="12" cy="12" r="2.5" />
      <rect x="2.5" y="8.5" width="3.5" height="7" />
      <rect x="18" y="8.5" width="3.5" height="7" />
    </>
  );
}

/** Small court thumbnail so players tell football and padel bookings apart at a glance. */
export function SportCourtIcon({
  sport,
  label,
  className,
}: {
  sport: string;
  label?: string;
  className?: string;
}) {
  if (!isSport(sport)) return null;
  return (
    <span
      role="img"
      aria-label={label ?? SPORT_LABELS[sport]}
      className={cn(
        'flex shrink-0 items-center justify-center text-white',
        SPORT_BG[sport],
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[65%]"
      >
        <CourtLines sport={sport} />
      </svg>
    </span>
  );
}
