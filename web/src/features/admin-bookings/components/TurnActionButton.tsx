'use client';

import { Loader2, Play, Square } from 'lucide-react';
import type { MouseEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  useAdminFinishBooking,
  useAdminStartBooking,
} from '@/features/admin-bookings/hooks';
import { errorMessage } from '@/lib/api/errors';
import type { AdminBooking } from '@/types/admin';
import { canStartTurn, isInProgress } from '../lib/turn-progress';

interface Props {
  booking: AdminBooking;
  /** Día local de hoy (`todayInTz`): "Iniciar" solo aplica a las confirmadas de hoy. */
  today: string;
  timezone: string;
  /** `long` = "Iniciar turno" / "Finalizar turno" (detalle); por defecto corto. */
  label?: 'short' | 'long';
}

/**
 * "Iniciar" (confirmada de hoy sin iniciar) o "Finalizar" (en curso); nada en otro caso
 * (docs/13-turn-progress.md). Frena el click para poder vivir encima de un link overlay.
 */
export function TurnActionButton({
  booking,
  today,
  timezone,
  label = 'short',
}: Props) {
  const start = useAdminStartBooking();
  const finish = useAdminFinishBooking();
  const long = label === 'long';

  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (canStartTurn(booking, today, timezone)) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={start.isPending}
        onClick={(e) => {
          stop(e);
          start.mutate(booking.id, {
            onSuccess: () => toast.success('Turno iniciado'),
            onError: (error) => toast.error(errorMessage(error)),
          });
        }}
      >
        {start.isPending ? <Loader2 className="animate-spin" /> : <Play />}
        {long ? 'Iniciar turno' : 'Iniciar'}
      </Button>
    );
  }

  if (isInProgress(booking)) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={finish.isPending}
        onClick={(e) => {
          stop(e);
          finish.mutate(booking.id, {
            onSuccess: () => toast.success('Turno finalizado'),
            onError: (error) => toast.error(errorMessage(error)),
          });
        }}
      >
        {finish.isPending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Square className="fill-current" />
        )}
        {long ? 'Finalizar turno' : 'Finalizar'}
      </Button>
    );
  }

  return null;
}
