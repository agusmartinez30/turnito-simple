/**
 * Teléfono canónico de un cliente (docs/17-admin-customers.md): `'+'` más los dígitos.
 * Con esto `'+54 9 11 0000 0077'`, `'+54-9-11-0000-0077'` y `'5491100000077'` son la misma
 * persona dentro del complejo.
 *
 * Se elige conservar el `+` y no guardar dígitos pelados porque `tel:+54…` es el link correcto
 * en mobile. Para WhatsApp da igual: `resolveWhatsappJid` vuelve a quitar todo lo que no sea dígito.
 *
 * Limitación conocida: `'1100000077'` y `'5491100000077'` quedan como dos clientes. No se infiere
 * el código de país — fusionar en silencio a dos personas distintas es peor que un duplicado
 * visible, y el buscador hace que el admin vea el casi-duplicado al tipear.
 */
export function normalizePhone(raw: string): string {
  return `+${raw.replace(/\D/g, '')}`;
}
