# 07 — Admin · Reservas: listado, detalle y cancelación

## Objetivo

> Turno en curso (botones "Iniciar turno" / "Finalizar turno", cronómetro junto al estado y líneas "Iniciado el … por …" / "Finalizado el … por …" en la card Turno): ver [`13-turn-progress.md`](./13-turn-progress.md).

Buscar cualquier reserva del complejo (por día, cancha, estado o cliente), ver su detalle completo y cancelarla sin la ventana que aplica al jugador.

## User stories

- Como admin quiero **buscar las reservas de un cliente** por nombre, email o teléfono para responderle cuando me pregunta "¿qué turnos tengo?".
- Como admin quiero **ver todas las reservas de un día o de una cancha** en una lista, para contrastar con la agenda o con los cobros.
- Como admin quiero **cancelar una reserva aunque falte poco** (el jugador me avisó por teléfono, llovió, se rompió una luz).
- Como admin quiero **dejar asentado el motivo** de la cancelación.
- Como admin quiero **saber quién cargó y quién canceló** cada reserva.

## Rutas / pantallas

| Ruta | Layout | Auth | Descripción |
|---|---|---|---|
| `/admin/bookings` | `(admin)` | `ADMIN` | Listado con filtros en la URL: `?date`, `?courtId`, `?status`, `?q` |
| `/admin/bookings/[id]` | `(admin)` | `ADMIN` | Detalle + cancelar |
| (sin ruta) | `AlertDialog` | `ADMIN` | `AdminCancelDialog` (compartido con la agenda) |

## UI

### `/admin/bookings` — Listado

**Header**: `PageHeader` título "Reservas".

**Filtros** (`AdminBookingFilters`, fila con wrap; en mobile en un `Sheet` "Filtros" con contador de filtros activos):

- **Buscar**: `Input` con ícono lupa, placeholder "Nombre, email o teléfono", debounce 400 ms → `?q=`. Mínimo 2 caracteres; con 1 no se envía.
- **Fecha**: `Popover` + `Calendar` (un día) → `?date=`. Botón "×" para limpiar. Chips rápidos: "Hoy" / "Mañana".
- **Cancha**: `Select` con "Todas" + una opción por cancha (activas e inactivas, las inactivas con sufijo "(inactiva)") → `?courtId=`.
- **Estado**: `ToggleGroup` "Todas" / "Confirmadas" / "Canceladas" → `?status=`.
- "Limpiar filtros" visible si hay alguno.

