'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { addDaysToParam, formatDayChip } from '@/lib/date';
import { cn } from '@/lib/utils';
import { MAX_DAYS_AHEAD } from '../constants';

interface Props {
  /** Hoy en el timezone del complejo (`YYYY-MM-DD`). */
  today: string;
  /** Día seleccionado (`YYYY-MM-DD`). */
  value: string;
  onChange: (date: string) => void;
}

/** Fila scrolleable de chips, uno por día desde hoy hasta hoy + MAX_DAYS_AHEAD - 1. */
export function DatePicker({ today, value, onChange }: Props) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  const days = Array.from({ length: MAX_DAYS_AHEAD }, (_, i) =>
    addDaysToParam(today, i),
  );

  // Al montar, dejar visible el chip seleccionado (si viene un ?date= lejano).
  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
    });
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="Fecha"
      className="-mx-4 flex [scrollbar-width:thin] gap-2 overflow-x-auto px-4 pb-1"
    >
      {days.map((date) => {
        const selected = date === value;
        const { weekday, day } = formatDayChip(date);
        return (
          <Button
            key={date}
            ref={selected ? selectedRef : undefined}
            type="button"
            role="radio"
            aria-checked={selected}
            variant={selected ? 'default' : 'outline'}
            className={cn('h-auto shrink-0 flex-col gap-0 px-3 py-1.5')}
            onClick={() => onChange(date)}
          >
            <span className="text-[0.7rem] font-normal uppercase opacity-80">
              {date === today ? 'Hoy' : weekday}
            </span>
            <span className="text-base leading-tight font-semibold">{day}</span>
          </Button>
        );
      })}
    </div>
  );
}
