# 12 — Admin · Pagos por turno

## Objetivo

Que el empleado pueda **cobrar un turno** desde el panel: registrar cada pago (efectivo o transferencia) sabiendo a qué turno pertenece, y ver siempre **total / pagado / restante**. En fútbol pagan 10–14 jugadores en distintos momentos; la UI está optimizada para **encadenar muchos pagos chicos sin fricción**.

No hay pago online ni caja diaria: es un registro manual, por turno, con historial y anulación.

## User stories

- Como empleado quiero **registrar un pago sobre un turno** eligiendo monto y método (efectivo / transferencia), para llevar la cuenta de lo cobrado.
- Como empleado quiero **ver cuánto lleva pagado y cuánto falta** de un turno, sin sumar a mano.
- Como empleado quiero **cargar varios pagos seguidos** (uno por jugador) sin cerrar y reabrir el diálogo cada vez.
- Como empleado quiero **dividir el precio entre N jugadores** y cargar "una parte" con un click, para no calcular.
- Como empleado quiero **anular un pago cargado por error**, dejando rastro de quién lo anuló y por qué.
- Como empleado quiero **ver de un vistazo en la agenda y en el listado** qué turnos están pagados, parciales o sin pagar.
- Como admin quiero **ver todos los pagos que entraron en un día** (o en un rango), con totales por método, a qué turno pertenece cada uno y quién lo registró, para cerrar la caja.

## Rutas / pantallas

| Ruta | Layout | Auth | Descripción |
|---|---|---|---|
| `/admin/payments` | `(admin)` | `ADMIN` | **Pagos** (caja): pagos y comprobantes de transferencia en un solo listado, para un día o rango, con totales (los comprobantes no suman). Query: `?date=` (un día; default hoy), o `?from=&to=` (rango); `?method=`, `?q=`, `?voided=1`. |

Además, los pagos por turno viven dentro de pantallas existentes:

| Pantalla | Qué agrega |
|---|---|
| `/admin/bookings/[id]` (detalle) | Card **"Pagos"** con totales, historial y acciones; badge de estado de pago junto al de estado de reserva. |
| `/admin/agenda` | En `AgendaSlotDetail`: pagado / restante + botón **"Registrar pago"**. En la celda: punto de color según estado de pago. |
| `/admin/bookings` (listado) | Columna **"Pago"** con badge; acción "Registrar pago" en el menú de la fila. |
| `/admin` (dashboard) | La card "Ingresos confirmados" muestra debajo "cobrado: $…". |

## UI

### `PaymentStatusBadge`

`Badge` según `payment.status`:

| Estado | Label | Estilo |
|---|---|---|
| `UNPAID` | "Sin pagar" | `outline`, texto rojo suave |
| `PARTIAL` | "Parcial" | ámbar (`PENDING_BADGE_CLASS`) |
| `PAID` | "Pagado" | verde |

`title` = "Pagado $X de $Y". Prop `compact`: en lugar del badge, un punto de 8px del mismo color con `aria-label` (para la celda de agenda).

### Card "Pagos" (`PaymentsCard`, en el detalle)

Ocupa el ancho completo del grid (`md:col-span-2`), debajo de "Turno" y "Cliente".

- **Header**: "Pagos" + `PaymentStatusBadge`.
- **Totales**: tres cifras en fila — **Total** `formatPrice(price)` · **Pagado** `paidAmount` · **Saldo** `balance`. Si `balance < 0`: "Saldo a favor $X" en verde.
- **Historial**: lista de `payments` (orden `createdAt desc`). Cada fila: monto (`font-medium tabular-nums`), badge método ("Efectivo" / "Transferencia"), nota si existe, y muted "por {registeredBy.name} · {formatDateTime(createdAt)}". Pagos anulados: `line-through opacity-60` + "Anulado por {voidedBy.name} el {voidedAt}" + motivo si existe. Acción **"Anular"** (ghost, ícono `Ban`) solo en pagos no anulados.
- **Vacío**: "Todavía no se registraron pagos."
- **Acción**: botón primario **"Registrar pago"** (oculto si `status === 'CANCELLED'`).

