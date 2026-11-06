# 04 — Bookings: crear, listar, cancelar

> **Eliminado (docs/17-admin-customers.md).** El módulo `bookings` (flujo de jugador con cuenta) se borró junto con `bookings.user_id`: `POST /bookings`, `GET /bookings`, `GET /bookings/:id` y `PATCH /bookings/:id/cancel` ya no existen. Lo que sobrevive es `shared/bookings/booking-core.ts` —las garantías de concurrencia que describe este documento siguen vigentes y las usan la reserva manual, el turno fijo y el pedido público— y `GET /courts` / `GET /courts/:id/availability`. Este documento queda como registro histórico del MVP y como referencia del `BookingCore`.

## Objetivo

Implementar el núcleo del MVP: crear una reserva **sin posibilidad de doble reserva** bajo concurrencia, listar las del usuario y cancelarlas respetando la ventana de anticipación. Contraparte de [`web/docs/04-bookings.md`](../../web/docs/04-bookings.md).

## Endpoints

### `POST /bookings`

```ts
// Auth: Bearer
// Body (CreateBookingDto)
{ courtId: string; startsAt: string }   // UUID · ISO-8601 con offset

// 201
{ data: Booking }

// 400 VALIDATION_ERROR            courtId no UUID · startsAt no ISO · startsAt no es inicio de slot válido · fuera de rango de días
// 404 NOT_FOUND                   cancha inexistente o inactiva
// 409 SLOT_UNAVAILABLE            "Ese turno ya no está disponible."
// 409 USER_HAS_OVERLAPPING_BOOKING "Ya tenés una reserva en ese horario."
// 422 BOOKING_IN_PAST             "Ese turno ya pasó."
```

`Booking` en la respuesta embebe `court: { id, name, sport, isIndoor, imageUrl? }`.

### `GET /bookings`

```ts
// Auth: Bearer — solo reservas del usuario autenticado
// Query (ListBookingsDto), todos opcionales
{
  scope?: 'upcoming' | 'history';
  status?: BookingStatus;
  from?: string;      // ISO → filtra endsAt > from
  to?: string;        // ISO → filtra startsAt < to
  limit?: number;     // 1–100, default 50
}

// 200
{ data: Booking[] }

// 400 VALIDATION_ERROR
```

Semántica de `scope` (evaluada con `now` del servidor):

| scope | where | orderBy |
|---|---|---|
| `upcoming` | `status = CONFIRMED AND endsAt > now` | `startsAt asc` |
| `history` | `status = CANCELLED OR endsAt <= now` | `startsAt desc` |
| (ausente) | solo los filtros explícitos | `startsAt asc` |

`scope` y los filtros explícitos se combinan con `AND`. Los tres usos concretos de la web:

| Uso | Query |
|---|---|
| Home › próxima reserva | `?status=CONFIRMED&from=<now>&limit=1` |
| Mis reservas › Próximas | `?scope=upcoming` |
| Mis reservas › Historial | `?scope=history` |

### `GET /bookings/:id`

```ts
// Auth: Bearer
// 200
{ data: Booking }

// 400 VALIDATION_ERROR   id no UUID
// 403 FORBIDDEN          la reserva es de otro usuario. "No tenés acceso a esta reserva."
// 404 NOT_FOUND          "Reserva no encontrada."
```

Se devuelve `403` y no `404` para reservas ajenas porque la web trata ambos igual ("Reserva no encontrada") y el `403` es más útil en logs. No se filtra ningún dato de la reserva ajena en el body.

### `PATCH /bookings/:id/cancel`

```ts
// Auth: Bearer
// Sin body

// 200
{ data: Booking }   // status: CANCELLED, cancelledAt seteado

// 400 VALIDATION_ERROR
// 403 FORBIDDEN
// 404 NOT_FOUND
// 422 CANCELLATION_WINDOW_EXCEEDED  "Solo se puede cancelar hasta {N} horas antes del turno."
// 422 BOOKING_ALREADY_CANCELLED     "Esta reserva ya fue cancelada."
```

## DTOs

