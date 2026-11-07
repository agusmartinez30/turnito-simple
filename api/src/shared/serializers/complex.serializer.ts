import { Complex } from '@prisma/client';

/** Forma exacta del contrato `Complex` (web/docs). */
export interface ComplexResponse {
  id: string;
  /** Identificador de las rutas publicas: /app/[slug] (docs/15-multi-complex.md). */
  slug: string;
  name: string;
  address: string;
  timezone: string;
  cancellationWindowHours: number;
  autoConfirmPublicRequests: boolean;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  /** WhatsApp público de contacto, `+dígitos` (docs/08-admin-complex.md). */
  contactWhatsapp: string | null;
  /** URL pública del logo en el bucket, o null (la web cae al ícono genérico). */
  logoUrl: string | null;
  /** Bank data for transfers; admin-only response (never exposed by the public endpoints). */
  bankCbu: string | null;
  bankAlias: string | null;
  bankHolderName: string | null;
}

export function toComplexResponse(complex: Complex): ComplexResponse {
  return {
    id: complex.id,
    slug: complex.slug,
    name: complex.name,
    address: complex.address,
    timezone: complex.timezone,
    cancellationWindowHours: complex.cancellationWindowHours,
    autoConfirmPublicRequests: complex.autoConfirmPublicRequests,
    instagramUrl: complex.instagramUrl,
    facebookUrl: complex.facebookUrl,
    tiktokUrl: complex.tiktokUrl,
    youtubeUrl: complex.youtubeUrl,
    contactWhatsapp: complex.contactWhatsapp,
    logoUrl: complex.logoUrl,
    bankCbu: complex.bankCbu,
    bankAlias: complex.bankAlias,
    bankHolderName: complex.bankHolderName,
  };
}
