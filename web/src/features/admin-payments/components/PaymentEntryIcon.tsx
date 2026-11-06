import { BanknoteIcon, FileTextIcon, LandmarkIcon } from 'lucide-react';
import type { PaymentMethod } from '@/types/admin';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  warning: 'bg-warning-subtle text-warning-subtle-foreground',
  danger: 'bg-destructive-subtle text-destructive-subtle-foreground',
};

interface Props {
  /** `proof` = comprobante todavía sin acreditar; si no, el método del pago. */
  kind: PaymentMethod | 'proof';
  tone?: Tone;
  className?: string;
}

/** Ficha de ícono que deja distinguir de un vistazo efectivo, transferencia y comprobante. */
export function PaymentEntryIcon({ kind, tone = 'neutral', className }: Props) {
  const Icon =
    kind === 'CASH'
      ? BanknoteIcon
      : kind === 'TRANSFER'
        ? LandmarkIcon
        : FileTextIcon;
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-lg',
        TONES[tone],
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}
