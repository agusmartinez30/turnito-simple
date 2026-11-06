# 23 — `/app/[slug]/pagar/[id]`: pago por transferencia con comprobante (sin cuenta)

> Abajo, `/public/` se lee como `/public/c/:slug/` (docs/16-multi-complex.md). Contraparte de la API: [`api/docs/23-public-payment-link.md`](../../api/docs/23-public-payment-link.md).

## Objetivo

Que el cliente de una reserva abra un link, vea **los datos bancarios del complejo y cuánto falta pagar**, transfiera y **suba el comprobante en PDF**. El comprobante queda en revisión; el admin lo aprueba (se registra el pago) o lo rechaza con motivo, desde el detalle de la reserva o desde el listado unificado de `/admin/payments` (botones Aceptar / Rechazar / Ver comprobante; ver `12-admin-payments.md`). Sin cuenta: el UUID de la reserva es la llave.

## Rutas / pantallas

| Ruta | Layout | Auth | Descripción |
|---|---|---|---|
| `/app/[slug]/pagar/[id]` | `(open)` | **Ninguna** | Estado del pago de la reserva `id`: resumen, datos bancarios y subida del comprobante |

`page.tsx` es fino y monta `PublicPaymentView`. El link lo arma el admin desde el detalle de la reserva (`PaymentLinkCard`, [`12-admin-payments.md`](./12-admin-payments.md)). Código: `src/features/public-payment/{api,hooks,schemas}.ts` + `components/PublicPaymentView.tsx`.

## UI

Título "Pagar tu turno" + resumen de la reserva (`BookingSummary`: cancha, fecha y horario en el timezone del complejo, y `Total` / `Ya pagado` / `En revisión` —solo si `pendingProofsAmount > 0`— / **`Saldo a pagar`** destacado = `booking.remaining`, con `data-testid="payment-remaining"`). Debajo, según `remaining`, `pendingAmount` y `proofs.pendingCount` del `GET`:

| Situación | Qué se ve |
|---|---|
| `remaining > 0` | Datos bancarios (`BankCard`) con botón copiar por fila (CBU / CVU, Alias, Titular; las filas vacías no se muestran) y el formulario "Tu comprobante". Si además `proofs.pendingCount > 0`, una alerta "Hay N comprobante(s) en revisión" (ya descontados del saldo) |
| `remaining <= 0` y `pendingAmount <= 0` | Alerta "Turno pago, ¡gracias!". Sin formulario |
| `remaining <= 0` y `pendingAmount > 0` (`fullyCovered`) | Alerta "Ya está cubierto, pendiente de revisión" (aclara que si rechazan alguno el saldo vuelve a estar disponible). Sin formulario |
| Tras un envío exitoso | Alerta "Comprobante enviado, pendiente de revisión" con el monto enviado y el saldo restante actualizado; si `remaining > 0`, botón **Enviar otro comprobante** (incrementa un `key` que remonta el formulario vacío, sin `form.reset()`) |

Un comprobante rechazado simplemente reabre el saldo: la API deja de contarlo y la página no muestra el rechazo ni su motivo. La query se refresca cada 30 s mientras `proofs.pendingCount > 0`.

**Complejo sin datos bancarios** (CBU, alias y titular vacíos): la `BankCard` dice "El complejo todavía no cargó sus datos bancarios. Comunicate con el complejo para coordinar el pago." y **no** se muestra el formulario.

**Formulario** (react-hook-form + zod, `mode: 'onChange'`):

| Campo | Regla |
|---|---|
| "Nombre de quien paga" | requerido, trim, 1..100 |
| "Cantidad de jugadores que paga" (opcional) | entero 1..50; vacío = no se envía |
| "Monto del comprobante" | requerido, entero ≥ 1 y ≤ `remaining`; hint "Saldo a pagar: $X" con el botón "Usar el saldo completo" (`setValue`) |
| PDF | `<input type="file" accept="application/pdf,.pdf">` (`data-testid="payment-proof-input"`), tarjeta con nombre y tamaño y botón "Quitar archivo" |

El esquema se arma con `buildProofFormSchema(remaining)` (`schemas.ts`); los campos numéricos viajan como string y se convierten en `parseProofForm`. "Confirmar pago" queda deshabilitado hasta que el form sea válido **y** haya un PDF válido, y mientras envía ("Enviando…"). El `POST` manda `payerName`, `playersCount?`, `amount` y `file` como multipart.

## Reglas de negocio y validaciones

### Validación cliente (`schemas.ts › validateProofFile`)

