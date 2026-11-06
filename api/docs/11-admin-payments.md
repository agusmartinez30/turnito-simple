# 11 — Admin · Pagos por turno (`/admin/bookings/:id/payments`)

## Objetivo

Implementar el contrato de [`web/docs/12-admin-payments.md`](../../web/docs/12-admin-payments.md): registrar y anular pagos (efectivo / transferencia) sobre una reserva, y exponer en cada reserva del panel un **resumen derivado** `payment = { paidAmount, balance, status }`. Sin pago online, sin caja.

## Decisiones

| Tema | Decisión |
|---|---|
| Estado de pago | **Derivado, nunca columna.** `computePaymentSummary(price, payments)` en `src/shared/payments/payment-summary.ts`: `paidAmount` = Σ `amount` con `voidedAt IS NULL`; `balance = price - paidAmount`; `status`: `0 → UNPAID`, `< price → PARTIAL`, `>= price → PAID` (`price 0 → PAID`). Un helper puro reusado por serializer, agenda y dashboard. |
| Cómo se carga | `BOOKING_INCLUDE` suma `payments: { where: { voidedAt: null }, select: { amount: true } }`. Con eso listado, agenda, dashboard y `booking-core` ya traen lo necesario para el resumen sin N+1 (Prisma batchea la relación). `BOOKING_DETAIL_INCLUDE` trae los pagos completos (incl. anulados) con `registeredBy` / `voidedBy` para el detalle. |
| Qué devuelven las mutaciones | El **`AdminBookingResponse` de detalle** actualizado (con `payments[]`). La web obtiene totales frescos en un round trip y hace `setQueryData` del detalle. |
| Rutas | Anidadas bajo la reserva: `POST /admin/bookings/:id/payments`, `PATCH /admin/bookings/:id/payments/:paymentId/void`. El service valida `payment.bookingId === :id` (si no, `NOT_FOUND`). |
| Sobrepago | Permitido. La API valida solo `amount >= 1`. |
| Corrección | Anulación soft (`voidedAt`, `voidedById`, `voidReason`). Sin `DELETE`. Se puede anular en cualquier estado de la reserva. |
| Turno cancelado | Rechaza pagos nuevos con `409 BOOKING_NOT_PAYABLE`. `PENDING` y `CONFIRMED` aceptan. |
| Módulo | `admin-payments` propio (`src/modules/admin-payments/`), mismo patrón que `admin-dashboard`. |
| Jugador | `toBookingResponse` no cambia: el jugador **no** ve pagos. |
| Listado (caja) | `GET /admin/payments`: pagos por **rango de `createdAt`** (cuándo se registró), totales con un `groupBy` por método sobre los vigentes, filas con el turno embebido. Índice `payments_created_at_idx`. Además devuelve `proofs[]` (comprobantes `PENDING` siempre, `REJECTED` con `voided`) para verlos en el mismo listado; nunca suman en totales. |

## Endpoints

Auth: Bearer · rol `ADMIN` (`403 FORBIDDEN` para `PLAYER`; `401` sin token).

### `POST /admin/bookings/:id/payments`

```ts
// Body
{ amount: number; method: 'CASH' | 'TRANSFER'; note?: string }

// 201
{ data: AdminBookingResponse }   // con `payment` y `payments[]` (createdAt desc)

// 400 VALIDATION_ERROR   details.amount / details.method / details.note
// 404 NOT_FOUND          "Reserva no encontrada."
// 409 BOOKING_NOT_PAYABLE "Esta reserva está cancelada; no admite pagos."
```

### `PATCH /admin/bookings/:id/payments/:paymentId/void`

```ts
// Body (opcional)
{ reason?: string }

// 200
{ data: AdminBookingResponse }

// 404 NOT_FOUND              "Pago no encontrado."   (no existe o no pertenece a :id)
// 409 PAYMENT_ALREADY_VOIDED "Este pago ya fue anulado."
```

`:id` y `:paymentId` pasan por `uuidParam` (formato inválido → `400`).

### `GET /admin/payments`