### `RegisterPaymentDialog`

`Dialog` (desktop) / `Sheet side="bottom"` (mobile), mismo esqueleto que `AdminBookingDialog`. Título: "Registrar pago". Subtítulo: "{cancha} · {fecha} {horario} · {cliente}".

Se abre con un `PaymentTarget = { id, price, sport, courtName, customerName, startsAt, endsAt, payment }` armado desde `AdminBooking` (detalle / listado) o desde `AgendaSlot.booking` + `court` (agenda).

**Formulario**, de arriba hacia abajo:

1. **Cabecera de saldo** (siempre visible, se actualiza tras cada pago): Total / Pagado / **Restante** (grande, `tabular-nums`). Si `balance <= 0`: "Turno saldado" (verde) o "Saldo a favor $X".
2. **Método**: `ToggleGroup` con "Efectivo" / "Transferencia". Default `CASH`. **Se conserva** entre pagos encadenados.
3. **Monto**: `Input type="number" inputMode="numeric" step={1} min={1}` con prefijo `$` (mismo patrón que el precio de `CourtForm`). `autoFocus`. Enter envía.
4. **Atajos** (botones `outline` `size="sm"`, `type="button"`):
   - **"Saldar restante ($X)"** → carga `balance` en Monto. Deshabilitado si `balance <= 0`.
   - **"Dividir entre [N]"**: input numérico chico (1–30, estado local del diálogo, no se persiste), default por deporte: `FOOTBALL_5 → 10`, `FOOTBALL_7 → 14`, `PADEL → 4`, `TENNIS → 2`. Al lado: "= $ceil(price / N) c/u" y botón **"Usar una parte"** que carga ese monto.
5. **Nota** (opcional): `Input maxLength={120}`, placeholder "Ej.: Juan, paga por dos". Se limpia tras cada pago.
6. **Aviso de sobrepago** (no bloquea): si `amount > max(balance, 0)` → `Alert` ámbar: "Supera el restante por $X. El turno quedará con saldo a favor de $Y." Si el turno ya estaba saldado: "Este turno ya está saldado; el pago quedará como saldo a favor."
7. **Footer**: **"Listo"** (`outline`, cierra; si ya se registró alguno, "Listo · 3 pagos") y **"Registrar pago"** (primary, `form={FORM_ID}`).

**Tras registrar** (éxito): toast "Pago registrado: $X en efectivo", la cabecera de saldo se actualiza con la respuesta, se resetea Monto y Nota (Método se mantiene), foco vuelve a Monto. **El diálogo no se cierra**: el empleado encadena los 10 pagos con Enter.

**Errores**: `BOOKING_NOT_PAYABLE` → toast + cerrar + refetch; `VALIDATION_ERROR` → `setError` por campo; otros → `ErrorAlert` inline. Mientras `busy`, no se puede cerrar.

### `VoidPaymentDialog`

`AlertDialog`, copia de `AdminCancelDialog`: "¿Anular este pago?" + resumen "$X en efectivo · por {registeredBy.name} el {fecha}" + `Textarea` motivo opcional (280) + botón `destructive` **"Sí, anular"**. Éxito: toast "Pago anulado". `PAYMENT_ALREADY_VOIDED` → toast + cerrar + refetch.

### Cambios en pantallas existentes

