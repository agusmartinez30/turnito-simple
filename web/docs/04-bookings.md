# 04 — Reservas: confirmar, ver y cancelar

> **Eliminado (docs/18-admin-customers.md).** El flujo de jugador con cuenta ya no existe: no hay registro de jugadores, no hay "Mis reservas" y la API dejó de exponer `/bookings`. Quien reserva es un **cliente sin cuenta** que el complejo administra desde `/admin/customers`; el pedido de turno vive en `10-public-request.md` y la gestión en `07-admin-bookings.md`. Este documento queda como registro histórico del MVP.

## Objetivo

Cerrar el flujo central del MVP: el jugador confirma el turno que eligió en la grilla, lo ve en "Mis reservas" y puede cancelarlo dentro de la ventana permitida.

## User stories

- Como jugador quiero **confirmar un turno** viendo cancha, fecha, hora, duración y precio antes de reservar, para no equivocarme.
- Como jugador quiero **ver la confirmación** de mi reserva apenas la creo.
- Como jugador quiero **ver mis reservas próximas** y **mi historial** en un solo lugar.
- Como jugador quiero **cancelar una reserva** si no voy a poder ir.
- Como jugador quiero **saber por qué no puedo cancelar** si ya pasó el plazo.
- Como jugador quiero que, si **alguien reservó el turno antes que yo**, me avise y me deje elegir otro.

## Rutas / pantallas

| Ruta | Layout | Auth | Descripción |
|---|---|---|---|
| (sin ruta) | Dialog sobre `/courts/[id]` | Protegida | `BookingConfirmDialog` |
| `/bookings` | `(app)` | Protegida | Mis reservas, tabs Próximas / Historial |
| `/bookings/[id]` | `(app)` | Protegida | Detalle + cancelar |

## Flujo de reserva (core del MVP)

```
/courts/[id]?date=2026-09-13
   │
   │  click en slot AVAILABLE
   ▼
BookingConfirmDialog (Dialog en desktop / Sheet bottom en mobile)
   │  muestra: cancha · fecha · hora · duración · precio
   │
   │  click "Confirmar reserva"
   ▼
POST /bookings { courtId, startsAt }
   │
   ├─ 201 ──► toast "¡Turno reservado!"
   │          invalidar ['courts', id, 'availability', date]
   │          invalidar ['bookings', *]
   │          router.push('/bookings/[newId]')
   │
   ├─ 409 SLOT_UNAVAILABLE ──► cerrar dialog
   │          invalidar availability (el slot pasa a BOOKED)
   │          toast destructivo "Ese turno acaba de ser reservado. Elegí otro."
   │
   ├─ 409 USER_HAS_OVERLAPPING_BOOKING ──► error dentro del dialog
   │          "Ya tenés una reserva en ese horario."
   │
   ├─ 422 BOOKING_IN_PAST ──► cerrar dialog, invalidar availability
   │          toast "Ese turno ya pasó."
   │
   └─ otro error ──► error dentro del dialog con message de la API
                     botón "Confirmar reserva" vuelve a habilitarse
```

## UI

### `BookingConfirmDialog`

Componente en `src/features/bookings/components/BookingConfirmDialog.tsx`. Recibe `court: Court` y `slot: TimeSlot`. Se renderiza como `Dialog` en `md+` y como `Sheet side="bottom"` en mobile (usar hook `useMediaQuery`).

- Título: "Confirmar reserva".
- Resumen en lista de dos columnas (`dl`):
  - **Cancha**: `{court.name}` + badge de deporte.
  - **Fecha**: "sábado 13 de septiembre".
  - **Horario**: "18:00 – 19:30".
  - **Duración**: "90 min".
  - **Precio**: "$ 12.000" (formateado con `Intl.NumberFormat('es-AR')`).
- Nota: "Se abona en el complejo. Podés cancelar hasta {cancellationWindowHours} h antes." (valor de `GET /complex`).
- Footer: botón secundario **"Volver"** (cierra) y primario **"Confirmar reserva"** (`loading` al enviar).
- Zona de error (`Alert variant="destructive"`) entre el resumen y el footer, visible solo si hubo error que no cierra el dialog.
- Mientras se envía: no se puede cerrar con Escape ni click afuera.

### `/bookings` — Mis reservas

- Título "Mis reservas".
- `Tabs`: **Próximas** (default) | **Historial**. El tab activo va en la URL: `?tab=upcoming` | `?tab=history`.
- Lista vertical de `BookingCard` (`src/features/bookings/components/BookingCard.tsx`):
  - Imagen pequeña de la cancha a la izquierda (mobile: arriba).
  - Nombre de la cancha + badge deporte.
  - Fecha y horario formateados.
  - Badge de estado: "Confirmada" (`default`) / "Cancelada" (`secondary`).
  - En Próximas: texto relativo ("Mañana", "En 3 días").
  - Toda la card es link a `/bookings/[id]`.
- Orden: Próximas por `startsAt` asc; Historial por `startsAt` desc.

### `/bookings/[id]` — Detalle

