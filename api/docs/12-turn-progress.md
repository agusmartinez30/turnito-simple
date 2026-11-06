# 12 — Admin · Turno en curso (`PATCH /admin/bookings/:id/start` · `/finish`)

## Objetivo

Que el admin **inicie manualmente un turno** cuando el cliente entra a la cancha y el panel muestre el tiempo transcurrido ([`web/docs/13-turn-progress.md`](../../web/docs/13-turn-progress.md)). La API solo guarda **cuándo y quién** lo inició y, si el admin lo finaliza a mano, cuándo y quién lo finalizó; el cronómetro y el "terminado" (pasado de tiempo) se calculan en la web.

## Decisiones

| Tema | Decisión |
|---|---|
| Persistencia | Cuatro columnas en `bookings`: `started_at` / `started_by_id` y `finished_at` / `finished_by_id` (`timestamptz` + FK a `users`, `ON DELETE SET NULL`). Sin estado nuevo en `BookingStatus`: un turno iniciado o finalizado sigue `CONFIRMED`. |
| Qué se puede iniciar | Solo `CONFIRMED`, **del día de hoy** (día local del complejo, `localDateInTz(startsAt) === todayInTz(now)`) y no iniciada. Sin restricción de hora: el cliente puede llegar antes o después del horario pactado. |
| Idempotencia | Una sola vez. Repetir → `422 BOOKING_ALREADY_STARTED`. El `updateMany` filtra `startedAt: null` para la carrera entre dos admins. |
| Fin del turno | Dos cosas distintas: **"terminado"** (pasado de tiempo) lo calcula la web cuando `now − startedAt ≥ endsAt − startsAt`, sin tocar la API; **"finalizado"** es manual (`PATCH .../finish`): guarda `finished_at` y la web congela el cronómetro. Solo sobre un turno iniciado, una vez; no hay reinicio. Cancelar un turno iniciado sigue las reglas de `cancel` (`endsAt > now`). |
| Serialización | `AdminBookingResponse` += `startedAt?` / `startedBy?` y `finishedAt?` / `finishedBy?` (`{ id, name }`, ISO con offset). `BOOKING_INCLUDE` carga `startedBy` y `finishedBy` (select `id, name`). El jugador no lo ve. |

## Endpoint

### `PATCH /admin/bookings/:id/start`

Auth: Bearer · rol `ADMIN`. Sin body.

| Respuesta | Cuándo |
|---|---|
| `200 { data: AdminBooking }` | Detalle (con `payments`) con `startedAt` y `startedBy`. |
| `404 NOT_FOUND` | "Reserva no encontrada." |
| `422 BOOKING_NOT_CONFIRMED` | "Solo se puede iniciar un turno confirmado." (PENDING o CANCELLED) |
| `422 BOOKING_ALREADY_STARTED` | "Ese turno ya fue iniciado." (también en la carrera `count === 0`) |
| `422 BOOKING_NOT_TODAY` | "Solo se puede iniciar un turno del día de hoy." |
| `403 FORBIDDEN` | rol `PLAYER`. |

### `PATCH /admin/bookings/:id/finish`

Auth: Bearer · rol `ADMIN`. Sin body.

| Respuesta | Cuándo |
|---|---|
| `200 { data: AdminBooking }` | Detalle con `finishedAt` y `finishedBy`. |
| `404 NOT_FOUND` | "Reserva no encontrada." |
| `422 BOOKING_NOT_STARTED` | "Ese turno todavía no fue iniciado." (sin `startedAt`, o no CONFIRMED) |
| `422 BOOKING_ALREADY_FINISHED` | "Ese turno ya terminó." (ya tenía `finishedAt`; también en la carrera `count === 0`) |

## Diseño interno

```
AdminBookingsService.start(adminId, id)
  → findOrThrow(id)
  → status !== CONFIRMED → 422 BOOKING_NOT_CONFIRMED
  → startedAt → 422 BOOKING_ALREADY_STARTED
  → localDateInTz(startsAt, tz) !== todayInTz(now, tz) → 422 BOOKING_NOT_TODAY
  → updateMany({ id, status: CONFIRMED, startedAt: null }, { startedAt: now, startedById: adminId }); count 0 → 422
  → findUniqueOrThrow(BOOKING_DETAIL_INCLUDE)

AdminBookingsService.finish(adminId, id)
  → findOrThrow(id)
  → status !== CONFIRMED || !startedAt → 422 BOOKING_NOT_STARTED
  → finishedAt → 422 BOOKING_ALREADY_FINISHED
  → updateMany({ id, status: CONFIRMED, startedAt: not null, finishedAt: null }, { finishedAt: now, finishedById: adminId }); count 0 → 422
  → findUniqueOrThrow(BOOKING_DETAIL_INCLUDE)
```

Migraciones `20260914160905_booking_started_at` y `20260914162601_booking_finished_at`.

## Tests

- `admin-bookings.service.spec` › `start`: OK setea `startedAt`/`startedById`; PENDING / CANCELLED → `BOOKING_NOT_CONFIRMED`; iniciada → `BOOKING_ALREADY_STARTED`; otro día (incl. una que termina hoy pero empezó ayer) → `BOOKING_NOT_TODAY`; `count === 0` → 422; inexistente → 404.
- `admin-bookings.service.spec` › `finish`: iniciada → setea `finishedAt`/`finishedById`; sin iniciar o cancelada → `BOOKING_NOT_STARTED`; ya finalizada → `BOOKING_ALREADY_FINISHED`; `count === 0` → 422; inexistente → 404.
- `admin-bookings.e2e-spec` › `PATCH /admin/bookings/:id/finish`: sin iniciar → 422 `BOOKING_NOT_STARTED`; tras `start` → 200 con `finishedAt` y `finishedBy.name = 'Admin Demo'`; repetir → 422 `BOOKING_ALREADY_FINISHED`; `ana` → 403.
- `admin-bookings.e2e-spec` › `PATCH /admin/bookings/:id/start`: 200 con `startedAt: '2026-09-12T15:00:00-03:00'` y `startedBy.name = 'Admin Demo'`; el detalle y `GET /admin/dashboard` lo traen; repetir → 422; mañana → `BOOKING_NOT_TODAY`; PENDING → `BOOKING_NOT_CONFIRMED`; `ana` → 403; inexistente → 404.

## Fuera de alcance

- Reiniciar un turno finalizado, tiempo extra facturable, historial de inicios.
