'use client';

import { SportCourtIcon } from '@/features/courts/components/SportCourtIcon';
import type { AdminBooking, AdminCourt } from '@/types/admin';
import { isBookingCompleted } from '@/features/admin-bookings/lib/booking-status';
import { cellKey, type AgendaRow } from '../lib/grid';
import { AgendaCell } from './AgendaCell';

interface Props {
  courts: AdminCourt[];
  rows: AgendaRow[];
  slotIndex: Set<string>;
  bookings: Map<string, AdminBooking>;
  now: Date | null;
  onCreate: (courtId: string, startsAt: string) => void;
}

/** Courts as columns, time slots as rows. Horizontal scroll with a sticky time column. */
export function AgendaGrid({
  courts,
  rows,
  slotIndex,
  bookings,
  now,
  onCreate,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <div
        role="grid"
        className="grid min-w-max"
        style={{
          gridTemplateColumns: `4.5rem repeat(${courts.length}, minmax(9rem, 1fr))`,
        }}
      >
        <div className="bg-background sticky left-0 z-10 border-b" />
        {courts.map((court) => (
          <div
            key={court.id}
            className="bg-muted/40 flex items-center gap-2 border-b border-l px-2 py-2 text-sm font-medium"
          >
            <SportCourtIcon sport={court.sport} className="size-6 rounded-md" />
            <span className="truncate">{court.name}</span>
          </div>
        ))}
        {rows.map((row) => (
          <Row
            key={row.time}
            row={row}
            courts={courts}
            slotIndex={slotIndex}
            bookings={bookings}
            now={now}
            onCreate={onCreate}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  row,
  courts,
  slotIndex,
  bookings,
  now,
  onCreate,
}: {
  row: AgendaRow;
  courts: AdminCourt[];
  slotIndex: Set<string>;
  bookings: Map<string, AdminBooking>;
  now: Date | null;
  onCreate: (courtId: string, startsAt: string) => void;
}) {
  return (
    <>
      <div className="bg-background text-muted-foreground sticky left-0 z-10 flex h-14 items-start border-b px-2 pt-1.5 text-xs tabular-nums">
        {row.startLabel}
      </div>
      {courts.map((court) => {
        const key = cellKey(court.id, row.time);
        const booking = bookings.get(key);
        return (
          <AgendaCell
            key={court.id}
            booking={booking}
            closed={!slotIndex.has(key)}
            past={now !== null && row.time <= now.getTime()}
            completed={
              booking !== undefined && isBookingCompleted(booking, now)
            }
            onCreate={() => onCreate(court.id, row.startsAt)}
          />
        );
      })}
    </>
  );
}