| Query | Tipo | Notas |
|---|---|---|
| `date` | `YYYY-MM-DD` opcional | Día local. Anula `from`/`to`. |
| `from`, `to` | `YYYY-MM-DD` opcional | Días locales **inclusive**: `[from 00:00, to+1 00:00)`. Solo uno → el otro toma el mismo valor. Sin ninguno → hoy (`todayInTz(clock.now(), tz)`). |
| `method` | `CASH \| TRANSFER` opcional | |
| `q` | string opcional, trim, ≥ 2 | `customerSearch(q)` sobre la reserva (`booking: {...}`). En `proofs[]` además matchea `payerName` (contains, case-insensitive). |
| `voided` | `true \| false` opcional | `true` incluye anulados en `payments[]` y comprobantes `REJECTED` en `proofs[]`. Los totales **nunca** incluyen anulados. |
| `limit` | 1..200, default 100 | Solo acota `payments[]`. |

```ts
interface PaymentLedgerResponse {
  range: { from: string; to: string };
  totals: { collected: number; cash: number; transfer: number; count: number };
  payments: PaymentLedgerRowResponse[];   // createdAt desc
  proofs: PaymentProofLedgerRowResponse[]; // createdAt desc, tope 200
}
interface LedgerBookingResponse {
  id: string; status: BookingStatus; price: number;
  startsAt: string; endsAt: string;              // ISO con offset del complejo
  court: CourtSummaryResponse; customer: BookingCustomer;
}
interface PaymentLedgerRowResponse extends PaymentResponse {
  booking: LedgerBookingResponse;
}
interface PaymentProofLedgerRowResponse {
  id: string; status: 'PENDING' | 'REJECTED';
  payerName: string; playersCount: number | null;
  declaredAmount: number;                          // lo que dice el comprobante; NO es dinero cobrado
  createdAt: string; reviewedAt: string | null; rejectReason: string | null;
  booking: LedgerBookingResponse;
}
```

**Listado unificado: `proofs[]`.** La caja muestra pagos y comprobantes juntos; la API devuelve las dos listas y la web las mezcla. Reglas (`AdminPaymentsService.listProofs`, una sola query con `include` de cancha y cliente, scope `booking.court.complexId`):

- Los `PENDING` van **siempre**, sin importar el rango de fechas (requieren acción), y **nunca** entran en `totals`.
- Los `REJECTED` solo con `voided=true` y dentro del rango por `createdAt`.
- Los `APPROVED` no se listan aparte: su `Payment` TRANSFER ya es una fila de `payments[]`.
- Los comprobantes son solo transferencia: `method=CASH` devuelve `proofs: []` sin consultar la tabla.
- `limit` no los acota; tope fijo `PROOFS_LEDGER_CAP = 200` (los más nuevos).
- La revisión usa los endpoints de abajo (`approve` / `reject` / `file`); no hay endpoints nuevos.

Errores: `400 VALIDATION_ERROR` del DTO (formato de fechas, `method`, `q` < 2, `voided`, `limit`); del service con `details`: día inexistente → `{ date|from|to: ['La fecha no es válida'] }`, `to < from` → `{ to: ['El fin del rango no puede ser anterior al inicio'] }`.

### Comprobantes de transferencia (`/admin/bookings/:id/payment-proofs`)

Cada jugador puede subir su PDF (con nombre, cantidad de jugadores opcional y monto declarado) desde el link público de pago; las respuestas admin incluyen `payerName`, `playersCount` y `declaredAmount`, y aprobar sin `amount` usa el monto declarado (acotado al saldo actual). El admin lo revisa con `GET .../payment-proofs` (lista), `GET .../:proofId/file` (`{ url }` firmada, 10 min, del bucket privado dedicado `payment-proofs`), `POST .../:proofId/approve` (`{ amount? }`) y `POST .../:proofId/reject` (`{ reason }`, 1..300). Errores propios: `409 PAYMENT_PROOF_NOT_PENDING`; `409 BOOKING_NOT_PAYABLE` al aprobar sobre una reserva cancelada o ya paga. Contrato completo en [`23-public-payment-link.md`](./23-public-payment-link.md).