- **Detalle** (`07`): `PaymentStatusBadge` al lado del badge de estado; `PaymentsCard`; ambos diálogos montados a nivel de la vista.
- **Listado** (`07`): columna "Pago" después de "Precio" con `PaymentStatusBadge`. En reservas `CANCELLED` solo se muestra si `paidAmount > 0` (hay plata que devolver); si no, "—". En el `DropdownMenu` de la fila: **"Registrar pago"** (si `status !== 'CANCELLED'`). En las cards mobile, el badge va junto al precio.
- **Agenda** (`06`): en `AgendaSlotDetail`, debajo de "Precio": "Pagado $X · Restante $Y" + badge, y botón primario **"Registrar pago"** (si `status !== 'CANCELLED'`) que cierra el popover y abre `RegisterPaymentDialog` a nivel de `AgendaView` (igual que "Cancelar turno"). En `AgendaSlotCell`, `PaymentStatusBadge compact` a la derecha de la línea del teléfono.
- **Dashboard** (`11`): card "Ingresos confirmados" con hint "cobrado: {formatPrice(summary.collected)}".

### Link de pago y comprobantes (detalle de reserva)

Dos cards más en `/admin/bookings/[id]` (`AdminBookingDetail`), ninguna en reservas de torneo. Contraparte pública: [`23-public-payment-page.md`](./23-public-payment-page.md); API: [`api/docs/23-public-payment-link.md`](../../api/docs/23-public-payment-link.md).

**`PaymentLinkCard` ("Link de pago")** — oculta si la reserva está `CANCELLED`. `Input` de solo lectura con `${origin}/app/${slug}/pagar/${bookingId}` y tres acciones: **Copiar** (toast "Link copiado"), **Enviar por WhatsApp** (`waLink` con un texto que incluye el nombre del cliente y el link; solo si el cliente tiene teléfono) y **Abrir** (pestaña nueva). Si el complejo no tiene CBU, alias y titular cargados (`complex.data`, ya en cache), la descripción avisa "Todavía no cargaste los datos bancarios en Configuración: el cliente no los va a ver."

**Comprobantes en `PaymentsCard`** — ya no hay una card aparte: los comprobantes `PENDING` y `REJECTED` se mezclan con los pagos en la misma lista, ordenados por fecha (los `APPROVED` no se repiten: ya son un pago). Cada fila (`PaymentProofRow`) sale de `GET /admin/bookings/:id/payment-proofs` (más nuevo primero): badge Pendiente / Aprobado / Rechazado, fecha y hora en el timezone del complejo, **nombre de quien paga** (`payerName`), "N jugadores" si `playersCount` no es null, "Declara $X" si `declaredAmount > 0` (0 = fila previa al cambio, no se muestra), "Acreditado $X" si ya se aprobó (`amount`) y "Motivo: …" en los rechazados. **Ver comprobante** pide la URL firmada al hacer click (`useOpenPaymentProofFile`, compartido con el listado de caja; sin cachear) y la abre en una pestaña nueva con un ancla `noopener noreferrer`; un error sale como toast. Los `PENDING` muestran **Aprobar** y **Rechazar** salvo que la reserva esté `CANCELLED` (`canReview`; el historial se conserva). Vacío: "Todavía no hay comprobantes."

**`PaymentProofReviewDialog`**:

- *Aprobar*: campo "Monto (opcional)", entero ≥ 1; precargado con el monto declarado (`declaredAmount`; si es 0, con el saldo pendiente) y editable. El texto del diálogo nombra al pagador, sus jugadores y el monto declarado. Vacío = la API usa el monto declarado acotado al saldo actual. Éxito → toast "Comprobante aprobado: pago registrado".
- *Rechazar*: el monto de ese comprobante vuelve a estar disponible en el link público (el motivo queda solo para el admin). "Motivo" obligatorio (`Textarea`, máx. 300, el botón se habilita con texto no vacío). Éxito → toast "Comprobante rechazado".
- `PAYMENT_PROOF_NOT_PENDING` y `BOOKING_NOT_PAYABLE` → toast con el mensaje de la API y cierra el diálogo (la lista ya se refrescó); cualquier otro error → `ErrorAlert` dentro del diálogo.

Tras aprobar o rechazar (y también ante error) se invalidan los comprobantes de la reserva, `adminBookingKeys.all`, dashboard, stats, caja, agenda y `['admin','customers']`, porque aprobar crea un pago `TRANSFER`.