- Botón "← Mis reservas".
- Card con:
  - Imagen de la cancha (`aspect-video`).
  - Badge de estado grande arriba.
  - Nombre de la cancha + badge deporte + "Techada"/"Descubierta".
  - `dl` con Fecha, Horario, Duración, Precio, "Reservado el {createdAt}" y, si aplica, "Cancelado el {cancelledAt}".
  - Link "Ver cancha" → `/courts/[courtId]?date=<fecha de la reserva>`.
- Zona de acciones (solo si `status === 'CONFIRMED'`):
  - Si `canCancel` → botón `variant="destructive"` **"Cancelar reserva"**.
  - Si no → mismo botón `disabled` envuelto en `Tooltip`: "Solo se puede cancelar hasta {N} h antes del turno." Debajo, texto de ayuda: "Si necesitás cancelar, comunicate con el complejo."
- `AlertDialog` de confirmación al clickear cancelar:
  - Título: "¿Cancelar la reserva?"
  - Descripción: "{cancha} · {fecha} · {horario}. Esta acción no se puede deshacer."
  - Botones: "Volver" / **"Sí, cancelar"** (`destructive`, `loading`).
- Tras cancelar con éxito: toast "Reserva cancelada", la card se actualiza a "Cancelada" in place, se invalidan `['bookings', *]` y la availability de la cancha.

### Estados

| Pantalla | Loading | Empty | Error |
|---|---|---|---|
| Dialog | Botón con spinner | — | `Alert` inline |
| Próximas | 3 `BookingCard` skeleton | "No tenés turnos próximos" + botón "Reservar turno" → `/courts` | `Alert` + "Reintentar" |
| Historial | 3 skeleton | "Todavía no tenés reservas pasadas" | `Alert` + "Reintentar" |
| Detalle | Skeleton de la card | — | 404 / 403 → "Reserva no encontrada" con link a `/bookings` |

## Reglas de negocio y validaciones

### Crear reserva

- Solo se envía `courtId` y `startsAt`. `endsAt` y `price` los calcula la API a partir de la cancha (evita que el cliente mande valores manipulados).
- La reserva nace `CONFIRMED`. No hay estado `PENDING` en el MVP porque no hay pago.
- La API valida atómicamente que el slot siga libre (constraint único `(courtId, startsAt)` sobre reservas `CONFIRMED`, o lock equivalente). Dos jugadores clickeando el mismo slot: uno recibe `201`, el otro `409 SLOT_UNAVAILABLE`.
- Un usuario no puede tener dos reservas `CONFIRMED` cuyos intervalos `[startsAt, endsAt)` se solapen → `409 USER_HAS_OVERLAPPING_BOOKING`.
- `startsAt` debe coincidir exactamente con el inicio de un slot válido de esa cancha (según `openTime` + `slotDurationMinutes`). Cualquier otro valor → `400 VALIDATION_ERROR`.
- `startsAt < now` → `422 BOOKING_IN_PAST`.
- `startsAt` más allá del rango de reserva permitido (mismo `MAX_DAYS_AHEAD` de `03-courts.md`; la API tiene su propio valor configurado) → `400 VALIDATION_ERROR`.

### Cancelar

- `canCancel = booking.status === 'CONFIRMED' && differenceInHours(startsAt, now) >= complex.cancellationWindowHours`.
- La web calcula `canCancel` para la UI, **pero la API es la que decide**: si responde `422 CANCELLATION_WINDOW_EXCEEDED`, se muestra el `message` en un toast y se refetchea la reserva.
- Cancelar es idempotente desde la UI: si ya está cancelada (`422 BOOKING_ALREADY_CANCELLED`), se refetchea y se muestra el estado actual sin error visible.
- Una reserva cancelada **libera el slot**: la próxima consulta de availability lo devuelve como `AVAILABLE`.
- No se puede "des-cancelar". Si el jugador se arrepiente, reserva de nuevo.

### Clasificación Próximas / Historial

- **Próximas**: `status === 'CONFIRMED' && endsAt > now`.
- **Historial**: todo lo demás (`CANCELLED` de cualquier fecha, o `CONFIRMED` con `endsAt <= now`).
- La clasificación la hace la API vía query params; la web no filtra en cliente.

### Formato de fechas

Todo se muestra en `complex.timezone` con locale `es`. Helpers en `src/lib/date.ts`:

- `formatBookingDate(iso, tz)` → "sábado 13 de septiembre"
- `formatTimeRange(startIso, endIso, tz)` → "18:00 – 19:30"
- `formatRelativeDay(iso, tz)` → "Hoy" | "Mañana" | "En N días" | "Hace N días"

## Contrato API

### `POST /bookings`

```ts
// Auth: Bearer
// Request
{ courtId: string; startsAt: string }   // ISO-8601 con offset

// 201
{ data: Booking }

// Errores:
//   400 VALIDATION_ERROR            (startsAt no es inicio de slot válido, fuera de rango, courtId inválido)
//   404 NOT_FOUND                   (cancha inexistente o inactiva)
//   409 SLOT_UNAVAILABLE
//   409 USER_HAS_OVERLAPPING_BOOKING
//   422 BOOKING_IN_PAST
```