```ts
export class CreateBookingDto {
  @IsUUID()
  courtId!: string;

  @IsISO8601({ strict: true }, { message: 'startsAt debe ser una fecha ISO-8601' })
  startsAt!: string;
}

export class ListBookingsDto {
  @IsOptional() @IsIn(['upcoming', 'history'])
  scope?: 'upcoming' | 'history';

  @IsOptional() @IsEnum(BookingStatus)
  status?: BookingStatus;

  @IsOptional() @IsISO8601({ strict: true })
  from?: string;

  @IsOptional() @IsISO8601({ strict: true })
  to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number = 50;
}
```

## Reglas de negocio

### Crear reserva — `BookingsService.create(userId, dto)`

Orden exacto de validaciones (importa para que los errores sean predecibles):

1. **Cancha**: `courtsService.findActiveOrThrow(courtId)` → `404`.
2. **Parseo**: `startsAt = new Date(dto.startsAt)` (ya validado ISO). Convertir a UTC es implícito.
3. **Pasado**: `startsAt < clock.now()` → `422 BOOKING_IN_PAST`.
4. **Rango**: el día local de `startsAt` en `complex.timezone` debe estar en `[today, today + BOOKING_MAX_DAYS_AHEAD - 1]` → si no, `400 VALIDATION_ERROR` con `details: { startsAt: ['Solo se puede reservar hasta N días adelante'] }`.
5. **Slot válido**: `generateSlots({ date: localDate(startsAt), ...court })` debe contener un slot con `startsAt.getTime() === input.getTime()` → si no, `400 VALIDATION_ERROR` con `details: { startsAt: ['El horario no corresponde a un turno válido de esta cancha'] }`. Esto rechaza `18:15` en una cancha de slots de 90 min desde `08:00`, y también horarios fuera de `open/close`.
6. **`endsAt`** = el `endsAt` del slot encontrado. **`price`** = `court.pricePerSlot` (snapshot).
7. **Insert** dentro de `prisma.$transaction`:
   ```ts
   await tx.booking.create({ data: { courtId, userId, startsAt, endsAt, price, status: 'CONFIRMED' } });
   ```
   - Error `P2002` sobre `bookings_court_starts_at_confirmed_uidx` → `409 SLOT_UNAVAILABLE`.
   - Error de exclusión `bookings_user_no_overlap_excl` → `409 USER_HAS_OVERLAPPING_BOOKING`.
8. Releer con `include: { court: true }` y serializar.

**No se hace `SELECT` previo para chequear disponibilidad.** La constraint única es la fuente de verdad; un check previo solo agregaría una ventana de carrera y una query. Si en el futuro se quiere un mensaje más específico (ej. distinguir "bloqueado por admin"), se agrega el check *además* de la constraint, nunca en reemplazo.

### Detección de errores de constraint

```ts
// shared/prisma-errors.ts
export function isUniqueViolation(e: unknown, indexName: string): boolean;
export function isExclusionViolation(e: unknown, constraintName: string): boolean;
```

Prisma expone `P2002` con `meta.target` para uniques. Para la exclusion constraint, Prisma no tiene código dedicado: se inspecciona `e.code === 'P2004'` o el `message` crudo de Postgres buscando el nombre de la constraint. Estas dos funciones se testean unitariamente con errores reales capturados en e2e (fixtures), para que un cambio de versión de Prisma que altere el formato rompa un test y no producción.

### Cancelar — `BookingsService.cancel(userId, bookingId)`

1. `booking = findOrThrow(bookingId)` → `404`.
2. `booking.userId !== userId` → `403`.
3. `booking.status === 'CANCELLED'` → `422 BOOKING_ALREADY_CANCELLED`.
4. `differenceInHours(booking.startsAt, clock.now()) < complex.cancellationWindowHours` → `422 CANCELLATION_WINDOW_EXCEEDED`. La comparación usa `differenceInMilliseconds >= hours * 3_600_000` para no tener redondeos de `differenceInHours`.
5. `updateMany({ where: { id, status: 'CONFIRMED' }, data: { status: 'CANCELLED', cancelledAt: now } })`. Si `count === 0` (otra request canceló entre el paso 3 y este) → `422 BOOKING_ALREADY_CANCELLED`.
6. Releer y serializar.