**Estado de verificación:** estas cards (y el link público) **no se probaron en un navegador**; la API no estaba corriendo en local. Solo hubo `pnpm typecheck` y eslint limpios.

### `/admin/payments` — Pagos (`PaymentsLedger`)

Sidebar (`AdminShell`): ítem **Pagos** (`/admin/payments`, ícono `Banknote`) después de Reservas; también aparece en el drawer lateral mobile.

`PageHeader` "Pagos". Debajo, en orden:

**`DayNav`** (solo en modo día): botón "‹" (día anterior), **"lunes 14 de septiembre"** (capitalizado; si es hoy, sufijo muted "· hoy"), botón "›", y botón `outline` **"Hoy"** solo cuando no es hoy. Escribe `?date=` con `router.replace` (`scroll: false`); hoy no se escribe en la URL.

**`PaymentsLedgerFilters`** (fila con wrap):
- **Buscar**: `Input` con lupa, placeholder "Nombre, email o teléfono", debounce 400 ms → `?q=`. Mínimo 2 caracteres.
- **Fecha**: `Popover` + `Calendar mode="range"` con chips "Hoy" / "Esta semana" / "Este mes". Un solo día → `?date=`; dos → `?from=&to=` (modo rango: `DayNav` se oculta). Label del trigger: "Hoy", "lun 14/09" o "lun 08/09 – dom 14/09".
- **Método**: `ToggleGroup` "Efectivo" / "Transferencia", deseleccionable → `?method=`.
- **Mostrar anulados**: `Switch` → `?voided=1`.
- "Limpiar filtros" visible si hay alguno (vuelve a hoy sin filtros).

**Totales** (`PaymentsLedgerTotals`, 4 `Card` como `DashboardSummary`, `grid-cols-2 lg:grid-cols-4`): **Total cobrado** `formatPrice(totals.collected)` · **Efectivo** · **Transferencia** · **Pagos** `totals.count` (hint "sin contar anulados"). Los totales son de **todo el período y filtros**, aunque la tabla esté acotada por `limit`, y nunca incluyen anulados.

**Aviso de pendientes**: si hay comprobantes `PENDING`, una franja `warning` bajo los totales dice "N comprobantes pendientes de revisión. No se cuentan en los totales hasta aceptarlos."

**Listado unificado** (`PaymentsLedgerTable`, `Table` md+ / cards en mobile). `buildLedgerEntries` (`ledger-entries.ts`) mezcla `payments[]` y `proofs[]` de `GET /admin/payments` en filas discriminadas por `kind` (`PAYMENT` | `PROOF`): primero los comprobantes `PENDING` (fijados arriba, `createdAt desc`; la API los trae sin importar el rango) y después el resto por `createdAt desc`.

Filas de comprobante (`kind: 'PROOF'`):
- Fondo `warning-subtle` si está pendiente. **Monto**: `declaredAmount` en muted con la leyenda "declarado" (no es dinero cobrado; `—` si es 0). **Método**: `Badge` "Transferencia" + `Badge` "Pendiente de revisión" (`warning`) o "Rechazado" (`danger`). **Nota**: nombre de quien paga (+ "N jugadores" si hay) y "Motivo: …" en rechazados. **Registró**: `—`.
- Botones en la columna Acciones (y debajo en las cards mobile): **Aceptar** (abre `PaymentProofReviewDialog` en modo `approve`, monto prellenado con `declaredAmount` y editable), **Rechazar** (modo `reject`, motivo obligatorio) y **Ver comprobante** (`useOpenPaymentProofFile`: pide la URL firmada al click y abre el comprobante (PDF o imagen) en una pestaña nueva con ancla `noopener noreferrer`). Aceptar/Rechazar solo en `PENDING` y si la reserva no está `CANCELLED`; los `REJECTED` conservan solo "Ver comprobante".
- Los diálogos y mutaciones son los mismos del detalle de reserva (`useApprovePaymentProof(bookingId)` / `useRejectPaymentProof(bookingId)`, con el `bookingId` de la fila); invalidan `adminPaymentKeys.all`, así que el listado se refresca solo.
- Los `REJECTED` aparecen solo con "Mostrar anulados" y dentro del rango; con filtro `Efectivo` no se muestra ningún comprobante; el buscador también matchea el nombre de quien paga.

