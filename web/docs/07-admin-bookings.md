# 07 — Admin · Agenda, detalle de reserva y cancelación

## Objetivo

> Turno en curso (botones "Iniciar turno" / "Finalizar turno", cronómetro junto al estado y líneas "Iniciado el … por …" / "Finalizado el … por …" en la card Turno): ver [`13-turn-progress.md`](./13-turn-progress.md).

Ver el día del complejo como una agenda (canchas en columnas, horarios en filas), cargar un turno desde una celda libre, abrir el detalle de cualquier reserva y cancelarla sin la ventana que aplica al jugador.

## User stories

- Como admin quiero **ver todas las canchas de un día de un vistazo**, para saber qué horarios están libres u ocupados.
- Como admin quiero **crear un turno tocando una celda libre**, sin elegir cancha y horario a mano.
- Como admin quiero **buscar las reservas de un cliente** desde su ficha (`18-admin-customers.md`) para responderle cuando me pregunta "¿qué turnos tengo?".
- Como admin quiero **cancelar una reserva aunque falte poco** (el jugador me avisó por teléfono, llovió, se rompió una luz).
- Como admin quiero **dejar asentado el motivo** de la cancelación.
- Como admin quiero **saber quién cargó y quién canceló** cada reserva.

## Rutas / pantallas

| Ruta | Layout | Auth | Descripción |
|---|---|---|---|
| `/admin/agenda` | `(admin)` | `ADMIN` | Agenda del día; `?date=YYYY-MM-DD` (sin parámetro: hoy en el timezone del complejo). Es la pantalla de aterrizaje de `/admin` |
| `/admin/bookings/[id]` | `(admin)` | `ADMIN` | Detalle + cancelar |
| (sin ruta) | `Dialog` | `ADMIN` | `NewBookingDialog`, también abierto desde una celda libre |
| (sin ruta) | `AlertDialog` | `ADMIN` | `AdminCancelDialog` (compartido con el detalle) |

No hay listado de reservas: `/admin/bookings` ya no existe (solo `/admin/bookings/[id]`).

## UI

### `/admin/agenda` — Agenda

**Header**: `PageHeader` título "Agenda" y botón "Nueva reserva" (abre `NewBookingDialog` vacío, con el día de la agenda).

**Navegación de día** (`AgendaView`): botones "Día anterior" / "Hoy" / "Día siguiente", un `Input type="date"` y el día en texto largo ("sábado 13 de septiembre"). El día vive en `?date=`; "Hoy" lo quita de la URL.

**Grilla** (`AgendaGrid`): una columna por cancha **activa** (`useAdminCourts`) y una fila por horario. Las filas son la unión de los inicios de slot de todas las canchas (`slotStartsFor` de `lib/slot-starts.ts`, que respeta las canchas que cierran después de medianoche). Cada celda (`AgendaCell`) es una de:

| Celda | Cuándo | Comportamiento |
|---|---|---|
| Libre | la cancha tiene ese slot, sin reserva activa y todavía no empezó | botón "+" → abre `NewBookingDialog` con cancha, día y horario precargados |
| Ocupada | hay una reserva `CONFIRMED` o `PENDING` con ese `startsAt` | link a `/admin/bookings/[id]`; muestra el cliente (o "Sin cliente") y el estado: "Confirmada" (oscuro), "Pendiente" (ámbar), "Completada" (gris, derivado: `CONFIRMED` con `endsAt` pasado, mismo criterio que `isBookingCompleted`) |
| Cerrada | la cancha no tiene slot en esa fila (fuera de su horario) | celda atenuada, sin acción |
| Pasada | slot libre cuyo inicio ya pasó | celda atenuada, sin acción (la API rechaza turnos en el pasado) |

Las reservas `CANCELLED` no ocupan celda: el slot figura libre. En mobile la grilla scrollea horizontalmente con la columna de horarios fija (`sticky`). El reloj viene de `useNow`, no de un `new Date()` en render.

**Datos**: `GET /admin/bookings?from=<00:00 del día>&to=<fin del último slot>&order=asc&limit=200`, sin cambios en la API. `from`/`to` (y no `date`) cubren los slots de madrugada de una cancha que cierra después de medianoche. Si la respuesta trae `limit` reservas, se avisa debajo de la grilla.

### `/admin/bookings/[id]` — Detalle

- `Breadcrumb`: Agenda › {cancha} · {fecha}.
- Badge de estado grande; si cancelada, "Cancelada por el complejo" / "Cancelada por el jugador" + "el {cancelledAt}".
- Dos cards lado a lado (apiladas en mobile):
  - **Turno**: cancha (link a `/admin/courts/[id]`), fecha, horario, duración, precio, origen, "Cargada el {createdAt}" y, si `createdBy`, "por {createdBy.name}".
  - **Cliente**: nombre, teléfono (link `tel:`), email (link `mailto:`); si `customer.userId`, botón "Ver su ficha" → `/admin/customers/[id]`; si no, badge "Sin cuenta".
