'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Marca del complejo (docs/19-branding.md): su logo si lo subió, si no el ícono genérico de esa
 * superficie. Es la misma cadena que ya usa el nombre del complejo al lado — `Skeleton` mientras
 * carga, valor propio, fallback — así que el header no parpadea más de lo que ya parpadeaba.
 *
 * `next/image` con `unoptimized`, igual que `CourtImage`: el optimizador pediría declarar el host
 * del bucket en `images.remotePatterns`, o sea una env más horneada en el build. `unoptimized`
 * sirve el `src` tal cual y saltea esa allowlist.
 *
 * Si la imagen no carga (objeto borrado a mano en el bucket, proveedor `stub` en dev) se cae al
 * ícono en lugar de dejar un hueco.
 *
 * `alt` vacío a propósito: el nombre del complejo está al lado en las cuatro ubicaciones, así que
 * un texto alternativo sería un anuncio duplicado.
 */
export function ComplexMark({
  logoUrl,
  fallback,
  pending = false,
  fluid = false,
  className,
}: {
  logoUrl?: string | null;
  fallback: React.ReactNode;
  pending?: boolean;
  /**
   * La caja fija solo el alto y el logo se queda con su propio ancho, hasta el `max-w-` que
   * mande `className`. Hace falta donde el logo tiene que verse grande: en una caja cuadrada un
   * wordmark de 3:1 se encoge a un tercio del alto disponible, y en una apaisada — la que pedía
   * el ícono de la cancha — un logo cuadrado se encoge a lo mismo. El alto disponible se usa
   * entero venga con la proporción que venga.
   */
  fluid?: boolean;
  className?: string;
}) {
  // La URL que falló, no un booleano: cada subida genera una URL nueva, así que un logo roto no
  // deja tapado al que venga después y no hace falta resetear nada al cambiar de prop.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (pending && !logoUrl) {
    // En `fluid` el ancho lo pone un logo que todavía no llegó: se reserva un cuadrado, que es la
    // proporción más común, para que el nombre de al lado se mueva lo menos posible al aparecer.
    return (
      <Skeleton
        className={cn(
          'shrink-0 rounded-md',
          fluid && 'aspect-square',
          className,
        )}
      />
    );
  }
  if (!logoUrl || failedUrl === logoUrl) return <>{fallback}</>;

  return (
    <span
      className={cn(
        // Fondo blanco a propósito: un logo oscuro sobre la barra lateral o sobre el fondo de
        // marca de /app desaparecería, y los logos se diseñan para vivir sobre blanco.
        'flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white',
        className,
      )}
    >
      <Image
        src={logoUrl}
        alt=""
        // Cuadrado a propósito: son los atributos `width`/`height` del `<img>`, o sea la
        // proporción que el browser usa para reservar el hueco ANTES de descargar el archivo.
        // Coincide con el `aspect-square` del `Skeleton`; al cargar manda la proporción real.
        width={256}
        height={256}
        unoptimized
        onError={() => setFailedUrl(logoUrl)}
        className={cn(
          'object-contain',
          fluid ? 'h-full w-auto max-w-full' : 'size-full p-0.5',
        )}
      />
    </span>
  );
}