### `GET /bookings`

```ts
// Auth: Bearer — devuelve solo reservas del usuario autenticado
// Query (todos opcionales)
{
  scope?: 'upcoming' | 'history';   // aplica la clasificación descrita arriba
  status?: BookingStatus;
  from?: string;                    // ISO; filtra endsAt > from
  to?: string;                      // ISO; filtra startsAt < to
  limit?: number;                   // default 50, max 100
}

// 200
{ data: Booking[] }
// Orden: scope=upcoming o sin scope → startsAt asc · scope=history → startsAt desc
```

Usos concretos:

| Pantalla | Query |
|---|---|
| Home (próxima reserva) | `?status=CONFIRMED&from=<now>&limit=1` |
| Mis reservas › Próximas | `?scope=upcoming` |
| Mis reservas › Historial | `?scope=history` |

### `GET /bookings/:id`

```ts
// Auth: Bearer
// 200
{ data: Booking }

// Errores: 403 FORBIDDEN (de otro usuario) · 404 NOT_FOUND
```

### `PATCH /bookings/:id/cancel`

```ts
// Auth: Bearer
// Sin body

// 200
{ data: Booking }   // status: 'CANCELLED', cancelledAt seteado

// Errores:
//   403 FORBIDDEN
//   404 NOT_FOUND
//   422 CANCELLATION_WINDOW_EXCEEDED
//   422 BOOKING_ALREADY_CANCELLED
```

### Query keys y mutaciones

| Key | Endpoint | `staleTime` |
|---|---|---|
| `['bookings', 'next']` | `GET /bookings?status=CONFIRMED&from=…&limit=1` | 0 |
| `['bookings', 'list', 'upcoming']` | `GET /bookings?scope=upcoming` | 0 |
| `['bookings', 'list', 'history']` | `GET /bookings?scope=history` | 1 min |
| `['bookings', id]` | `GET /bookings/:id` | 30 s |

| Mutación | `onSuccess` invalida |
|---|---|
| `useCreateBooking` | `['bookings']` (prefijo completo) · `['courts', courtId, 'availability', date]` |
| `useCancelBooking` | `['bookings']` · `['courts', booking.courtId, 'availability', date]` |

## Criterios de aceptación E2E del MVP

Estos seis pasos, corridos en orden contra la API real, definen el **MVP terminado**:

1. [ ] **Registro → Home.** Un usuario nuevo se registra desde `/register` y llega a `/` logueado, con el empty state de "próxima reserva".
2. [ ] **Home → Canchas → Detalle.** Desde el home clickea el chip "Pádel", ve solo canchas de pádel en `/courts?sport=PADEL` y entra a una.
3. [ ] **Elegir turno.** Selecciona el día de mañana, ve la grilla con turnos, clickea uno `AVAILABLE` y se abre el diálogo con cancha, fecha, horario, duración y precio correctos.
4. [ ] **Confirmar.** Clickea "Confirmar reserva"; ve el toast, aterriza en `/bookings/[id]` con estado "Confirmada". La reserva aparece en `/bookings?tab=upcoming` y como "próxima reserva" en `/`.
5. [ ] **Slot ocupado.** Vuelve a `/courts/[id]?date=<mañana>`: el turno reservado figura como "Ocupado" y no es clickeable. Con un segundo usuario, intentar reservar ese mismo slot devuelve `409 SLOT_UNAVAILABLE` y la UI lo comunica sin romper.
6. [ ] **Cancelar.** Desde `/bookings/[id]` cancela (dentro de la ventana). La reserva pasa a "Cancelada", desaparece de Próximas, aparece en Historial, el home vuelve al empty state y el slot vuelve a `AVAILABLE` en la grilla.

### Criterios adicionales

- [ ] Una reserva con menos de `cancellationWindowHours` de anticipación muestra el botón deshabilitado con el tooltip explicativo.
- [ ] Un `409 USER_HAS_OVERLAPPING_BOOKING` se muestra dentro del diálogo sin cerrarlo.
- [ ] Recargar `/bookings?tab=history` mantiene el tab activo.
- [ ] Acceder a `/bookings/[id]` de otro usuario muestra "Reserva no encontrada" (no filtra datos).
- [ ] En mobile (< 768 px) el diálogo de confirmación se muestra como sheet inferior.

## Fuera de alcance (MVP)

- Pago online / seña / reembolsos.
- Estado `PENDING` o `NO_SHOW`.
- Reprogramar (mover) una reserva; se cancela y se crea otra.
- Invitar a otros jugadores a la reserva / compartir link.
- Recordatorios (email, WhatsApp, push).
- Reservas recurrentes pedidas por el jugador desde la app. (El turno fijo cargado por el complejo está en `15-recurring-bookings.md`.)
- Cancelación por parte del complejo con aviso al jugador.
- Agregar al calendario (`.ics`).