- **Nota**: card con la nota si existe.
- **Pagos**: card ancha con totales, historial y acciones (ver `12-admin-payments.md`). Badge de estado de pago junto al de estado de reserva.
- **Motivo de cancelación**: card si `cancellationReason`.
- Acciones: si `status === 'CONFIRMED'` y `endsAt > now` → botón `destructive` **"Cancelar reserva"** → `AdminCancelDialog`. Si `endsAt <= now`: texto "Este turno ya pasó." Si cancelada: nada.

### `AdminCancelDialog`

`AlertDialog` compartido por el detalle y otras pantallas del admin. Recibe `booking: AdminBooking`.

- Título: "¿Cancelar la reserva?"
- Descripción: "{cliente} · {cancha} · {fecha} · {horario}. El turno queda libre para otro cliente. Esta acción no se puede deshacer."
- Si falta menos de `cancellationWindowHours` para el turno: `Alert` informativo "Faltan menos de {N} h. El jugador no podría cancelarla por su cuenta; como administrador podés hacerlo igual."
- **Motivo** (opcional): `Textarea`, máx. 280. Placeholder "Ej.: el cliente avisó por teléfono".
- Botones: "Volver" / **"Sí, cancelar"** (`destructive`, `loading`).
- Tras cancelar: toast "Reserva cancelada", se invalidan `['admin', 'bookings']`, `['admin', 'agenda', date]` y `['admin', 'courts']` (por `futureBookingsCount`). `422 BOOKING_ALREADY_CANCELLED` → se refetchea y se muestra el estado actual sin error.

### Estados

| Pantalla | Loading | Empty | Error |
|---|---|---|---|
| Agenda | Skeleton de la grilla | "No hay canchas activas" | `Alert` + "Reintentar" |
| Detalle | Skeleton de las dos cards | — | 404 → "Reserva no encontrada" con link a `/admin/agenda` |
| Dialog | Botón con spinner | — | `Alert` inline con `message` |

## Reglas de negocio y validaciones

- El admin ve **todas** las reservas del complejo, de cualquier usuario y de clientes sin cuenta.
- Cancelación admin: **sin ventana de anticipación**. Solo se rechaza si ya está cancelada (`422 BOOKING_ALREADY_CANCELLED`) o si el turno ya terminó (`endsAt <= now` → `422 BOOKING_ALREADY_FINISHED`; ver contrato). Cancelar un turno que ya empezó pero no terminó está permitido (lluvia a mitad del partido).
- Cancelar libera el slot: la celda de la agenda y la grilla del jugador lo muestran `AVAILABLE`.
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
| Agenda del día | `?from=<00:00 local>&to=<fin del último slot>&order=asc&limit=200` |
| Badge de pendientes (sidebar) | `?status=PENDING&from=<now>&limit=200` |

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
| `['admin', 'bookings', 'list', filters]` | `GET /admin/bookings?…` (agenda, badge de pendientes) | 30 s |
| `['admin', 'bookings', id]` | `GET /admin/bookings/:id` | 30 s |

| Mutación | `onSuccess` invalida |
|---|---|
| `useAdminCancelBooking` | `['admin', 'bookings']` · `['admin', 'agenda', date]` · `['admin', 'courts']` |

## Criterios de aceptación

- [ ] `/admin` redirige a `/admin/agenda`; la sidebar muestra "Agenda" (con el badge de solicitudes pendientes) en lugar de "Reservas".
- [ ] La agenda muestra una columna por cancha activa y una fila por horario del día; cambiar de día con las flechas, "Hoy" o el selector actualiza `?date=`.
- [ ] Tocar una celda libre abre "Nueva reserva" con cancha, día y horario precargados; al confirmar, la celda pasa a ocupada.
- [ ] Tocar una celda ocupada abre `/admin/bookings/[id]`; el detalle vuelve a la agenda desde el breadcrumb.
- [ ] Una cancha que cierra después de medianoche muestra sus slots de madrugada en el día de apertura, con sus reservas.
- [ ] Una reserva `CONFIRMED` con menos de 24 h muestra el `Alert` informativo en el dialog y se cancela igual con `200`.
- [ ] Al cancelar con motivo, el detalle muestra "Cancelada por el complejo", la fecha y el motivo; la celda de la agenda queda libre.
- [ ] Una reserva ya cancelada no muestra el botón de cancelar; una que ya terminó muestra "Este turno ya pasó."
- [ ] El detalle de una reserva de cliente sin cuenta muestra el badge "Sin cuenta" y no tiene "Ver su ficha".
- [ ] En mobile la grilla scrollea horizontalmente con la columna de horarios fija.

## Fuera de alcance

- Exportar a CSV / Excel.
- Listado y buscador global de reservas (la búsqueda por cliente vive en su ficha) y paginación por cursor.
- Editar una reserva (cambiar cliente, precio o nota después de creada).
- Marcar asistencia / no-show (los pagos están en `12-admin-payments.md`).
- Notificar al jugador de la cancelación.