Filas de pago (`kind: 'PAYMENT'`) y columnas, orden `createdAt desc`:

| Columna | Contenido |
|---|---|
| Hora | "18:05" en modo día; "14/09/2026 18:05" en modo rango (`tabular-nums`) |
| Monto | `formatPrice(amount)` (derecha) |
| Método | `Badge` "Efectivo" / "Transferencia" |
| Turno | `Link` a `/admin/bookings/[id]`: cancha · "sáb 13/09 · 20:00 – 21:00"; si la reserva está cancelada, sufijo muted "· cancelada" |
| Cliente | nombre; debajo teléfono o email muted |
| Nota | truncada, `title` con el texto completo |
| Registró | `registeredBy.name` |
| Acciones | `DropdownMenu` (⋯): "Ver reserva", "Anular pago" (solo no anulados) → `VoidPaymentDialog` |

Filas anuladas (solo con "Mostrar anulados"): monto y método en `line-through text-muted-foreground`, `Badge outline` "Anulado" y debajo en `text-xs` "por {voidedBy.name} · {motivo}".

Si la respuesta trae exactamente `limit` pagos: "Mostrando los primeros {limit} pagos. Los totales incluyen todo el período." (`limit` no acota los comprobantes; la API los topea en 200.)

### Estados

| Zona | Loading | Empty | Error |
|---|---|---|---|
| `PaymentsCard` | viaja con el detalle (skeleton del detalle suma una tercera card) | "Todavía no se registraron pagos." | el del detalle |
| `RegisterPaymentDialog` | botón con spinner, campos deshabilitados | — | `ErrorAlert` inline |
| `PaymentsLedger` | 4 cards skeleton + 8 filas skeleton | "No hay pagos ni comprobantes en este período" + "Limpiar filtros" (si hay filtros) | `Alert` + "Reintentar" |

## Reglas de negocio y validaciones

- **Estado de pago derivado** (lo calcula la API, la web no suma): `paidAmount` = Σ `amount` de pagos **no anulados**; `balance = price - paidAmount`; `status`: `paidAmount === 0 → UNPAID`, `< price → PARTIAL`, `>= price → PAID`. Un turno con `price 0` es `PAID`.
- **Sobrepago permitido**: la API acepta cualquier monto `>= 1`; la web solo avisa. `balance` negativo = saldo a favor.
- **Anular, nunca borrar**: un pago anulado deja de contar pero queda en el historial con quién y cuándo. Se puede anular aunque el turno esté cancelado (corrige errores).
- **Turno cancelado no admite pagos nuevos** (`BOOKING_NOT_PAYABLE`). `PENDING` y `CONFIRMED` sí.
- Formulario: `amount` entero `>= 1` ("Ingresá un monto" / "Debe ser mayor a 0"); `method` requerido; `note` opcional, `trim`, máx. 120.
- "Dividir entre N": solo un atajo de UI. `N` no se guarda.

## Contrato API

### Tipos

