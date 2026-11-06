# 23 — Link público de pago y comprobantes de transferencia

## Objetivo

Que el cliente de una reserva pueda **pagar por transferencia sin cuenta**: un link con el UUID de la reserva le muestra los datos bancarios del complejo y le deja subir el comprobante en PDF. El comprobante queda `PENDING` hasta que un admin lo aprueba (se registra un `Payment` `TRANSFER`) o lo rechaza (con motivo). Contraparte de [`web/docs/23-public-payment-page.md`](../../web/docs/23-public-payment-page.md) y de las cards de [`web/docs/12-admin-payments.md`](../../web/docs/12-admin-payments.md).

## Flujo

```
admin copia el link /app/<slug>/pagar/<bookingId> (o lo manda por WhatsApp)
  → jugador: GET  /public/c/:slug/bookings/:id/payment          (datos bancarios + saldo restante + conteo de comprobantes)
  → jugador: POST /public/c/:slug/bookings/:id/payment-proof     (nombre, jugadores?, monto, PDF)  → PaymentProof PENDING
  → admin:   GET  /admin/bookings/:id/payment-proofs[/:proofId/file]
  → admin:   POST .../:proofId/approve  → PaymentProof APPROVED + Payment TRANSFER (misma transacción)
             POST .../:proofId/reject   → PaymentProof REJECTED + motivo; ese monto vuelve a estar disponible
```

Varios jugadores pueden subir **cada uno su comprobante** (no hay tope de un `PENDING` por reserva). Confirmar el envío **no** registra ningún pago: solo la aprobación del admin lo hace. El "saldo restante" que ve el jugador se descuenta con los comprobantes pendientes, pero es **solo visual**: el `Payment` real se crea al aprobar.

### Saldo restante

```
paidAmount        = Σ pagos no anulados (computePaymentSummary)
pendingProofsAmt  = Σ declaredAmount de los comprobantes PENDING
remaining         = max(0, price - paidAmount - pendingProofsAmt)
```

Un comprobante rechazado deja de sumar en `pendingProofsAmt`, así que su monto vuelve a `remaining`. Los aprobados ya están en `paidAmount` (como `Payment`).

## Endpoints

### Públicos (`@Public()`, `ThrottlerGuard`) — `PublicPaymentController`

Cuelgan de `/public/c/:slug/bookings/:id` (slug inexistente → 404; el `:id` pasa por `uuidParam`). La reserva se busca con `court.complexId = complejo del slug`: una reserva de otro complejo responde `404 NOT_FOUND` igual que una inexistente.

#### `GET /public/c/:slug/bookings/:id/payment` — 60/min por IP

```ts
// 200
{
  bank:    { cbu: string | null; alias: string | null; holderName: string | null };
  booking: { id; courtName; startsAt; endsAt;            // ISO con offset del complejo
             price; paidAmount;
             pendingAmount;                               // max(0, price - paidAmount): ignora comprobantes en revisión
             pendingProofsAmount;                         // Σ declaredAmount de los PENDING
             remaining;                                   // ver "Saldo restante"
             fullyCovered };                              // remaining <= 0
  proofs:  { pendingCount: number; approvedCount: number; rejectedCount: number };
}
// 404 NOT_FOUND            "Reserva no encontrada."
// 409 BOOKING_NOT_PAYABLE  "Esta reserva no admite pagos."   (reserva CANCELLED)
// 429 RATE_LIMITED
```

`proofs` son solo **conteos** por estado: no se exponen nombres, montos individuales ni motivos de rechazo de otros pagadores (el UUID de la reserva es la única llave). Una reserva ya cubierta **sí** se devuelve (con `remaining: 0`); el rechazo por "sin saldo" ocurre solo en el POST.

#### `POST /public/c/:slug/bookings/:id/payment-proof` — 20/min por IP

`multipart/form-data` con el archivo `file` (`memoryStorage`, `limits: { fileSize: 5 MB, files: 1 }`) y tres campos de texto (`CreatePaymentProofDto`):

| Campo | Regla |
|---|---|
| `payerName` | requerido, trim, 1..100 |
| `playersCount` | opcional, entero 1..50 (string vacío = ausente) |
| `amount` | requerido, entero ≥ 1 y ≤ `remaining` (pesos que respalda el comprobante) |

Los strings de dígitos se convierten a número; cualquier otra cosa falla `IsInt`.

```ts
// 201: mismo shape que el GET (ya con este comprobante descontado de remaining)
// 400 VALIDATION_ERROR              details.file: ['Elegí un archivo'] (sin archivo o vacío) · details.payerName / playersCount / amount (DTO)
// 400 VALIDATION_ERROR              details.amount: ['El monto no puede superar el saldo restante ($N).']
// 404 NOT_FOUND
// 409 BOOKING_NOT_PAYABLE           "Esta reserva no admite pagos." (CANCELLED) · "Esta reserva ya está paga." (remaining ≤ 0)
// 413 FILE_TOO_LARGE                lo corta multer (mapeo 413 → FILE_TOO_LARGE del HttpExceptionFilter)
// 415 UNSUPPORTED_FILE_TYPE         "El comprobante tiene que ser un PDF."
// 429 RATE_LIMITED
```

