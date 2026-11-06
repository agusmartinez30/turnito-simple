'use client';

import { endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  addDaysToParam,
  formatShortDateParam,
  startOfWeekParam,
} from '@/lib/date';
import { PAYMENT_METHOD_LABELS } from '@/lib/labels';
import type { PaymentMethod } from '@/types/admin';

/** Filtros que viven en la URL (docs/12-admin-payments.md › PaymentsLedgerFilters). */
export interface PaymentLedgerUrlFilters {
  /** Modo día. Ausente = hoy. Ignorado si hay `from`/`to`. */
  date?: string;
  /** Modo rango (ambos presentes). */
  from?: string;
  to?: string;
  method?: PaymentMethod;
  q?: string;
  voided?: boolean;
}

interface Props {
  filters: PaymentLedgerUrlFilters;
  /** Hoy en el timezone del complejo. */
  today: string;
  onChange: (patch: Partial<PaymentLedgerUrlFilters>) => void;
  onClear: () => void;
}

const toParam = (d: Date) => format(d, 'yyyy-MM-dd');

export function PaymentsLedgerFilters({
  filters,
  today,
  onChange,
  onClear,
}: Props) {
  const [term, setTerm] = useState(filters.q ?? '');
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Selección a medias (solo `from`) mientras el popover sigue abierto.
  const [pending, setPending] = useState<DateRange | undefined>(undefined);

  // Debounce 400 ms → ?q=. Con 1 carácter no se envía.
  useEffect(() => {
    const trimmed = term.trim();
    const next = trimmed.length >= 2 ? trimmed : undefined;
    if (next === filters.q) return;
    const t = setTimeout(() => onChange({ q: next }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const isRange = Boolean(filters.from && filters.to);
  const day = filters.date ?? today;
  const selected: DateRange | undefined =
    pending ??
    (isRange
      ? {
          from: parseISO(filters.from as string),
          to: parseISO(filters.to as string),
        }
      : { from: parseISO(day), to: parseISO(day) });

  const dateLabel = isRange
    ? `${formatShortDateParam(filters.from as string)} – ${formatShortDateParam(filters.to as string)}`
    : day === today
      ? 'Hoy'
      : formatShortDateParam(day);

  const applyRange = (from: string, to: string) => {
    setPending(undefined);
    setCalendarOpen(false);
    if (from === to) onChange({ date: from, from: undefined, to: undefined });
    else onChange({ date: undefined, from, to });
  };

  const hasFilters = Boolean(
    filters.date || isRange || filters.method || filters.q || filters.voided,
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-64">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Nombre, email o teléfono"
          className="pl-8"
          aria-label="Buscar cliente"
        />
      </div>

      <Popover
        open={calendarOpen}
        onOpenChange={(open) => {
          setCalendarOpen(open);
          if (!open) setPending(undefined);
        }}
      >
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>
          <CalendarIcon data-icon="inline-start" />
          <span className="capitalize">{dateLabel}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <div className="flex gap-1 border-b p-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => applyRange(today, today)}
            >
              Hoy
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                const monday = startOfWeekParam(today);
                applyRange(monday, addDaysToParam(monday, 6));
              }}
            >
              Esta semana
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                const d = parseISO(today);
                applyRange(toParam(startOfMonth(d)), toParam(endOfMonth(d)));
              }}
            >
              Este mes
            </Button>
          </div>
          <Calendar
            mode="range"
            locale={es}
            selected={selected}
            defaultMonth={selected?.from}
            onSelect={(range) => {
              // Primer click: solo `from` (queda pendiente). Segundo: aplica el rango.
              if (!range?.from) return setPending(undefined);
              if (!range.to) return setPending({ from: range.from });
              applyRange(toParam(range.from), toParam(range.to));
            }}
          />
          <p className="text-muted-foreground border-t px-3 py-2 text-xs">
            Elegí un día (dos veces) o el inicio y el fin de un rango.
          </p>
        </PopoverContent>
      </Popover>

      <ToggleGroup
        variant="outline"
        size="sm"
        aria-label="Método de pago"
        value={filters.method ? [filters.method] : []}
        onValueChange={([value]) =>
          onChange({ method: value ? (value as PaymentMethod) : undefined })
        }
      >
        {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
          <ToggleGroupItem key={m} value={m}>
            {PAYMENT_METHOD_LABELS[m]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Label className="flex items-center gap-2 text-sm font-normal">
        <Switch
          checked={Boolean(filters.voided)}
          onCheckedChange={(checked) =>
            onChange({ voided: checked || undefined })
          }
          aria-label="Mostrar anulados"
        />
        Mostrar anulados
      </Label>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setTerm('');
            onClear();
          }}
        >
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