```ts
export type PaymentMethod = 'CASH' | 'TRANSFER';
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export interface PaymentSummary {
  paidAmount: number;   // Σ pagos no anulados
  balance: number;      // price - paidAmount; negativo = saldo a favor
  status: PaymentStatus;
}

export interface Payment {
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

// AdminBooking (05) suma:
//   payment: PaymentSummary;   siempre (listado, detalle, dashboard)
//   payments?: Payment[];      solo en GET /admin/bookings/:id y en las respuestas de POST/void (orden createdAt desc)
// AgendaSlot.booking (05) suma:
//   payment: PaymentSummary;
// AdminDashboardSummary (11) suma:
//   collected: number;         Σ paidAmount de las reservas activas de la semana

/** Fila del listado de pagos (/admin/payments). */
export interface PaymentLedgerRow extends Payment {
  booking: {
    id: string;
    status: BookingStatus;
    price: number;
    startsAt: string;
    endsAt: string;
    court: Pick<Court, 'id' | 'name' | 'sport' | 'isIndoor'>;
    customer: BookingCustomer;
  };
}

export interface PaymentLedgerTotals {
  collected: number;   // cash + transfer
  cash: number;
  transfer: number;
  count: number;       // pagos vigentes del período
}

export interface PaymentLedger {
  range: { from: string; to: string };   // YYYY-MM-DD, días locales inclusive
  totals: PaymentLedgerTotals;           // nunca incluyen anulados; independientes de `limit`
  payments: PaymentLedgerRow[];          // createdAt desc
}
```

### `GET /admin/payments`

```ts
// Auth: Bearer · rol ADMIN
// Query (todos opcionales)
{
  date?: string;      // YYYY-MM-DD, día local → anula from/to
  from?: string;      // YYYY-MM-DD, día local inclusive
  to?: string;        // YYYY-MM-DD, día local inclusive; solo uno de los dos → el otro toma el mismo valor
                      // sin date/from/to → hoy en el timezone del complejo
  method?: PaymentMethod;
  q?: string;         // >= 2 chars; busca en el cliente del turno (name / email / phone, contiene, case-insensitive)
  voided?: boolean;   // true → incluye anulados en `payments[]` (los totales nunca los incluyen). Default false
  limit?: number;     // default 100, max 200; solo acota `payments[]`
}
// El rango aplica sobre `createdAt` del pago (cuándo se registró), no sobre la fecha del turno.

// 200
{ data: PaymentLedger }

// 400 VALIDATION_ERROR   formato inválido (DTO) · fecha inexistente → details.date|from|to · to < from → details.to
// 403 FORBIDDEN
```

Usos concretos:

| Pantalla / filtro | Query |
|---|---|
| Pagos sin filtros | (vacío) → hoy |
| `?date=` | `?date=2026-09-13` |
| Rango | `?from=2026-09-08&to=2026-09-14` |
| Solo transferencias con anulados | `?method=TRANSFER&voided=true` |

### `POST /admin/bookings/:id/payments`

```ts
// Auth: Bearer · rol ADMIN
// Body
{ amount: number; method: PaymentMethod; note?: string }   // amount entero >= 1 · note <= 120

// 201
{ data: AdminBooking }   // detalle completo con `payment` y `payments[]` frescos

// 400 VALIDATION_ERROR   (details.amount / details.method / details.note)
// 404 NOT_FOUND          "Reserva no encontrada."
// 409 BOOKING_NOT_PAYABLE "Esta reserva está cancelada; no admite pagos."
// 403 FORBIDDEN
```

### `PATCH /admin/bookings/:id/payments/:paymentId/void`

```ts
// Body (opcional)
{ reason?: string }   // <= 280

// 200
{ data: AdminBooking }

// 404 NOT_FOUND              "Pago no encontrado."  (no existe o no pertenece a :id)
// 409 PAYMENT_ALREADY_VOIDED "Este pago ya fue anulado."
// 403 FORBIDDEN
```

### Errores nuevos

| HTTP | `code` | Cuándo |
|---|---|---|
| 409 | `BOOKING_NOT_PAYABLE` | Registrar un pago sobre una reserva cancelada. |
| 409 | `PAYMENT_ALREADY_VOIDED` | Anular un pago ya anulado. |
| 409 | `PAYMENT_PROOF_NOT_PENDING` | Aprobar o rechazar un comprobante ya revisado. |

Se agregan a `ErrorCode` en `src/types/index.ts`.

### Query keys y mutaciones

Los pagos de un turno viajan embebidos en `adminBookingKeys.detail(id)`. El listado tiene su key propia:

