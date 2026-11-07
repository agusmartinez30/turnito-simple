# 23 — `/app/[slug]/pagar/[id]`: pago por transferencia con comprobante (sin cuenta)

> Abajo, `/public/` se lee como `/public/c/:slug/` (docs/16-multi-complex.md). Contraparte de la API: [`api/docs/23-public-payment-link.md`](../../api/docs/23-public-payment-link.md).

## Objetivo

Que el cliente de una reserva abra un link, vea **los datos bancarios del complejo y cuánto falta pagar**, transfiera y **suba el comprobante (PDF, JPG o PNG)**. El comprobante queda en revisión; el admin lo aprueba (se registra el pago) o lo rechaza con motivo, desde el detalle de la reserva o desde el listado unificado de `/admin/payments` (botones Aceptar / Rechazar / Ver comprobante; ver `12-admin-payments.md`). Sin cuenta: el UUID de la reserva es la llave.

## Flujo con QR

```
admin imprime el QR (Ajustes → "QR de pago")  →  jugador escanea  →  /app/[slug]  (lista de turnos de hoy y ayer)
  → toca su turno  →  /app/[slug]/pagar/[id]  (resumen + datos bancarios)  →  sube el comprobante (PDF/JPG/PNG)  →  PaymentProof PENDING
  → admin aprueba (se registra el Payment) o rechaza con motivo
```

Los turnos `PENDING` (solicitudes sin confirmar) **no** aparecen en la lista, pero siguen siendo pagables entrando directo al link `/app/[slug]/pagar/[id]`. Contraparte de la lista: `GET /public/c/:slug/bookings` ([`api/docs/23-public-payment-link.md`](../../api/docs/23-public-payment-link.md)).

## Rutas / pantallas

| Ruta | Layout | Auth | Descripción |
|---|---|---|---|
| `/app/[slug]` | `(open)` | **Ninguna** | Landing del QR: lista de turnos recientes (sin los ya pagados en su totalidad) para elegir el propio |
| `/app/[slug]/pagar/[id]` | `(open)` | **Ninguna** | Estado del pago de la reserva `id`: resumen, datos bancarios y subida del comprobante |

### Landing del QR — `/app/[slug]`

`src/app/(open)/app/[slug]/page.tsx` es fino y monta `PublicBookingsView` (`src/features/public-bookings/{api,hooks,schemas}.ts` + `components/PublicBookingsView.tsx`). Query `['public', slug, 'bookings']`, `staleTime: 0`, `retry: false`.

- Título "Pagar tu turno". Los turnos se agrupan por día en el timezone del complejo bajo "Hoy" / "Ayer" (`groupByDay`).
- Cada turno es una card (`data-testid="public-booking-card"`) que linkea a `/app/[slug]/pagar/[id]`: horario, cancha y deporte, y el **nombre completo** de quien reservó ("Reserva sin nombre" si no hay cliente). No se muestran teléfono ni otros datos.
- Badge de pago: `Pagado` (la card se atenúa) · `Comprobante en revisión` (`hasPendingProof`) · `Pago parcial` · `Sin pagar`.
- Lista vacía (`data-testid="public-bookings-empty"`): "No hay turnos recientes. Si jugaste hoy o ayer y no ves tu turno, consultá en el complejo."
- Slug inexistente (`NOT_FOUND` del complejo o de la lista): pantalla "Complejo no encontrado". Otro error: `ErrorAlert` con "Reintentar".

### QR en Ajustes (admin) — `PaymentQrCard`

`src/features/admin-settings/components/PaymentQrCard.tsx`, montada en `SettingsPage`. Genera con `qrcode.react` (`QRCodeSVG`) el QR de `${origin}/app/${slug}` (el origin se lee en el cliente, igual que `PaymentLinkCard`). Acciones: **Copiar** el link, **Descargar** el QR como SVG (`qr-pago-<slug>.svg`) e **Imprimir** (`window.print()`; con utilidades `print:` se oculta todo salvo `#payment-qr-print`: nombre del complejo, QR grande y "Escaneá, elegí tu turno y pagá"). Si faltan CBU, alias o titular, la descripción avisa que primero hay que cargar los datos bancarios.

