import Image from 'next/image';
import { SPORT_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import type { Sport } from '@/types';
import { SPORT_SURFACE } from '../sportSurface';

interface Props {
  sport: Sport;
  imageUrl?: string;
  name: string;
  /** Clases de aspect-ratio / tamaño del contenedor. */
  className?: string;
  sizes?: string;
}

/** Imagen de la cancha o placeholder por deporte cuando no hay `imageUrl`. */
export function CourtImage({ sport, imageUrl, name, className, sizes }: Props) {
  if (imageUrl) {
    return (
      <div
        className={cn('bg-muted relative w-full overflow-hidden', className)}
      >
        <Image
          src={imageUrl}
          alt={name}
          fill
          unoptimized
          sizes={sizes ?? '(max-width: 640px) 100vw, 33vw'}
          className="object-cover"
        />
      </div>
    );
  }

  const { icon: Icon, gradient } = SPORT_SURFACE[sport];
  return (
    <div
      role="img"
      aria-label={`${SPORT_LABELS[sport]} · ${name}`}
      className={cn(
        'flex w-full items-center justify-center bg-linear-to-br text-white',
        gradient,
        className,
      )}
    >
      <Icon className="size-10 opacity-80" strokeWidth={1.5} />
    </div>
  );
}