Cancelar **no borra** la fila. El índice único parcial ignora `CANCELLED`, así que el slot queda liberado automáticamente.

### Listar — `BookingsService.list(userId, query)`

- Siempre `where.userId = userId`. No existe forma de listar reservas ajenas.
- `scope` se traduce a `where` + `orderBy` según la tabla de arriba, usando `clock.now()`.
- `from` → `endsAt > from`; `to` → `startsAt < to`. Se eligió `endsAt > from` (y no `startsAt >= from`) para que una reserva **en curso** siga apareciendo como "próxima" en el home.
- `include: { court: true }` en una sola query; sin N+1.

### Serialización de `Booking`

`toBookingResponse(booking, complex.timezone)`:

```ts
{
  id, courtId, userId, status, price,
  startsAt: toComplexIso(booking.startsAt),    // "2026-09-13T18:00:00-03:00"
  endsAt:   toComplexIso(booking.endsAt),
  createdAt: toComplexIso(booking.createdAt),
  cancelledAt?: toComplexIso(booking.cancelledAt),   // omitido si null
  court: { id, name, sport, isIndoor, imageUrl? },
}
```

## Diseño interno

```
BookingsController
  ├── create(@CurrentUser, dto)     → BookingsService.create
  ├── list(@CurrentUser, query)     → BookingsService.list
  ├── get(@CurrentUser, id)         → BookingsService.findOwnedOrThrow
  └── cancel(@CurrentUser, id)      → BookingsService.cancel

BookingsService
  ├── create(userId, dto): Promise<BookingWithCourt>
  ├── list(userId, query): Promise<BookingWithCourt[]>
  ├── findOwnedOrThrow(userId, id): Promise<BookingWithCourt>   // 404 / 403
  └── cancel(userId, id): Promise<BookingWithCourt>
        deps: PrismaService, CourtsService, ComplexService, Clock, ConfigService (BOOKING_MAX_DAYS_AHEAD)
```

`BookingsModule` importa `CourtsModule` (para `findActiveOrThrow` y `generateSlots` vía `shared/time`) y `ComplexModule`.

## Concurrencia — garantías

| Escenario | Resultado garantizado por |
|---|---|
| Dos usuarios crean reserva para el mismo `(courtId, startsAt)` en paralelo | Índice único parcial: exactamente uno recibe `201`, el otro `409 SLOT_UNAVAILABLE`. |
| Un usuario crea dos reservas solapadas en paralelo (doble click, dos pestañas) | Exclusion constraint: una `201`, otra `409 USER_HAS_OVERLAPPING_BOOKING`. |
| Cancelar y reservar el mismo slot al mismo tiempo | Si la cancelación commitea primero, el insert pasa. Si el insert va primero, falla con `409` y la cancelación pasa igual. Ningún orden deja dos `CONFIRMED`. |
| Dos requests de cancelación de la misma reserva | `updateMany` condicional: una `200`, otra `422 BOOKING_ALREADY_CANCELLED`. |
| Cancelar justo en el límite de la ventana | Se compara en ms con `clock.now()` del servidor; la web puede mostrar el botón habilitado y recibir `422` — la web ya lo maneja refetcheando. |

Nivel de aislamiento: `READ COMMITTED` (default de Postgres) es suficiente; las garantías vienen de constraints, no de aislamiento.

## Tests

### Unit (`bookings.service.spec.ts`, Prisma y Clock mockeados)