- Tipo: `file.type === 'application/pdf'` o nombre terminado en `.pdf` → si no, "El comprobante tiene que ser un PDF."
- Vacío → "El archivo está vacío."
- Más de 5 MB (`MAX_PROOF_BYTES`) → "El PDF pesa más de 5 MB. Elegí uno más liviano."

Un archivo inválido no se guarda en el estado del form y no se envía. La API vuelve a validar tipo, tamaño y los bytes `%PDF-`: el chequeo del cliente es solo comodidad.

### Errores

| Origen | Comportamiento |
|---|---|
| `GET` → `NOT_FOUND` | Pantalla completa "Reserva no encontrada" + "Ir al inicio" |
| `GET` / `POST` → `BOOKING_NOT_PAYABLE` | En el `GET` (reserva cancelada): pantalla "Esta reserva no admite pagos" + "Ir al inicio". En el `POST`: `ErrorAlert` con el mensaje de la API y se invalida la query (si ya no hay saldo, el formulario desaparece) |
| `POST` → `VALIDATION_ERROR` con `details.amount` / `payerName` / `playersCount` | El mensaje se muestra bajo el campo (`form.setError`); si fue `amount` también se invalida la query para refrescar el saldo |
| `POST` → `UNSUPPORTED_FILE_TYPE` / `FILE_TOO_LARGE` / otro `VALIDATION_ERROR` (p. ej. `details.file`) / `RATE_LIMITED` / red | `ErrorAlert` sobre el formulario; elegir otro archivo limpia el error |
| Otro error en el `GET` | `ErrorAlert` + "Reintentar" |

Copiar un dato bancario: toast "{campo} copiado"; si el portapapeles falla, "No se pudo copiar. Copialo a mano."

## Contrato API

```ts
// GET  /public/c/:slug/bookings/:id/payment
// POST /public/c/:slug/bookings/:id/payment-proof   multipart: payerName, playersCount?, amount, file → 201 mismo shape
interface PublicPayment {
  bank: { cbu: string | null; alias: string | null; holderName: string | null };
  booking: {
    id; courtName; startsAt; endsAt; price; paidAmount;
    pendingAmount;        // price - paidAmount, ignora comprobantes en revisión
    pendingProofsAmount;  // Σ montos declarados de los PENDING (descuento visual)
    remaining;            // price - paidAmount - pendingProofsAmount
    fullyCovered;         // remaining <= 0
  };
  proofs: { pendingCount: number; approvedCount: number; rejectedCount: number }; // solo conteos
}
```

El descuento es **visual**: el pago real se registra cuando el admin aprueba. Varios jugadores pueden enviar cada uno su comprobante.

| Key | Endpoint | Notas |
|---|---|---|
| `['public', slug, 'payment', id]` | `GET .../payment` | `staleTime: 0`, `retry: false`, `refetchInterval` 30 s solo con `proofs.pendingCount > 0` |

`useUploadPaymentProof` escribe la respuesta del `POST` en esa key (`setQueryData`); no refetchea.

## Verificación

**No se ejercitó en un navegador durante la implementación** (ni la versión con nombre/monto): solo hubo `pnpm typecheck` y eslint (limpios). Los estados y errores de arriba salen de leer el código, no de haberlos visto andar. La web no tiene test runner.

## Criterios de aceptación

- [ ] Reserva con saldo: se ven resumen con "Saldo a pagar", datos bancarios con copiar y el formulario; "Confirmar pago" queda deshabilitado hasta completar nombre, monto válido (≤ saldo) y PDF.
- [ ] Un envío exitoso muestra el monto enviado y el saldo actualizado, y permite "Enviar otro comprobante" con el formulario vacío.
- [ ] Un monto mayor al saldo muestra el error bajo el campo.
- [ ] Con el saldo cubierto por comprobantes en revisión se ve "Ya está cubierto, pendiente de revisión" sin formulario; si el admin rechaza uno, el saldo vuelve y reaparece el formulario.
- [ ] Un archivo que no es PDF o pesa más de 5 MB se rechaza en el cliente con su mensaje.
- [ ] Tras aprobar todo desde el panel, el link muestra "Turno pago, ¡gracias!".
- [ ] Reserva cancelada o UUID inexistente → pantalla de error amigable, sin formulario.
- [ ] Complejo sin datos bancarios → aviso y sin formulario.

## Fuera de alcance

- Subir imágenes (solo PDF) o varios archivos en un mismo envío.
- Ver nombres o montos de otros pagadores (la API solo expone conteos).
- Aviso al cliente cuando el admin revisa (ve el estado al reabrir o por el refresco de 30 s).
