import { buildComplexThemeCss } from '@/lib/theme';

/**
 * Tokens de marca del complejo (docs/19-branding.md).
 *
 * No hace la query: recibe los dos hex por props, así sirve igual desde un server component
 * (la superficie pública, que los resuelve por slug) que desde uno de cliente (el panel, que
 * ya tiene el complejo en cache).
 *
 * Va después de `globals.css` en el orden del documento, que es lo único que lo hace pisar:
 * los selectores generados tienen la MISMA especificidad que los del archivo (`:root` = 0,1,0;
 * los sub-scopes envueltos en `:where(...)` = 0,0,0). Por eso `lib/theme.ts` copia los
 * selectores textuales — si divergen, uno de los dos deja de aplicar.
 *
 * Sin `precedence`: React solo iza a <head> los <style> que lo declaran, y ahí podría caer
 * ANTES de la hoja de Tailwind. Se queda inline, igual que el <style> de la fuente display
 * en app/(open)/app/layout.tsx.
 */
export function ComplexTheme({
  primaryColor,
  secondaryColor,
}: {
  primaryColor: string | null | undefined;
  secondaryColor: string | null | undefined;
}) {
  const css = buildComplexThemeCss(primaryColor, secondaryColor);
  if (!css) return null;
  return <style>{css}</style>;
}