`page.tsx` es fino y monta `PublicPaymentView`. El link lo arma el admin desde el detalle de la reserva (`PaymentLinkCard`, [`12-admin-payments.md`](./12-admin-payments.md)). Código: `src/features/public-payment/{api,hooks,schemas}.ts` + `components/` (`PublicPaymentView` contenedor; `BookingSummaryCard`, `BankTransferCard`, `PaymentForm`, `ProofUploadField`).

## UI

Título "Pagar tu turno" + resumen de la reserva (`BookingSummaryCard`: cancha como título, fecha y horario con íconos en el timezone del complejo, badge de estado discreto —`Comprobante en revisión` / `Pagado` / `Pago parcial`—, y `Total del turno` / `Total abonado` / `En revisión` —solo si `pendingProofsAmount > 0`— con importes a la derecha / **`Saldo pendiente del turno`** en un contenedor de fondo suave = `booking.remaining`, con `data-testid="payment-remaining"`). Debajo, según `remaining`, `pendingAmount` y `proofs.pendingCount` del `GET`:

| Situación | Qué se ve |
|---|---|
| `remaining > 0` | Datos bancarios (`BankTransferCard`, "Transferí a la cuenta del complejo deportivo") con botón copiar por campo y feedback "Copiado" (Alias destacado, CBU / CVU, Titular; las filas vacías no se muestran; los valores largos se parten sin desbordar) y el formulario "Informar transferencia". Si además `proofs.pendingCount > 0`, una alerta "Hay N comprobante(s) en revisión" (ya descontados del saldo) |
| `remaining <= 0` y `pendingAmount <= 0` | Alerta "Turno pago, ¡gracias!". Sin formulario |
| `remaining <= 0` y `pendingAmount > 0` (`fullyCovered`) | Alerta "Ya está cubierto, pendiente de revisión" (aclara que si rechazan alguno el saldo vuelve a estar disponible). Sin formulario |
| Tras un envío exitoso | Alerta "Comprobante enviado, pendiente de revisión" con el monto enviado y el saldo restante actualizado; si `remaining > 0`, botón **Enviar otro comprobante** (incrementa un `key` que remonta el formulario vacío, sin `form.reset()`) |

Un comprobante rechazado simplemente reabre el saldo: la API deja de contarlo y la página no muestra el rechazo ni su motivo. La query se refresca cada 30 s mientras `proofs.pendingCount > 0`.

**Complejo sin datos bancarios** (CBU, alias y titular vacíos): la `BankTransferCard` dice "El complejo todavía no cargó sus datos bancarios. Comunicate con el complejo para coordinar el pago." y **no** se muestra el formulario.

**Formulario** (react-hook-form + zod, `mode: 'onChange'`):

| Campo | Regla |
|---|---|
| "Nombre de quien paga" | requerido, trim, 1..100; placeholder "Ej. Juan Pérez" |
| "Importe transferido" | requerido, prefijo "$", entero ≥ 1. **Nunca se autocompleta** ni se divide por jugador (no hay "Usar el saldo completo"). Si supera el saldo pendiente se muestra una advertencia **no bloqueante**; la API sigue siendo la autoridad y su error aparece bajo el campo |
| "Cantidad de jugadores" (opcional) | entero 1..50; vacío = no se envía; nunca afecta el monto |
| Comprobante (`ProofUploadField`) | `<input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png">` (`data-testid="payment-proof-input"`); zona de carga "Adjuntar comprobante · PDF, JPG o PNG · máx. 5 MB"; con archivo válido, tarjeta de éxito con nombre, ícono de tipo, tamaño y acciones Reemplazar / Quitar; los errores de tipo o tamaño se ven bajo el campo |

El esquema es `buildProofFormSchema()` (`schemas.ts`, sin tope por saldo; `isAmountOverBalance` alimenta la advertencia); los campos numéricos viajan como string y se convierten en `parseProofForm`. "Enviar comprobante" (ancho completo) queda deshabilitado hasta que el form sea válido **y** haya un archivo válido, y mientras envía ("Enviando…", sin envíos duplicados). Debajo: "El complejo verificará tu transferencia". El `POST` manda `payerName`, `playersCount?`, `amount` y `file` como multipart.

## Reglas de negocio y validaciones