- [ ] `create` con `startsAt` en el pasado → `BOOKING_IN_PAST` **antes** de tocar la DB.
- [ ] `create` con `startsAt = 18:15` en cancha de 90 min desde 08:00 → `VALIDATION_ERROR` con `details.startsAt`.
- [ ] `create` con `startsAt` fuera de `open/close` → `VALIDATION_ERROR`.
- [ ] `create` con día = hoy + `BOOKING_MAX_DAYS_AHEAD` → `VALIDATION_ERROR`; hoy + `BOOKING_MAX_DAYS_AHEAD - 1` a la hora de cierre - duración → OK.
- [ ] `create` calcula `endsAt = startsAt + slotDurationMinutes` y `price = court.pricePerSlot`.
- [ ] `create` traduce `P2002` del índice de cancha a `SLOT_UNAVAILABLE` y la exclusión de usuario a `USER_HAS_OVERLAPPING_BOOKING`.
- [ ] `cancel` con `now = startsAt - 24h - 1ms` → OK; con `now = startsAt - 24h + 1ms` → `CANCELLATION_WINDOW_EXCEEDED` (`cancellationWindowHours = 24`).
- [ ] `cancel` con `updateMany.count === 0` → `BOOKING_ALREADY_CANCELLED`.
- [ ] `list` con `scope=upcoming` arma `where { userId, status: CONFIRMED, endsAt: { gt: now } }` y `orderBy startsAt asc`.
- [ ] `list` con `scope=history` arma `OR [{ status: CANCELLED }, { endsAt: { lte: now } }]` y `orderBy startsAt desc`.

### E2E (`test/e2e/bookings.e2e-spec.ts`)

Setup: `resetDatabase()`, login de `ana@demo.com` y `bruno@demo.com`, `court = Pádel 1`, `tomorrow18 = mañana 18:00 -03:00`.

- [ ] Ana `POST /bookings { court, tomorrow18 }` → `201`, `status: CONFIRMED`, `price: 12000`, `endsAt = 19:30`, `court.name = 'Pádel 1'`, todos los timestamps con `-03:00`.
- [ ] Bruno mismo slot → `409 SLOT_UNAVAILABLE`.
- [ ] Ana `POST` `tomorrow 19:30` misma cancha → `201` (adyacente no solapa). Ana `POST` `tomorrow 18:00` en **Pádel 2** → `409 USER_HAS_OVERLAPPING_BOOKING`.
- [ ] `POST` con `startsAt` = ayer → `422 BOOKING_IN_PAST`. Con `18:15` → `400`. Con cancha inactiva → `404`. Con `courtId: 'x'` → `400`.
- [ ] **Concurrencia real**: 10 requests en paralelo (`Promise.all`) de 10 usuarios distintos al mismo slot libre → exactamente un `201` y nueve `409`. Se repite 5 veces para reducir falsos verdes.
- [ ] `GET /bookings?scope=upcoming` de Ana → sus 2 reservas en orden asc. De Bruno → `[]`.
- [ ] `GET /bookings?status=CONFIRMED&from=<now>&limit=1` de Ana → solo la de 18:00.
- [ ] `GET /bookings/:id` de Ana por Bruno → `403`. UUID inexistente → `404`.
- [ ] Ana `PATCH /bookings/:id/cancel` → `200`, `status: CANCELLED`, `cancelledAt` presente. Repetir → `422 BOOKING_ALREADY_CANCELLED`.
- [ ] Tras cancelar, Bruno `POST` el mismo slot → `201` (slot liberado).
- [ ] `GET /bookings?scope=history` de Ana → incluye la cancelada; `scope=upcoming` no.
- [ ] Reserva para hoy dentro de 2 horas (si el horario de la cancha lo permite; si no, usar `Clock` fijo vía env de test) → `cancel` → `422 CANCELLATION_WINDOW_EXCEEDED`.
- [ ] Bruno `PATCH .../cancel` de una reserva de Ana → `403` y la reserva sigue `CONFIRMED`.

Para los tests que dependen de la hora, el `Clock` provider se sobreescribe en el módulo de test con un valor fijo (`2026-09-12T15:00:00-03:00`), y `tomorrow18` se calcula relativo a ese valor. Así los e2e son deterministas sin importar cuándo corren.

## Fuera de alcance (MVP)

- Estados `PENDING` (pago) y `NO_SHOW`.
- Reprogramar (`PATCH /bookings/:id` con nuevo `startsAt`).
- Cancelación por parte del complejo.
- Invitados / participantes de la reserva.
- Reservas recurrentes.
- Notificaciones al crear / cancelar.
- Listado de reservas por cancha para el admin (`GET /courts/:id/bookings`).
- Paginación por cursor en `GET /bookings`.
