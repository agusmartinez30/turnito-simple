import { API_BASE_URL } from '@/lib/api/client';

/**
 * Precarga del logo del complejo en /app/[slug].
 *
 * Se resuelve en el servidor y no con `usePublicComplex()` para que el <link rel="preload">
 * llegue en el HTML inicial y el logo no aparezca con un salto al hidratar.
 *
 * Si el fetch falla, `null` → no se precarga nada; la página sigue funcionando porque
 * `OpenShell` hace su propia query igual.
 */
export default async function ComplexBrandingLayout({
  params,
  children,
}: LayoutProps<'/app/[slug]'>) {
  const { slug } = await params;
  const complex = await fetchBranding(slug);

  return (
    <>
      {complex?.logoUrl && (
        // El header lo renderiza `OpenShell`, que es un client component de un layout padre: no
        // se le puede pasar nada desde acá. React iza este preload a <head>, así que cuando
        // OpenShell hidrata la imagen ya está en cache y el logo no aparece con un salto.
        <link
          rel="preload"
          as="image"
          href={complex.logoUrl}
          fetchPriority="high"
        />
      )}
      {children}
    </>
  );
}

interface Branding {
  logoUrl: string | null;
}

/**
 * `revalidate: 300` para no pagar un roundtrip por visita: un cambio de logo tarda hasta
 * 5 minutos en verse en el link público, que es aceptable para el logo. La `tag` queda para
 * poder invalidarla desde el panel más adelante.
 */
async function fetchBranding(slug: string): Promise<Branding | null> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/public/c/${encodeURIComponent(slug)}/complex`,
      { next: { revalidate: 300, tags: [`complex:${slug}`] } },
    );
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const data = (body as { data?: Partial<Branding> } | null)?.data;
    return {
      logoUrl: data?.logoUrl ?? null,
    };
  } catch {
    return null;
  }
}
