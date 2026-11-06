# 03 — Complex y Courts: catálogo y disponibilidad

## Objetivo

Exponer el complejo, el catálogo de canchas y, sobre todo, la **grilla de turnos de un día** con su estado real. Contraparte de [`web/docs/03-courts.md`](../../web/docs/03-courts.md) y de la sección de canchas de [`web/docs/02-home.md`](../../web/docs/02-home.md).

## Endpoints

> **Multi-complejo (docs/15-multi-complex.md):** `GET /complex` es `@Roles(ADMIN)` y devuelve el complejo del admin (con `slug`); un jugador recibe `403`. `GET /courts` exige `?complexId=` para jugadores (un admin puede omitirlo). `ComplexService.getCurrent()` no existe más: el complejo se resuelve por `complexId` (`findByIdOrThrow`) o, en rutas de jugador, a partir de la cancha.

### `GET /complex`

```ts
// Auth: Bearer
// 200
{ data: Complex }   // { id, name, address, timezone, cancellationWindowHours }
```

Devuelve el único registro de `complexes`. Si no existe (DB sin seed) → `500 INTERNAL_ERROR` con log explícito "No complex configured. Run prisma db seed."

### `GET /courts`

```ts
// Auth: Bearer
// Query (ListCourtsDto)
{ sport?: Sport; indoor?: boolean }

// 200
{ data: Court[] }

// 400 VALIDATION_ERROR   (sport fuera del enum, indoor distinto de 'true'/'false')
```

- Filtra siempre `isActive: true`.
- Orden: `sortOrder asc, name asc`.
- `indoor=true` → `isIndoor: true`; `indoor=false` → `isIndoor: false`; ausente → sin filtro.

### `GET /courts/:id`

```ts
// Auth: Bearer
// 200
{ data: Court }

// 400 VALIDATION_ERROR   (id no es UUID)
// 404 NOT_FOUND          (inexistente o isActive: false) "Cancha no encontrada."
```

### `GET /courts/:id/availability`

```ts
// Auth: Bearer
// Query (AvailabilityQueryDto)
{ date: string }   // YYYY-MM-DD, requerido

// 200
{
  data: {
    date: string;       // eco
    timezone: string;   // complex.timezone
    slots: TimeSlot[];  // { startsAt, endsAt, status }, orden startsAt asc
  }
}

// 400 VALIDATION_ERROR   (formato inválido, fecha inexistente como 2026-02-30, fuera de rango)
// 404 NOT_FOUND
```

Rango válido de `date`: `[today, today + BOOKING_MAX_DAYS_AHEAD - 1]`, donde `today` es el día actual **en el timezone del complejo**. Mensaje fuera de rango: "Solo se puede consultar disponibilidad hasta {N} días adelante."

## DTOs

```ts
export class ListCourtsDto {
  @IsOptional() @IsEnum(Sport)
  sport?: Sport;

  @IsOptional() @IsBooleanString()
  @Transform(({ value }) => (value === undefined ? undefined : value === 'true'))
  indoor?: boolean;
}

export class AvailabilityQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  date!: string;
}
```

La validación de "fecha real" (no `2026-02-30`) y de rango se hace en el service con `parse` + `isValid` de `date-fns`, porque necesita `complex.timezone` y `now`.

## Reglas de negocio

### Serialización de `Court`

`toCourtResponse(court)` devuelve exactamente los campos del contrato: `id, complexId, name, sport, surface?, isIndoor, slotDurationMinutes, openTime, closeTime, pricePerSlot, isActive, imageUrl?`. Omite `sortOrder`, `createdAt`, `updatedAt`. Los opcionales `null` en DB se omiten (no se mandan como `null`).

### Generación de slots (`AvailabilityService`)

Función pura en `src/shared/time/slots.ts`:

```ts
export interface SlotInput {
  date: string;              // YYYY-MM-DD
  timezone: string;
  openTime: string;          // HH:mm
  closeTime: string;         // HH:mm; menor que openTime = cierra al día siguiente
  slotDurationMinutes: number;
}

/** Devuelve los intervalos [start, end) en UTC de todos los slots completos del día de agenda. */
export function generateSlots(input: SlotInput): Array<{ startsAt: Date; endsAt: Date }>;
/** true si closeTime < openTime. */
export function closesNextDay(court: { openTime; closeTime }): boolean;
/** Día de agenda (YYYY-MM-DD) cuya grilla contiene el instante. */
export function businessDateOf(startsAt: Date, court: { openTime; closeTime }, timezone: string): string;
```