### Admin (`@Roles(ADMIN)`) — `AdminPaymentProofsController`

Cuelgan de `/admin/bookings/:id/payment-proofs`. `:id` y `:proofId` pasan por `uuidParam`. Reserva o comprobante ajenos al complejo → `404 NOT_FOUND` ("Reserva no encontrada." / "Comprobante no encontrado."). `403` para no-admin, `401` sin token.

| Método | Path | Respuesta |
|---|---|---|
| `GET` | `/admin/bookings/:id/payment-proofs` | `PaymentProofResponse[]` (`createdAt desc`) |
| `GET` | `/admin/bookings/:id/payment-proofs/:proofId/file` | `{ url }`: URL firmada del PDF, **10 min** (`PROOF_SIGNED_URL_TTL_SEC`) |
| `POST` | `/admin/bookings/:id/payment-proofs/:proofId/approve` | 200 `PaymentProofResponse` |
| `POST` | `/admin/bookings/:id/payment-proofs/:proofId/reject` | 200 `PaymentProofResponse` |

```ts
interface PaymentProofResponse {
  id; status: 'PENDING' | 'APPROVED' | 'REJECTED';
  payerName: string;
  playersCount: number | null;
  declaredAmount: number;         // lo que dice el jugador (0 en filas previas al cambio)
  amount: number | null;          // monto aprobado (null mientras no se aprobó)
  createdAt; reviewedAt: string | null; rejectReason: string | null;   // ISO UTC
}

// approve  body: { amount?: number }      entero ≥ 1; sin amount = declaredAmount acotado al saldo actual
// reject   body: { reason: string }       trim, 1..300
// 400 VALIDATION_ERROR (DTO)
// 409 PAYMENT_PROOF_NOT_PENDING  "Este comprobante ya fue revisado."
// 409 BOOKING_NOT_PAYABLE        approve: reserva CANCELLED, o monto resultante ≤ 0 con la reserva ya paga ("Esta reserva ya está paga.")
```

## Reglas

### Validación del archivo (POST público)

Orden en `PublicPaymentService.uploadProof`: los campos de texto pasan por el DTO (`400`) → reserva existe y no está `CANCELLED` → archivo presente (`400`) → PDF (`415`) → `remaining` > 0 (`409`) y `amount` ≤ `remaining` (`400` en `details.amount`). Este último chequeo se hace **antes** de subir, para no subir un archivo con monto inválido.

- Solo PDF: el nombre debe terminar en `.pdf` **y** el buffer empezar con `%PDF-` (`isPdf` en `storage/pdf-type.ts`). El `mimetype` del multipart no se mira: lo elige el cliente.
- Máximo 5 MB (`MAX_PAYMENT_PROOF_BYTES`), cortado por multer antes de bufferear.
- **Varios `PENDING` por reserva**: se eliminó la regla de "un solo `PENDING`"; cada jugador sube su comprobante mientras haya `remaining`. `PAYMENT_PROOF_ALREADY_PENDING` ya no se lanza (queda en el enum de la API marcado `@deprecated`).
- No pagable: reserva `CANCELLED` o `remaining` ≤ 0.
- Throttle propio del POST: 20/min (el resto del controller, 60/min).

### Subida y alta (con lock)

Key `payment-proofs/<bookingId>/<16 hex al azar>.pdf` → `storage.uploadPrivate` → transacción que hace `SELECT id FROM bookings WHERE id = … FOR UPDATE`, **relee** reserva, pagos y totales de comprobantes, repite el chequeo de `remaining`/`amount` y recién entonces `paymentProof.create({ bookingId, fileKey, payerName, playersCount, declaredAmount })`. El lock de fila serializa las subidas de una misma reserva: dos POST concurrentes no pueden pasar ambos el límite (un e2e dispara 5 en paralelo cerca del tope y solo entran los que caben). Ante cualquier fallo (incluido el chequeo dentro de la transacción) se borra el archivo privado (*best-effort*, `warn` si no se pudo) y se relanza el error original.

### Dónde los revisa el admin

Además de la tarjeta del detalle de reserva, los comprobantes `PENDING` (y los `REJECTED` con `voided=true`) viajan en `proofs[]` de `GET /admin/payments`, para revisarlos desde la caja con los mismos endpoints `approve` / `reject` / `file` (ver [`11-admin-payments.md`](./11-admin-payments.md)).

### Aprobación

`AdminPaymentProofsService.approve`, en **una transacción**:

1. Monto = `amount` del body, o `declaredAmount` acotado al saldo actual de la reserva (`min(declaredAmount, saldo)`; en filas legacy con `declaredAmount` 0 se usa el saldo). Si es ≤ 0 → `409 BOOKING_NOT_PAYABLE`. Un `amount` explícito del admin no se acota al saldo (comportamiento previo de `createPayment`).
2. `updateMany({ id, status: PENDING })` → `APPROVED` con `amount`, `reviewedAt`, `reviewedById`. `count 0` (revisión concurrente) → `409 PAYMENT_PROOF_NOT_PENDING` antes de crear ningún pago.
3. `AdminPaymentsService.createPayment(tx, …)` con `method: TRANSFER` y nota "Comprobante de transferencia aprobado". Es el mismo código que usa `register` de [`11-admin-payments.md`](./11-admin-payments.md): alcance por complejo, guard de reservas de torneo, `CANCELLED → BOOKING_NOT_PAYABLE`, `registeredById` = admin que aprueba. Si falla (p. ej. reserva cancelada) la transacción revierte y el comprobante sigue `PENDING`.

