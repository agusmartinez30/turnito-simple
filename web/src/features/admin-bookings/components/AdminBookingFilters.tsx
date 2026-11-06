'use client';

import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, SearchIcon, XIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { addDaysToParam, formatLongDate } from '@/lib/date';
import type { BookingStatus } from '@/types';
import type { AdminCourt } from '@/types/admin';

/** Filtros que viven en la URL (docs/07-admin-bookings.md). */
export interface AdminBookingUrlFilters {
  q?: string;
  date?: string;
  courtId?: string;
  status?: BookingStatus;
}

interface Props {
  filters: AdminBookingUrlFilters;
  courts: AdminCourt[];
  today: string;
  onChange: (patch: Partial<AdminBookingUrlFilters>) => void;
  onClear: () => void;
}

const ALL = 'ALL';
const STATUS_OPTIONS = [
  { value: ALL, label: 'Todas' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'CONFIRMED', label: 'Confirmadas' },
  { value: 'CANCELLED', label: 'Canceladas' },
] as const;

export function AdminBookingFilters({
  filters,
  courts,
  today,
  onChange,
  onClear,
}: Props) {
  const [term, setTerm] = useState(filters.q ?? '');
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Debounce 400 ms → ?q=. Con 1 carácter no se envía.
  useEffect(() => {
    const trimmed = term.trim();
    const next = trimmed.length >= 2 ? trimmed : undefined;
    if (next === filters.q) return;
    const t = setTimeout(() => onChange({ q: next }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const courtItems = useMemo(() => {
    const items: Record<string, string> = { [ALL]: 'Todas las canchas' };
    for (const c of courts) {
      items[c.id] = c.isActive ? c.name : `${c.name} (inactiva)`;
    }
    return items;
  }, [courts]);

  const hasFilters = Boolean(
    filters.q || filters.date || filters.courtId || filters.status,
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-64">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Nombre, apellido o teléfono"
          className="pl-8"
          aria-label="Buscar cliente"
        />
      </div>

      <div className="flex items-center gap-1">
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger render={<Button variant="outline" size="sm" />}>
            <CalendarIcon data-icon="inline-start" />
            <span className="capitalize">
              {filters.date ? formatLongDate(filters.date) : 'Fecha'}
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <div className="flex gap-1 border-b p-2">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  onChange({ date: today });
                  setCalendarOpen(false);
                }}
              >
                Hoy
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  onChange({ date: addDaysToParam(today, 1) });
                  setCalendarOpen(false);
                }}
              >
                Mañana
              </Button>
            </div>
            <Calendar
              mode="single"
              locale={es}
              selected={filters.date ? parseISO(filters.date) : undefined}
              defaultMonth={filters.date ? parseISO(filters.date) : undefined}
              onSelect={(selected) => {
                if (!selected) return;
                onChange({ date: format(selected, 'yyyy-MM-dd') });
                setCalendarOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        {filters.date && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange({ date: undefined })}
            aria-label="Quitar fecha"
          >
            <XIcon />
          </Button>
        )}
      </div>

      <Select
        value={filters.courtId ?? ALL}
        onValueChange={(value) =>
          onChange({ courtId: value && value !== ALL ? value : undefined })
        }
        items={courtItems}
      >
        <SelectTrigger size="sm" className="w-48" aria-label="Cancha">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas las canchas</SelectItem>
          {courts.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {courtItems[c.id]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ToggleGroup
        variant="outline"
        size="sm"
        aria-label="Estado"
        value={[filters.status ?? ALL]}
        onValueChange={([value]) =>
          onChange({
            status:
              value && value !== ALL ? (value as BookingStatus) : undefined,
          })
        }
      >
        {STATUS_OPTIONS.map((opt) => (
          <ToggleGroupItem key={opt.value} value={opt.value}>
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

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