Sin ningún filtro, el listado muestra las **próximas 100 reservas desde ahora** (`from=now`, orden asc). Con `?date=`, las de ese día. Con `?q=` y sin fecha, las más recientes del cliente (orden desc). La regla exacta está en [Contrato API](#get-adminbookings).

**Tabla** (`AdminBookingsTable`, `Table` de shadcn; en mobile se convierte en lista de cards con los mismos datos):

| Columna | Contenido |
|---|---|
| Cliente | avatar con iniciales (`firstName` + `lastName`); al lado el nombre y debajo el teléfono en `text-muted-foreground` |
| Deporte | badge con el deporte de la cancha |
| Cancha | nombre + badge "Fijo" si la reserva viene de un turno fijo (`15`) |
| Fecha | "sáb 13/09" |
| Hora | "18:00 – 19:30" |
| Precio | "$ 12.000" |
| Pago | `PaymentStatusBadge` (`12`); en canceladas solo si `paidAmount > 0`, si no "—" |
| Estado | badge "Confirmada" (`default`) / "Pendiente" (`warning`) / "Cancelada" (`secondary`); si `cancelledBy === 'ADMIN'`, tooltip "por el complejo" |
| Acciones | `DropdownMenu` (⋯): "Ver detalle", "Registrar pago" (si no está cancelada, `12`), "Cancelar" (solo `CONFIRMED` y `endsAt > now`) |

**"Completada"** es un estado derivado solo de presentación: el modelo no tiene `COMPLETED`, pero una reserva `CONFIRMED` cuyo `endsAt` ya pasó se muestra con badge "Completada" (`success`) en lugar de "Confirmada". El reloj viene del padre (`useNow`), no de un `new Date()` en render.

La columna **Origen** no está en el listado: el origen (Web / Mostrador / Web sin cuenta) se ve en el detalle.

Toda la fila es link a `/admin/bookings/[id]`. Si la respuesta trae exactamente `limit` filas, se muestra debajo: "Mostrando las primeras {limit}. Afiná los filtros para ver más."

### `/admin/bookings/[id]` — Detalle

- `Breadcrumb`: Reservas › {cancha} · {fecha}.
- Badge de estado grande; si cancelada, "Cancelada por el complejo" / "Cancelada por el jugador" + "el {cancelledAt}".
- Dos cards lado a lado (apiladas en mobile):
  - **Turno**: cancha (link a `/admin/courts/[id]`), fecha, horario, duración, precio, origen, "Cargada el {createdAt}" y, si `createdBy`, "por {createdBy.name}".
  - **Cliente**: nombre, teléfono (link `tel:`), email (link `mailto:`); si `customer.userId`, botón "Ver sus reservas" → `/admin/bookings?q={email}`; si no, badge "Sin cuenta".
- **Nota**: card con la nota si existe.
- **Pagos**: card ancha con totales, historial y acciones (ver `12-admin-payments.md`). Badge de estado de pago junto al de estado de reserva.
- **Motivo de cancelación**: card si `cancellationReason`.
- Acciones: si `status === 'CONFIRMED'` y `endsAt > now` → botón `destructive` **"Cancelar reserva"** → `AdminCancelDialog`. Si `endsAt <= now`: texto "Este turno ya pasó." Si cancelada: nada.

### `AdminCancelDialog`

`AlertDialog` compartido por agenda, listado y detalle. Recibe `booking: AdminBooking`.

- Título: "¿Cancelar la reserva?"
- Descripción: "{cliente} · {cancha} · {fecha} · {horario}. El turno queda libre para otro cliente. Esta acción no se puede deshacer."
- Si falta menos de `cancellationWindowHours` para el turno: `Alert` informativo "Faltan menos de {N} h. El jugador no podría cancelarla por su cuenta; como administrador podés hacerlo igual."
- **Motivo** (opcional): `Textarea`, máx. 280. Placeholder "Ej.: el cliente avisó por teléfono".
- Botones: "Volver" / **"Sí, cancelar"** (`destructive`, `loading`).
- Tras cancelar: toast "Reserva cancelada", se invalidan `['admin', 'bookings']`, `['admin', 'agenda', date]` y `['admin', 'courts']` (por `futureBookingsCount`). `422 BOOKING_ALREADY_CANCELLED` → se refetchea y se muestra el estado actual sin error.

### Estados

| Pantalla | Loading | Empty | Error |
|---|---|---|---|
| Listado | 8 filas skeleton | "No hay reservas para estos filtros" + "Limpiar filtros" | `Alert` + "Reintentar" |
| Detalle | Skeleton de las dos cards | — | 404 → "Reserva no encontrada" con link a `/admin/bookings` |
| Dialog | Botón con spinner | — | `Alert` inline con `message` |

## Reglas de negocio y validaciones

- El admin ve **todas** las reservas del complejo, de cualquier usuario y de clientes sin cuenta.
- Cancelación admin: **sin ventana de anticipación**. Solo se rechaza si ya está cancelada (`422 BOOKING_ALREADY_CANCELLED`) o si el turno ya terminó (`endsAt <= now` → `422 BOOKING_ALREADY_FINISHED`; ver contrato). Cancelar un turno que ya empezó pero no terminó está permitido (lluvia a mitad del partido).
- Cancelar libera el slot: la agenda y la grilla del jugador lo muestran `AVAILABLE`.
- El motivo es interno: el jugador ve **que** la canceló el complejo y el motivo si existe (decisión: mostrarlo, para que la cancelación no parezca arbitraria). Si el admin no quiere que el jugador lo vea, no lo escribe.
- `cancelledBy` lo determina la API según el endpoint usado (`PATCH /bookings/:id/cancel` → `PLAYER`; `PATCH /admin/bookings/:id/cancel` → `ADMIN`), aunque el mismo usuario tenga ambos roles.

### Formato de fechas

Mismos helpers de `src/lib/date.ts`; se agrega `formatShortDate(iso, tz)` → "sáb 13/09".

## Contrato API

### `GET /admin/bookings`

```ts
// Auth: Bearer · rol ADMIN
// Query (todos opcionales)
{
  date?: string;        // YYYY-MM-DD, día local del complejo → reservas con startsAt dentro del día
  from?: string;        // ISO → endsAt > from   (ignorado si hay date)
  to?: string;          // ISO → startsAt < to   (ignorado si hay date)
  courtId?: string;     // UUID
  status?: BookingStatus;
  q?: string;           // >= 2 chars; busca en customer.name / email / phone (contiene, case-insensitive)
  order?: 'asc' | 'desc';   // por startsAt · default: 'asc' si hay date o from; 'desc' si no
  limit?: number;       // default 100, max 200
}

// 200
{ data: AdminBooking[] }

// 400 VALIDATION_ERROR · 403 FORBIDDEN
```

Usos concretos:

| Pantalla / filtro | Query |
|---|---|
| Listado sin filtros | `?from=<now>&order=asc` |
| `?date=` | `?date=2026-09-13` |
| `?q=` sin fecha | `?q=ana&order=desc` |
| Detalle de cliente › "Ver sus reservas" | `?q=<email>&order=desc` |

### `GET /admin/bookings/:id`

```ts
// 200
{ data: AdminBooking }   // incluye `payments[]` (12)
// 404 NOT_FOUND · 403 FORBIDDEN
```

### `PATCH /admin/bookings/:id/cancel`

```ts
// Auth: Bearer · rol ADMIN
// Request (opcional)
{ reason?: string }     // <= 280 chars

// 200
{ data: AdminBooking }  // status CANCELLED, cancelledAt, cancelledBy: 'ADMIN', cancellationReason

// 404 NOT_FOUND
// 422 BOOKING_ALREADY_CANCELLED
// 422 BOOKING_ALREADY_FINISHED   "Ese turno ya terminó."
```

`BOOKING_ALREADY_FINISHED` es un código nuevo (422); se agrega a `ErrorCode` y a la tabla de errores de [`05-admin-overview.md`](./05-admin-overview.md#errores-nuevos).

### Query keys y mutaciones

| Key | Endpoint | `staleTime` |
|---|---|---|
| `['admin', 'bookings', 'list', filters]` | `GET /admin/bookings?…` | 30 s |
| `['admin', 'bookings', id]` | `GET /admin/bookings/:id` | 30 s |

| Mutación | `onSuccess` invalida |
|---|---|
| `useAdminCancelBooking` | `['admin', 'bookings']` · `['admin', 'agenda', date]` · `['admin', 'courts']` |

## Criterios de aceptación

- [ ] `/admin/bookings` sin filtros lista las próximas reservas de todos los usuarios ordenadas por fecha asc, con cliente, cancha, origen, precio y estado.
- [ ] Escribir "ana" en el buscador lista solo las reservas de Ana (con cuenta) y las de clientes sin cuenta cuyo nombre contenga "ana"; la URL refleja `?q=ana`.
- [ ] Filtrar por fecha y cancha combinado devuelve solo las de esa cancha ese día; recargar mantiene los filtros.
- [ ] Una reserva `CONFIRMED` con menos de 24 h muestra el `Alert` informativo en el dialog y se cancela igual con `200`.
- [ ] Al cancelar con motivo, el detalle muestra "Cancelada por el complejo", la fecha y el motivo; la agenda del día muestra el slot libre.
- [ ] Una reserva ya cancelada no muestra el botón de cancelar; una que ya terminó muestra "Este turno ya pasó."
- [ ] El detalle de una reserva de cliente sin cuenta muestra el badge "Sin cuenta" y no tiene "Ver sus reservas".
- [ ] En mobile el listado se ve como cards y los filtros en un `Sheet`.

## Fuera de alcance

- Exportar a CSV / Excel.
- Paginación por cursor (solo `limit` + "afiná los filtros").
- Editar una reserva (cambiar cliente, precio o nota después de creada).
- Marcar asistencia / no-show (los pagos están en `12-admin-payments.md`).
- Notificar al jugador de la cancelación.
