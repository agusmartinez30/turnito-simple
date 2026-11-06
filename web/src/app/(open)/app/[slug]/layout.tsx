import { ComplexTheme } from '@/components/layout/ComplexTheme';
import { API_BASE_URL } from '@/lib/api/client';

/**
 * Colores y precarga del logo del complejo en /app/[slug] (docs/19-branding.md).
 *
 * Se resuelven en el servidor y no con `usePublicComplex()` porque acá el fondo ENTERO es el
 * color de marca: un flash del índigo por defecto antes del color real sería lo primero que ve
 * el cliente. Es un <style> estático, así que no hay estado que hidratar ni que reconciliar.
 *
 * Si el fetch falla, `null` → `ComplexTheme` no inyecta nada y quedan los tokens de Clubix; la
 * página sigue funcionando porque `OpenShell` hace su propia query igual.
 */
export default async function ComplexBrandingLayout({
  params,
  children,
}: LayoutProps<'/app/[slug]'>) {
  const { slug } = await params;
  const complex = await fetchBranding(slug);

  return (
    <>
      <ComplexTheme
        primaryColor={complex?.primaryColor}
        secondaryColor={complex?.secondaryColor}
      />
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
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
}

/**
 * `revalidate: 300` para no pagar un roundtrip por visita: un cambio de color tarda hasta
 * 5 minutos en verse en el link público, que es aceptable para branding. La `tag` queda para
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
      primaryColor: data?.primaryColor ?? null,
      secondaryColor: data?.secondaryColor ?? null,
      logoUrl: data?.logoUrl ?? null,
    };
  } catch {
    return null;
  }
}