Algoritmo:

1. `open = fromZonedTime(\`${date}T${openTime}:00\`, timezone)`; `closeDate = closesNextDay ? date + 1 día : date`; `close = fromZonedTime(\`${closeDate}T${closeTime}:00\`, timezone)`.
2. `cursor = open`. Mientras `addMinutes(cursor, slotDurationMinutes) <= close`: emitir `{ startsAt: cursor, endsAt: cursor + duration }`; `cursor = endsAt`.
3. Si `open >= close` (solo con `openTime === closeTime`) → lista vacía.

#### Día de agenda (canchas que cierran después de medianoche)

`closeTime < openTime` significa que la cancha cierra **al día siguiente** (ej. `20:00`–`01:00`). Como `closeTime < openTime`, el tramo de madrugada nunca se superpone con la apertura del día siguiente.

Un turno pertenece al **día de agenda** cuya grilla lo contiene: el de 00:00 del sábado en esa cancha es de la grilla del **viernes**. Consecuencias:

- `GET /courts/:id/availability?date=viernes`, `GET /admin/agenda?date=viernes` y la disponibilidad pública del viernes lo incluyen al final; la del sábado arranca a las 20:00 y no lo repite.
- `assertSlotBookable` (jugador, admin, público, turnos fijos) resuelve la grilla con `businessDateOf(startsAt, court, tz)`: el 00:00 del sábado se valida contra el viernes, y para `BOOKING_MAX_DAYS_AHEAD` cuenta como viernes (el 00:00 del día posterior al último permitido entra).
- `RecurringMaterializerService.gapReason` idem. La serie guarda `weekday`/`startTime` del instante real (sábado `00:00`).
- Dashboard, `GET /admin/bookings?date=`, caja de pagos y "Iniciar turno" (`BOOKING_NOT_TODAY`) siguen por **día calendario**: el turno de 00:00 figura bajo sábado.

Usar `fromZonedTime` por cada slot **no** es necesario: los slots son aritmética sobre `open` en UTC. La única conversión local→UTC es en `open` y `close`. Esto hace que un cambio de horario (DST) en el medio del día produzca slots de duración fija en UTC, que es lo esperado para "turnos de 90 minutos". Argentina no tiene DST; se documenta igual.

### Asignación de estado

`AvailabilityService.getAvailability(courtId, date, now)`:

1. `court = courtsService.findActiveOrThrow(courtId)`; `complex = complexService.getCurrent()`.
2. Validar `date` (real y en rango contra `now` en `complex.timezone`).
3. `slots = generateSlots({...})`.
4. Si `slots` está vacío → devolver `[]`.
5. Una sola query: `bookings.findMany({ where: { courtId, status: 'CONFIRMED', startsAt: { gte: slots[0].startsAt, lt: slots.at(-1).endsAt } }, select: { startsAt: true } })` → `Set<number>` de `startsAt.getTime()`.
6. Para cada slot, en este orden de precedencia:
   - `PAST` si `slot.startsAt < now`
   - `BOOKED` si `bookedStarts.has(slot.startsAt.getTime())`
   - `BLOCKED` — nunca en MVP (no hay tabla de bloqueos); queda el branch documentado.
   - `AVAILABLE`
7. Serializar con offset del complejo.

`PAST` gana sobre `BOOKED` a propósito: un turno pasado no interesa si estaba ocupado.

### Definición de "hoy"

`todayInTz(now, timezone) = formatInTimeZone(now, timezone, 'yyyy-MM-dd')`. Se usa para el rango de `date` acá y para el rango de `startsAt` en `POST /bookings`. Nunca `new Date().toISOString().slice(0, 10)`.

## Diseño interno