| Key | Query |
|---|---|
| `adminPaymentKeys.list(filters)` = `['admin', 'payments', 'list', filters]` | `GET /admin/payments` (`usePaymentsLedger(filters)`, `staleTime` 30 s) |

| Mutación | Tras éxito |
|---|---|
| `useRegisterPayment(tz)` | `setQueryData(adminBookingKeys.detail(id), booking)`; invalida `adminBookingKeys.all`, `adminDashboardKeys.all`, `adminAgendaKeys.date(dateParamOf(startsAt, tz))`, `adminPaymentKeys.all`. |
| `useVoidPayment(tz)` | Ídem. |

Comprobantes: `paymentProofKeys.list(bookingId)` = `['admin', 'payment-proofs', bookingId]` (`usePaymentProofs`, `staleTime` 30 s); mutaciones `useApprovePaymentProof(bookingId)` / `useRejectPaymentProof(bookingId)` (invalidaciones en "Link de pago y comprobantes").

Feature: `src/features/admin-payments/{api.ts, hooks.ts, schemas.ts, components/}`.

## Criterios de aceptación

- [ ] En el detalle de un turno de $20.000 sin pagos: card "Pagos" muestra Total $20.000 · Pagado $0 · Saldo $20.000, badge "Sin pagar" y "Todavía no se registraron pagos."
- [ ] "Registrar pago" en un turno de Fútbol 5: N = 10 por defecto, "Usar una parte" carga $2.000; Enter registra; el diálogo queda abierto con Restante $18.000 y el foco en Monto; se encadenan 3 pagos alternando método; "Listo · 3 pagos" cierra. La card muestra los 3 con quién los registró.
- [ ] "Saldar restante" carga exactamente el saldo; tras registrarlo el badge pasa a "Pagado" y Saldo $0.
- [ ] Un pago más de $500 muestra el aviso de sobrepago antes de enviar y, tras enviarlo, "Saldo a favor $500".
- [ ] Anular un pago con motivo: queda tachado con "Anulado por … · motivo", los totales se recalculan. Anularlo de nuevo desde otra pestaña → toast "Este pago ya fue anulado." y refetch.
- [ ] En la agenda, la celda del turno muestra el punto ámbar/verde; el popover muestra "Pagado $X · Restante $Y" y "Registrar pago" abre el diálogo.
- [ ] En el listado, la columna "Pago" muestra el badge; una reserva cancelada sin pagos muestra "—".
- [ ] Un turno cancelado no muestra "Registrar pago"; un `POST` directo devuelve `409 BOOKING_NOT_PAYABLE`.
- [ ] El jugador (`GET /bookings/:id`) **no** ve `payment` ni `payments`.
- [ ] `/admin/payments` abre en hoy con totales en $0 y "No hay pagos registrados en este período". Tras registrar un pago desde una reserva, vuelve a Pagos y aparece la fila con hora, monto, método, turno (link), cliente y quién lo registró; los totales lo suman.
- [ ] "‹" / "›" cambian `?date=`; "Hoy" vuelve a hoy (URL sin `date`). Elegir dos días en el calendario pone `?from=&to=`, oculta `DayNav` y la columna Hora muestra la fecha.
- [ ] Filtrar "Transferencia" deja solo esas filas y `Efectivo` en $0. Buscar el nombre del cliente filtra las filas.
- [ ] Anular desde la fila: desaparece de la tabla y baja de los totales. Con "Mostrar anulados" aparece tachada con motivo y los totales no cambian.

## Fuera de alcance

- Arqueo / cierre de caja (declarar efectivo contado, diferencias) y exportar a CSV.
- Reembolsos / devoluciones (un turno cancelado con pagos solo se ve con `paidAmount > 0`).
- Editar un pago (se anula y se carga otro).
- Pago online, Mercado Pago, links de pago, señas con vencimiento.
- Asociar cada pago a un jugador con cuenta.
