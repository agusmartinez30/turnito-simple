'use client';

import { CheckIcon, CopyIcon, LandmarkIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { PublicPayment } from '../api';

const COPIED_MS = 2000;

/** Bank data of the complex, with one copy button per field. */
export function BankTransferCard({
  bank,
  hasBank,
}: {
  bank: PublicPayment['bank'];
  hasBank: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LandmarkIcon className="text-primary size-5" aria-hidden />
          Datos para transferir
        </CardTitle>
        <CardDescription>
          {hasBank
            ? 'Transferí a la cuenta del complejo deportivo'
            : 'El complejo todavía no cargó sus datos bancarios. Comunicate con el complejo para coordinar el pago.'}
        </CardDescription>
      </CardHeader>
      {hasBank && (
        <CardContent>
          <dl className="flex flex-col divide-y">
            <BankRow label="Alias" value={bank.alias} highlight />
            <BankRow label="CBU / CVU" value={bank.cbu} />
            <BankRow label="Titular" value={bank.holderName} />
          </dl>
        </CardContent>
      )}
    </Card>
  );
}

function BankRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | null;
  highlight?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  if (!value) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      toast.error('No se pudo copiar. Copialo a mano.');
    }
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0',
        highlight && 'bg-primary/5 -mx-2 rounded-lg px-2 py-3 first:pt-3',
      )}
    >
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd
          className={cn(
            'break-all',
            highlight ? 'text-lg font-semibold' : 'font-medium',
          )}
        >
          {value}
        </dd>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        aria-label={`Copiar ${label}`}
        onClick={copy}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        <span aria-live="polite">{copied ? 'Copiado' : 'Copiar'}</span>
      </Button>
    </div>
  );
}