### Validación cliente (`schemas.ts › validateProofFile`)

- Tipo: nombre terminado en `.pdf`, `.jpg`, `.jpeg` o `.png` → si no, "El comprobante tiene que ser un PDF, JPG o PNG."
- Vacío → "El archivo está vacío."
- Más de 5 MB (`MAX_PROOF_BYTES`) → "El archivo pesa más de 5 MB. Elegí uno más liviano."

Un archivo inválido no se guarda en el estado del form y no se envía. La API vuelve a validar tipo, tamaño y los bytes iniciales (PDF, JPEG o PNG): el chequeo del cliente es solo comodidad.

### Errores

| Origen | Comportamiento |
|---|---|
| `GET` → `NOT_FOUND` | Pantalla completa "Reserva no encontrada" + "Ir al inicio" |
| `GET` / `POST` → `BOOKING_NOT_PAYABLE` | En el `GET` (reserva cancelada): pantalla "Esta reserva no admite pagos" + "Ir al inicio". En el `POST`: `ErrorAlert` con el mensaje de la API y se invalida la query (si ya no hay saldo, el formulario desaparece) |
| `POST` → `VALIDATION_ERROR` con `details.amount` / `payerName` / `playersCount` | El mensaje se muestra bajo el campo (`form.setError`); si fue `amount` también se invalida la query para refrescar el saldo |
| `POST` → `UNSUPPORTED_FILE_TYPE` / `FILE_TOO_LARGE` / otro `VALIDATION_ERROR` (p. ej. `details.file`) / `RATE_LIMITED` / red | `ErrorAlert` sobre el formulario; elegir otro archivo limpia el error |
| Otro error en el `GET` | `ErrorAlert` + "Reintentar" |

Copiar un dato bancario: el botón cambia a "Copiado" ~2 s; si el portapapeles falla, "No se pudo copiar. Copialo a mano."

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

**El rediseño de la pantalla de pago no se ejercitó en un navegador** (solo `pnpm typecheck` y eslint limpios); (ni la versión con nombre/monto, ni la landing del QR, ni la `PaymentQrCard` con su descarga e impresión): solo hubo `pnpm typecheck`, eslint y `next build` (limpios). Los estados y errores de arriba salen de leer el código, no de haberlos visto andar. La web no tiene test runner.

## Criterios de aceptación

- [ ] `/app/[slug]` lista los turnos confirmados de hoy y ayer agrupados por día, con nombre completo y badge de pago; tocar uno lleva a `pagar/[id]`.
- [ ] Un slug inexistente muestra "Complejo no encontrado"; sin turnos, el mensaje de lista vacía.
- [ ] En Ajustes, la card "QR de pago" muestra el QR de `/app/<slug>`; copiar, descargar e imprimir funcionan (al imprimir solo sale el QR).

- [ ] Reserva con saldo: se ven resumen con "Saldo a pagar", datos bancarios con copiar y el formulario; "Enviar comprobante" queda deshabilitado hasta completar nombre, monto válido (≤ saldo) y comprobante válido (PDF, JPG o PNG).
- [ ] Un envío exitoso muestra el monto enviado y el saldo actualizado, y permite "Enviar otro comprobante" con el formulario vacío.
- [ ] Un monto mayor al saldo muestra una advertencia no bloqueante; si la API lo rechaza, el error aparece bajo el campo.
- [ ] Con el saldo cubierto por comprobantes en revisión se ve "Ya está cubierto, pendiente de revisión" sin formulario; si el admin rechaza uno, el saldo vuelve y reaparece el formulario.
- [ ] Un archivo que no es PDF, JPG o PNG o pesa más de 5 MB se rechaza en el cliente con su mensaje.
- [ ] Tras aprobar todo desde el panel, el link muestra "Turno pago, ¡gracias!".
- [ ] Reserva cancelada o UUID inexistente → pantalla de error amigable, sin formulario.
- [ ] Complejo sin datos bancarios → aviso y sin formulario.

## Fuera de alcance

- Otros formatos (WebP, HEIC) o varios archivos en un mismo envío.
- Ver nombres o montos de otros pagadores (la API solo expone conteos).
- Aviso al cliente cuando el admin revisa (ve el estado al reabrir o por el refresco de 30 s).
