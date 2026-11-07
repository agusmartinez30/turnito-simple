'use client';

import { PencilIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/layout/ButtonLink';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CourtImage } from '@/features/courts/components/CourtImage';
import { errorMessage } from '@/lib/api/errors';
import { formatPrice } from '@/lib/date';
import { SPORT_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { closesNextDay } from '@/lib/slots';
import type { AdminCourt } from '@/types/admin';
import { useUpdateCourt } from '../hooks';

interface Props {
  courts: AdminCourt[];
}

/** Tabla de canchas con activar/desactivar in place (docs/08-admin-courts.md › Tabla). */
/** "18:00 – 01:00 (+1)" cuando la cancha cierra al día siguiente (docs/08-admin-courts.md). */
function formatHours(
  court: Pick<AdminCourt, 'openTime' | 'closeTime'>,
): string {
  const suffix = closesNextDay(court.openTime, court.closeTime) ? ' (+1)' : '';
  return `${court.openTime} – ${court.closeTime}${suffix}`;
}

export function CourtsTable({ courts }: Props) {
  const update = useUpdateCourt();
  const [toDeactivate, setToDeactivate] = useState<AdminCourt | null>(null);

  const setActive = (court: AdminCourt, isActive: boolean) => {
    update.mutate(
      { id: court.id, payload: { isActive } },
      {
        onSuccess: () =>
          toast.success(isActive ? 'Cancha activada' : 'Cancha desactivada'),
        onError: (error) => toast.error(errorMessage(error)),
        onSettled: () => setToDeactivate(null),
      },
    );
  };

  const statusSwitch = (court: AdminCourt) => {
    const blocked = court.isActive && court.futureBookingsCount > 0;
    const control = (
      <Switch
        checked={court.isActive}
        disabled={blocked || update.isPending}
        onCheckedChange={(checked) =>
          checked ? setActive(court, true) : setToDeactivate(court)
        }
        aria-label={court.isActive ? 'Desactivar' : 'Activar'}
      />
    );
    if (!blocked) return control;
    return (
      <Tooltip>
        <TooltipTrigger render={<span tabIndex={0} />}>
          {control}
        </TooltipTrigger>
        <TooltipContent>
          Tiene {court.futureBookingsCount} reservas futuras. Cancelalas antes
          de desactivarla.
        </TooltipContent>
      </Tooltip>
    );
  };

  const futureLink = (court: AdminCourt) =>
    court.futureBookingsCount > 0 ? (
      <Link
        href={`/admin/agenda?courtId=${court.id}`}
        className="text-primary hover:underline"
      >
        {court.futureBookingsCount}
      </Link>
    ) : (
      <span className="text-muted-foreground">0</span>
    );

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Orden</TableHead>
              <TableHead>Cancha</TableHead>
              <TableHead>Deporte</TableHead>
              <TableHead>Techada</TableHead>
              <TableHead>Horario</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Reservas futuras</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {courts.map((court) => (
              <TableRow
                key={court.id}
                className={cn(!court.isActive && 'opacity-60')}
              >
                <TableCell className="tabular-nums">
                  {court.sortOrder}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <CourtImage
                      sport={court.sport}
                      imageUrl={court.imageUrl}
                      name={court.name}
                      className="size-10 shrink-0 rounded-md"
                      sizes="40px"
                    />
                    <div className="flex flex-col">
                      <span className="font-medium">{court.name}</span>
                      {court.surface && (
                        <span className="text-muted-foreground text-xs">
                          {court.surface}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{SPORT_LABELS[court.sport]}</Badge>
                </TableCell>
                <TableCell>{court.isIndoor ? 'Sí' : 'No'}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatHours(court)} · {court.slotDurationMinutes} min
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPrice(court.pricePerSlot)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {statusSwitch(court)}
                    {!court.isActive && (
                      <Badge variant="secondary">Inactiva</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {futureLink(court)}
                </TableCell>
                <TableCell>
                  <ButtonLink
                    href={`/admin/courts/${court.id}`}
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Editar ${court.name}`}
                  >
                    <PencilIcon />
                  </ButtonLink>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {courts.map((court) => (
          <li
            key={court.id}
            className={cn(
              'bg-card flex flex-col gap-3 rounded-lg border p-3 text-sm',
              !court.isActive && 'opacity-60',
            )}
          >
            <div className="flex items-center gap-3">
              <CourtImage
                sport={court.sport}
                imageUrl={court.imageUrl}
                name={court.name}
                className="size-12 shrink-0 rounded-md"
                sizes="48px"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{court.name}</span>
                <span className="text-muted-foreground text-xs">
                  {SPORT_LABELS[court.sport]} ·{' '}
                  {court.isIndoor ? 'Techada' : 'Descubierta'}
                  {court.surface && ` · ${court.surface}`}
                </span>
              </div>
              <ButtonLink
                href={`/admin/courts/${court.id}`}
                variant="outline"
                size="sm"
              >
                Editar
              </ButtonLink>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {formatHours(court)} · {court.slotDurationMinutes} min ·{' '}
                {formatPrice(court.pricePerSlot)}
              </span>
              <span className="text-muted-foreground text-xs">
                Reservas futuras: {futureLink(court)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {statusSwitch(court)}
              <span className="text-muted-foreground text-xs">
                {court.isActive ? 'Activa' : 'Inactiva'} · orden{' '}
                {court.sortOrder}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <AlertDialog
        open={toDeactivate !== null}
        onOpenChange={(open) =>
          !open && !update.isPending && setToDeactivate(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Desactivar {toDeactivate?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Los jugadores dejarán de verla y no podrán reservarla. Las
              reservas pasadas se conservan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setToDeactivate(null)}
              disabled={update.isPending}
            >
              Volver
            </Button>
            <Button
              variant="destructive"
              disabled={update.isPending}
              onClick={() => toDeactivate && setActive(toDeactivate, false)}
            >
              Sí, desactivar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
