'use client';

import { AlertCircleIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api/errors';
import { cn } from '@/lib/utils';

interface Props {
  error?: unknown;
  /** Texto a mostrar; si se omite se usa el `message` del error. */
  message?: string;
  /** Si se pasa, se muestra el botón "Reintentar". */
  onRetry?: () => void;
  title?: string;
  className?: string;
}

/** Estado de error transversal: `Alert` con el `message` de la API + "Reintentar" (docs/00-overview.md). */
export function ErrorAlert({
  error,
  message,
  onRetry,
  title,
  className,
}: Props) {
  return (
    <Alert
      variant="destructive"
      className={cn('border-destructive/30', className)}
    >
      <AlertCircleIcon />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>{message ?? errorMessage(error)}</span>
        {onRetry && (
          <Button type="button" variant="outline" size="xs" onClick={onRetry}>
            Reintentar
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
