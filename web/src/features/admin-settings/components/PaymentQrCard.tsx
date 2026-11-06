'use client';

import { CheckIcon, CopyIcon, DownloadIcon, PrinterIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Complex } from '@/types';

const noSubscribe = () => () => {};

/** Web origin, client-side only ('' during SSR). Same approach as PaymentLinkCard. */
function useOrigin(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => '',
  );
}

interface Props {
  complex: Complex;
}

/**
 * QR for the public landing `/app/[slug]`, where players pick their booking and pay.
 * Printing: everything outside `#payment-qr-print` is hidden via `print:` utilities.
 */
export function PaymentQrCard({ complex }: Props) {
  const origin = useOrigin();
  const url = `${origin}/app/${complex.slug}`;
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const hasBankData = Boolean(
    complex.bankCbu && complex.bankAlias && complex.bankHolderName,
  );

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

  const download = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: 'image/svg+xml',
    });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `qr-pago-${complex.slug}.svg`;
    a.click();
    URL.revokeObjectURL(href);
  };

  return (
    <Card>
      <CardHeader className="print:hidden">
        <CardTitle>QR de pago</CardTitle>
        <CardDescription>
          Los jugadores escanean el código, eligen su turno y pagan por
          transferencia. Imprimilo y dejalo en el buffet.
          {!hasBankData &&
            ' Primero cargá los datos bancarios: sin ellos la página de pago no los muestra.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          id="payment-qr-print"
          className="flex flex-col items-center gap-3 print:fixed print:inset-0 print:z-50 print:justify-center print:bg-white print:text-black"
        >
          <p className="hidden text-2xl font-semibold print:block">
            {complex.name}
          </p>
          <div ref={qrRef} className="rounded-lg bg-white p-4">
            {origin && (
              <QRCodeSVG
                value={url}
                size={224}
                marginSize={0}
                className="print:size-96"
                title={`QR de pago de ${complex.name}`}
              />
            )}
          </div>
          <p className="hidden text-lg print:block">
            Escaneá, elegí tu turno y pagá
          </p>
        </div>
        <div className="flex flex-col gap-3 print:hidden">
          <Input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Link de la página pública de pago"
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={download}
              disabled={!origin}
            >
              <DownloadIcon />
              Descargar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              disabled={!origin}
            >
              <PrinterIcon />
              Imprimir
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