**Reuso de `createPayment`.** La lógica de alta de pago vive en `AdminPaymentsService.createPayment(db, complexId, adminId, bookingId, { amount, method, note? })`: reserva del complejo (`404`), guard de reservas de torneo, `CANCELLED → 409 BOOKING_NOT_PAYABLE` y `payment.create` con `registeredById` y `createdAt = clock.now()`. `register` la llama con `this.prisma` y luego relee el detalle; aprobar un comprobante la llama con el cliente de su transacción, con `method: TRANSFER`, así que el pago aparece en la caja como cualquier otro y las reglas no se duplican. Si `createPayment` falla, el comprobante sigue `PENDING`. `AdminPaymentsModule` importa `StorageModule` y registra `AdminPaymentProofsController`.

### Cambios en respuestas existentes

```ts
type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

interface PaymentSummaryResponse { paidAmount: number; balance: number; status: PaymentStatus }

interface PaymentResponse {
  id: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
  createdAt: string;                        // ISO con offset del complejo
  registeredBy: { id: string; name: string };
  voidedAt?: string;
  voidedBy?: { id: string; name: string };
  voidReason?: string;
}

// AdminBookingResponse  += payment: PaymentSummaryResponse (siempre) · payments?: PaymentResponse[] (solo detalle y mutaciones)
// AgendaBookingSummary  += payment: PaymentSummaryResponse
// AdminDashboardSummary += collected: number   (Σ paidAmount de las reservas activas de la semana)
```

`GET /admin/bookings/:id`, `PATCH .../cancel` y `PATCH .../confirm` pasan a devolver el detalle con `payments[]`. `GET /admin/bookings` y `POST /admin/bookings` solo `payment`.

## DTOs

```ts
export class RegisterPaymentDto {
  @IsInt({ message: 'El monto debe ser un número entero' })
  @Min(1, { message: 'El monto debe ser mayor a 0' })
  amount!: number;

  @IsEnum(PaymentMethod, { message: 'Método de pago inválido' })
  method!: PaymentMethod;

  @Transform(trim) @Transform(emptyToUndefined) @IsOptional() @IsString()
  @MaxLength(120, { message: 'La nota no puede superar 120 caracteres' })
  note?: string;
}

export class VoidPaymentDto {
  @Transform(trim) @Transform(emptyToUndefined) @IsOptional() @IsString()
  @MaxLength(280, { message: 'El motivo no puede superar 280 caracteres' })
  reason?: string;
}

export class ListPaymentsDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @Transform(trim) @IsOptional() @IsString() @MinLength(2) q?: string;
  @Transform(booleanString) @IsOptional() @IsBoolean() voided?: boolean;   // helper compartido en common/
  @Type(() => Number) @IsInt() @Min(1) @Max(200) limit: number = 100;
}
```

## Reglas de negocio

1. `register`: la reserva existe (`404`) → no está `CANCELLED` (`409 BOOKING_NOT_PAYABLE`) → `payment.create` con `registeredById = admin.id`, `createdAt = clock.now()` → relee el detalle.
2. `void`: el pago existe **y** pertenece a `:id` (`404`) → no está anulado (`409`) → `updateMany({ where: { id, bookingId, voidedAt: null }, data: { voidedAt: now, voidedById, voidReason } })`; `count === 0` → `409` (mismo guard de carrera que `cancel` / `confirm`) → relee el detalle.
3. Sin transacción en `register`: una carrera con `cancel` a lo sumo deja un pago sobre un turno recién cancelado, que se corrige anulando.
4. La DB garantiza `amount > 0` (`payments_amount_positive_chk`) y que `voided_by_id` / `void_reason` solo existan en pagos anulados (`payments_void_consistency_chk`). Ver [`01-database.md`](./01-database.md).
5. `list`: resuelve el rango (`date` → `[date, date]`; `from ?? to` / `to ?? from`; nada → hoy), valida con `isValidLocalDate` y `to >= from`; arma `where` (`createdAt` en `[from 00:00, to+1 00:00)` local, `method`, `booking: customerSearch(q)`); en paralelo `findMany` (con `voidedAt: null` salvo `voided=true`, `orderBy createdAt desc`, `take limit`, `PAYMENT_LEDGER_INCLUDE`) y `groupBy(['method'])` con `_sum.amount` + `_count` **siempre** con `voidedAt: null`.

