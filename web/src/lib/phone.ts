const AR_COUNTRY_CODE = '54';
/** Área + número de un celular argentino, sin país ni el 9. */
const AR_NATIONAL_LENGTH = 10;

/**
 * Teléfono en E.164 sin `+`, como lo espera `wa.me` (espejo de `api/.../shared/phone.util.ts`).
 * Los teléfonos del panel se cargan casi siempre como celular argentino de 10 dígitos.
 */
export function toE164Ar(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return rawPhone;
  if (digits.startsWith(AR_COUNTRY_CODE)) return digits;
  if (digits.length === AR_NATIONAL_LENGTH) return `549${digits}`;
  if (digits.length === AR_NATIONAL_LENGTH + 1 && digits.startsWith('9')) {
    return `${AR_COUNTRY_CODE}${digits}`;
  }
  return digits;
}

/** Link al chat con el texto ya cargado, para mandarlo desde el celular. */
export function waLink(phone: string, text: string): string {
  return `https://wa.me/${toE164Ar(phone)}?text=${encodeURIComponent(text)}`;
}
