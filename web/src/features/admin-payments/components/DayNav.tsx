'use client';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addDaysToParam, formatLongDate } from '@/lib/date';

interface Props {
  date: string;
  /** Hoy en el timezone del complejo. */
  today: string;
  onChange: (date: string) => void;
}

/** "lunes 14 de septiembre" → "Lunes 14 de septiembre" (CSS `capitalize` capitalizaría también "De"). */
function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** ‹ día › + "Hoy" (docs/12-admin-payments.md › DayNav). Espejo de WeekNav del dashboard. */
export function DayNav({ date, today, onChange }: Props) {
  const isToday = date === today;
  const label = capitalizeFirst(formatLongDate(date));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Día anterior"
        onClick={() => onChange(addDaysToParam(date, -1))}
      >
        <ChevronLeftIcon />
      </Button>
      <p className="min-w-56 text-center font-semibold" aria-live="polite">
        {label}
        {isToday && (
          <span className="text-muted-foreground ml-1 text-sm font-normal">
            {' '}
            · hoy
          </span>
        )}
      </p>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Día siguiente"
        onClick={() => onChange(addDaysToParam(date, 1))}
      >
        <ChevronRightIcon />
      </Button>
      {!isToday && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(today)}
        >
          Hoy
        </Button>
      )}
    </div>
  );
}