## Diseño interno

```
src/shared/payments/payment-summary.ts        computePaymentSummary(price, payments) — puro
src/shared/bookings/customer-search.ts        customerSearch(q): Prisma.BookingWhereInput — compartido con admin-bookings
src/shared/serializers/payment.serializer.ts  PAYMENT_INCLUDE, PaymentWithRelations, PaymentResponse, toPaymentResponse
src/shared/serializers/payment-ledger.serializer.ts
                                              PAYMENT_LEDGER_INCLUDE (+ booking { court, user }), PaymentLedgerRow,
                                              PaymentLedgerRowResponse, PaymentLedgerResponse, toPaymentLedgerRowResponse
src/shared/serializers/booking.serializer.ts  BOOKING_INCLUDE (+payments amount), BOOKING_DETAIL_INCLUDE, BookingWithPayments,
                                              toAdminBookingResponse (+payment), toAdminBookingDetailResponse (+payments[])
src/modules/admin-payments/
  admin-payments.module.ts        imports [ComplexModule]
  admin-payments.controller.ts    @Roles(ADMIN) @Controller('admin') — GET payments → ledger · register / void → toAdminBookingDetailResponse
  admin-payments.service.ts       deps: PrismaService, ComplexService, Clock — list(query) · register(adminId, bookingId, dto) · void(adminId, bookingId, paymentId, reason?)
  dto/list-payments.dto.ts · dto/register-payment.dto.ts · dto/void-payment.dto.ts
```

Cambios en módulos existentes: `admin-bookings.service.ts` (`findOrThrow`, `confirm`, `cancel` releen con `BOOKING_DETAIL_INCLUDE`), `admin-bookings.controller.ts` (`get` / `cancel` / `confirm` → `toAdminBookingDetailResponse`), `agenda.service.ts` (`toAgendaBooking` + `payment`), `admin-dashboard.service.ts` (`collected`).

## Tests

### Unit
- `payment-summary.spec.ts`: sin pagos → `UNPAID` / `balance = price`; parcial → `PARTIAL`; exacto → `PAID` `balance 0`; sobrepago → `PAID` balance negativo; anulados no cuentan; `price 0` → `PAID`.
- `admin-payments.service.spec.ts` (Prisma mock + `FixedClock`):
  - `register` en `CONFIRMED` → `payment.create` con `registeredById`, `createdAt = NOW`, `note null` si no viene; devuelve la relectura.
  - `register` en `PENDING` → OK. En `CANCELLED` → `BOOKING_NOT_PAYABLE`, sin `create`. Inexistente → `NOT_FOUND`. `amount` mayor al restante → OK.
  - `void` OK → `updateMany` con `voidedAt`, `voidedById`, `voidReason`. Ya anulado → `PAYMENT_ALREADY_VOIDED`. `count === 0` → `PAYMENT_ALREADY_VOIDED`. `paymentId` de otra reserva → `NOT_FOUND`.
- `list` (mocks `payment.findMany` / `payment.groupBy`, `ComplexService`, `FixedClock` 2026-09-12 15:00 -03):
  - sin params → rango `[2026-09-12T03:00Z, 2026-09-13T03:00Z)` y `voidedAt: null` en `findMany`; `date` → mismo rango del día; `from/to` inclusive (`to + 1`); solo `from` → `to = from`.
  - `voided: true` → `findMany` sin `voidedAt`; `groupBy` siempre con `voidedAt: null`.
  - `method` y `q` → `method` y `booking: customerSearch(q)` en el `where`.
  - reduce el `groupBy` a `{ cash, transfer, collected, count }`; sin filas → todo 0.
  - `2026-02-30` → `VALIDATION_ERROR` `details.date`; `to < from` → `details.to`.