```
ComplexController
  └── get() → ComplexService.getCurrent() → toComplexResponse

ComplexService
  └── getCurrent(): Promise<Complex>     // findFirst; cache en memoria por proceso (invalidable, pero en MVP no cambia)

CourtsController
  ├── list(query)              → CourtsService.list
  ├── get(id)                  → CourtsService.findActiveOrThrow
  └── availability(id, query)  → AvailabilityService.getAvailability

CourtsService
  ├── list({ sport?, indoor? })
  └── findActiveOrThrow(id)    // AppException(NOT_FOUND) si no existe o !isActive

AvailabilityService
  └── getAvailability(courtId, date): Promise<{ date, timezone, slots }>
        usa Clock.now(), generateSlots(), BookingsRepository (o PrismaService directo)

shared/time/
  ├── slots.ts        generateSlots
  ├── tz.ts           todayInTz, toComplexIso, localTimeToUtc
  └── clock.ts        Clock provider { now(): Date }
```

`ComplexService` se exporta desde `ComplexModule` y lo importan `CourtsModule` y `BookingsModule`; ambos necesitan `timezone` y `cancellationWindowHours`.

## Tests

### Unit (`shared/time/slots.spec.ts`)

- [ ] `08:00–23:00`, 90 min → 10 slots; el último es `21:30–23:00`.
- [ ] `18:00–22:00`, 90 min → 2 slots (`18:00`, `19:30`); `21:00–22:30` se descarta.
- [ ] `10:00–23:00`, 60 min → 13 slots.
- [ ] `openTime === closeTime` → `[]`. `openTime > closeTime` → `[]`.
- [ ] Los `startsAt` devueltos, formateados en `America/Argentina/Buenos_Aires`, coinciden con `openTime + k·duration` (verifica la conversión local→UTC).
- [ ] Con timezone `America/New_York` en un día de cambio DST, la cantidad de slots y su duración en ms se mantienen fijas (documenta el comportamiento elegido).

### Unit (`availability.service.spec.ts`, con `Clock` y Prisma mockeados)

- [ ] Slot con `startsAt < now` → `PAST` aunque tenga reserva.
- [ ] Slot con reserva `CONFIRMED` → `BOOKED`; con reserva `CANCELLED` → `AVAILABLE`.
- [ ] `date` = ayer → `VALIDATION_ERROR`. `date` = hoy + `BOOKING_MAX_DAYS_AHEAD` → `VALIDATION_ERROR`. `date` = hoy + `BOOKING_MAX_DAYS_AHEAD - 1` → OK.
- [ ] `date = '2026-02-30'` → `VALIDATION_ERROR`.
- [ ] Reservas de **otra cancha** en el mismo horario no afectan el resultado.

### E2E (`test/e2e/courts.e2e-spec.ts`)

- [ ] `GET /complex` → `200` con `timezone` y `cancellationWindowHours` del seed.
- [ ] `GET /courts` → 7 canchas (no incluye "Cancha vieja"), ordenadas por `sortOrder`.
- [ ] `GET /courts?sport=PADEL` → 3. `?sport=PADEL&indoor=true` → 2. `?indoor=false` → 4.
- [ ] `GET /courts?sport=HOCKEY` → `400`. `?indoor=maybe` → `400`.
- [ ] `GET /courts/:id` de "Cancha vieja" → `404`. De un UUID inexistente → `404`. De `abc` → `400`.
- [ ] `GET /courts/:id/availability?date=<hoy>` → `200`, `slots.length` correcto, los slots anteriores a la hora actual son `PAST`.
- [ ] Crear una reserva por API para mañana 18:00 → `availability?date=<mañana>` marca ese slot `BOOKED` y el resto `AVAILABLE`.
- [ ] Cancelar esa reserva → el slot vuelve a `AVAILABLE`.
- [ ] `availability` sin `date` → `400`. Con `date=2026-1-5` → `400`.
- [ ] Todos los `startsAt`/`endsAt` de la respuesta terminan en `-03:00` (offset del complejo del seed), nunca en `Z`.

## Fuera de alcance (MVP)

- Bloqueos administrativos (`BLOCKED` real).
- Horarios distintos por día de la semana / feriados.
- Disponibilidad agregada de todas las canchas para un horario (`GET /availability?date=&time=`).
- Cache HTTP (`ETag`) en `GET /courts`.