`reject` es un `updateMany` condicional análogo (`REJECTED`, `rejectReason`, `reviewedAt`, `reviewedById`); no crea pago.

## Datos

```prisma
enum PaymentProofStatus { PENDING APPROVED REJECTED }

model PaymentProof {
  id           String             @id @default(uuid())
  bookingId    String             @map("booking_id")
  fileKey      String             @map("file_key")          // key en el bucket payment-proofs
  status       PaymentProofStatus @default(PENDING)
  payerName      String           @map("payer_name")        // 1..100, lo declara el jugador
  playersCount   Int?             @map("players_count")     // 1..50, opcional
  declaredAmount Int              @map("declared_amount")   // pesos que dice el comprobante
  amount       Int?                                         // monto APROBADO, se fija al aprobar
  createdAt    DateTime           @default(now())
  reviewedAt   DateTime?
  reviewedById String?                                      // → User (admin)
  rejectReason String?
  @@index([bookingId]) @@index([status])
  @@map("payment_proofs")
}

model Complex {
  // ...existente
  bankCbu        String? @map("bank_cbu")         @db.VarChar(22)    // 22 dígitos
  bankAlias      String? @map("bank_alias")       @db.VarChar(20)    // 6–20: letras, dígitos, . y -
  bankHolderName String? @map("bank_holder_name") @db.VarChar(100)
}
```

Migraciones: `20261106163320_add_payment_proofs_bank_data` (tabla y datos bancarios) y `20261106171125_payment_proof_payer_details` (agrega `payer_name`, `players_count`, `declared_amount`). Las filas previas se rellenan con `payer_name = 'Sin nombre'` y `declared_amount = 0` (los defaults se quitan después). Los datos bancarios se editan con `PATCH /admin/complex` ([`08-admin-complex.md`](./08-admin-complex.md)).

## Seguridad

- **Bucket privado.** Los PDF van a un bucket privado dedicado, `SUPABASE_PAYMENT_PROOFS_BUCKET` (default `payment-proofs`, distinto de `private-documents`, que es solo de imágenes), por `uploadPrivate` con `bucket: 'paymentProofs'`; nunca hay URL pública. El admin los abre con una URL firmada de 10 minutos, pedida al hacer click en "Ver comprobante" y no en el listado ([`18-storage.md`](./18-storage.md)).
- **El UUID de la reserva es la llave pública.** No hay token aparte: quien tiene el link puede ver los datos de pago de esa reserva y subir comprobantes. Un UUID v4 no se adivina; el rate limit y el tope de `remaining` (la suma de pendientes no puede superar el saldo) acotan el abuso. El endpoint público no expone nombres, montos individuales ni motivos de otros comprobantes, solo conteos.
- **Datos bancarios acotados.** Salen solo en `GET .../payment` (necesarios para transferir) y en las respuestas admin del complejo (`toComplexResponse`). `GET /public/c/:slug/complex` **no** los incluye (lo fija un e2e).
- Alcance por complejo en todas las queries; ids ajenos dan el mismo 404 que los inexistentes.
- **Concurrencia:** el chequeo del saldo y el alta del comprobante van en una transacción con `FOR UPDATE` sobre la fila de la reserva, así que subidas simultáneas no pueden sobrepasar `remaining`. La aprobación es segura por su `updateMany` condicional.
- El endpoint público no filtra por origen de la reserva; el guard de torneos se aplica recién al aprobar (`createPayment`).

## Tests

- Unit: `public/public-payment.service.spec.ts`, `admin-payments/admin-payment-proofs.service.spec.ts`, `storage/pdf-type.spec.ts`.
- E2E: `test/e2e/public-payment-proof.e2e-spec.ts` (GET con y sin comprobantes, cancelada, slug/reserva ajena o inexistente, no PDF, `.pdf` sin magic bytes, sin archivo, > 5 MB, reserva paga, validación de `payerName`/`playersCount`/`amount`, monto sobre `remaining`, varios `PENDING` que descuentan, rechazo que devuelve el saldo, carrera de 5 subidas en paralelo cerca del tope), `test/e2e/admin-payment-proofs.e2e-spec.ts` (listado, URL firmada, aprobar crea un único `TRANSFER` y repetir es 409, monto explícito, rechazar sin pago, complejo ajeno, no-admin, cancelada deja `PENDING`), `test/e2e/admin-complex.e2e-spec.ts` (campos bancarios).

## Fuera de alcance

- Pago online / conciliación automática; OCR del comprobante.
- Formatos distintos de PDF (imágenes de captura).
- Notificar al jugador de la aprobación o el rechazo (ve el estado al reabrir el link).
- Vencimiento del link o token firmado.