- Ajustes: `agenda.service.spec` (`booking.payment`), `admin-dashboard.service.spec` (`collected`).

### E2E (`admin-payments.e2e-spec.ts`)
Setup como `admin-bookings.e2e-spec.ts`; reserva confirmada de `price 20000`.
- [ ] `GET /admin/bookings/:id` → `payment: { paidAmount: 0, balance: 20000, status: 'UNPAID' }`, `payments: []`.
- [ ] `POST { amount: 2000, method: 'CASH', note: 'Juan' }` → `201`, `payments[0]` con `registeredBy.name`, `method`, `note`; `payment.status 'PARTIAL'`, `balance 18000`.
- [ ] 9 pagos más de 2000 → `PAID`, `balance 0`; uno más de 500 → `balance -500`, sigue `PAID`.
- [ ] `GET /admin/bookings?date=` y `GET /admin/agenda?date=` traen `payment` y **no** `payments[]`; `GET /admin/dashboard` → `summary.collected = 20500`.
- [ ] `PATCH .../void { reason: 'Error de carga' }` → `200`, el pago con `voidedAt` / `voidedBy` / `voidReason`, `paidAmount` baja; repetir → `409 PAYMENT_ALREADY_VOIDED`.
- [ ] `amount: 0` / `-1` / `1.5` / `method: 'CARD'` / `note` de 121 → `400` con `details`.
- [ ] Reserva cancelada → `POST` → `409 BOOKING_NOT_PAYABLE`; `void` sobre un pago de esa reserva → `200`.
- [ ] `paymentId` inexistente o de otra reserva → `404`.
- [ ] `ana` → `403` en ambos; sin token → `401`. `GET /bookings/:id` de ana no trae `payment` ni `payments`.
- [ ] Insert raw con `amount 0` → falla por `payments_amount_positive_chk`.

`GET /admin/payments` (factory `createPayment` con `createdAt` explícito; segunda reserva de otro cliente):
- [ ] Sin params (clock = 12/09) → solo los vigentes del 12/09, `range` 12/09, `totals { collected, cash, transfer, count }`, cada fila con `booking.court.name` y `booking.customer.name`; orden `createdAt desc`.
- [ ] `?voided=true` → suma la anulada (con `voidedAt`), mismos totales.
- [ ] `?from=2026-09-11&to=2026-09-12` → incluye la del 11/09; `?date=2026-09-11` → solo esa.
- [ ] `?method=TRANSFER` → solo transferencias y `cash: 0`.
- [ ] `?q=<cliente>` filtra por el cliente del turno; `?q=a` → `400`.
- [ ] `?date=2026-02-30` → `400 details.date`; `?from=2026-09-13&to=2026-09-12` → `400 details.to`; `?limit=201` → `400`.
- [ ] Un `POST .../payments` aparece en el `GET` del día del clock.
- [ ] `ana` → `403`; sin token → `401`.

`GET /admin/payments` → `proofs[]` (en `admin-payment-proofs.e2e-spec.ts`, bloque "unified ledger"):
- [ ] Un comprobante `PENDING` aparece aunque `?date=` apunte a otro día y no suma en `totals`.
- [ ] Comprobantes de otro complejo no aparecen.
- [ ] `REJECTED` solo con `voided=true` y dentro del rango; sin el flag o en otro día no aparece.
- [ ] Un comprobante `APPROVED` no aparece (ni con `voided=true`).
- [ ] `?method=CASH` → `proofs: []`; `?method=TRANSFER` los conserva.
- [ ] `?q=` matchea `payerName` sin distinguir mayúsculas.

## Fuera de alcance

- Arqueo / cierre de caja (efectivo contado, diferencias), exportar CSV.
- Reembolsos, edición de pagos, pago online, señas con vencimiento.
- Asociar un pago a un jugador con cuenta.

- Tiempo real: cada alta/anulación de pago y cada aprobación/rechazo de comprobante emite `payment.changed` por Socket.IO a los admins del complejo; ver [`24-realtime-events.md`](./24-realtime-events.md).
