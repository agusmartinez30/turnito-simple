'use client';

import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  MessageCircleIcon,
} from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { ButtonLink } from '@/components/layout/ButtonLink';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { waLink } from '@/lib/phone';

const noSubscribe = () => () => {};

/** Origen de la web solo en el cliente ('' en SSR). */
function useOrigin(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => '',
  );
}

interface Props {
  bookingId: string;
  slug: string;
  customerName: string | null;
  customerPhone: string | null;
  /** El club cargó CBU/CVU, alias y titular: sin eso la página pública no muestra datos. */
  hasBankData: boolean;
}

/** Link público de pago de la reserva (docs/23-public-payment-link.md): copiar o mandar por WhatsApp. */
export function PaymentLinkCard({
  bookingId,
  slug,
  customerName,
  customerPhone,
  hasBankData,
}: Props) {
  const path = `/app/${slug}/pagar/${bookingId}`;
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);
  const url = `${origin}${path}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copiado');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('No se pudo copiar. Seleccioná el link y copialo a mano.');
    }
  };

  const greeting = customerName ? `Hola ${customerName}!` : 'Hola!';
  const whatsappText = `${greeting} Para pagar tu turno por transferencia, entrá a este link y subí el comprobante: ${url}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Link de pago</CardTitle>
        <CardDescription>
          El cliente ve los datos bancarios del club y sube el comprobante en
          PDF o imagen, sin crear cuenta.
          {!hasBankData &&
            ' Todavía no cargaste los datos bancarios en Mi complejo: el cliente no los va a ver.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Link de pago de la reserva"
          className="font-mono text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copy}
            disabled={!origin}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            Copiar
          </Button>
          {customerPhone && (
            <ButtonLink
              href={waLink(customerPhone, whatsappText)}
              variant="outline"
              size="sm"
              target="_blank"
              rel="noopener"
            >
              <MessageCircleIcon />
              Enviar por WhatsApp
            </ButtonLink>
          )}
          <ButtonLink
            href={path}
            variant="ghost"
            size="sm"
            target="_blank"
            rel="noopener"
          >
            <ExternalLinkIcon />
            Abrir
          </ButtonLink>
        </div>
      </CardContent>
    </Card>
  );
}
