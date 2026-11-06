# 07 — Admin · Canchas

## Objetivo

CRUD de canchas (sin borrado) para el administrador, con las reglas que protegen las reservas existentes. Contraparte de [`web/docs/08-admin-courts.md`](../../web/docs/08-admin-courts.md).

## Endpoints

Todos: `Auth: Bearer` + `@Roles('ADMIN')`.

### `GET /admin/courts`

```ts
// 200
{ data: AdminCourt[] }   // activas e inactivas · orden sortOrder asc, name asc
// AdminCourt = Court + { sortOrder, createdAt, updatedAt, futureBookingsCount }
```

### `GET /admin/courts/:id`

```ts
// 200
{ data: AdminCourt }
// 400 (no UUID) · 404 NOT_FOUND "Cancha no encontrada." (solo si no existe; inactiva se devuelve)
```

### `POST /admin/courts`

```ts
// Body (CreateCourtDto)
{
  name: string;                 // trim, 2–40
  sport: Sport;
  surface?: string;             // trim, <= 40
  isIndoor: boolean;
  imageUrl?: string;            // URL http(s), <= 500
  sortOrder?: number;           // entero >= 0 · default max(sortOrder de activas e inactivas) + 1
  openTime: string;             // HH:mm
  closeTime: string;            // HH:mm
  slotDurationMinutes: number;  // entero 15–240
  pricePerSlot: number;         // entero >= 0
  isActive?: boolean;           // default true
}

// 201
{ data: AdminCourt }

// 400 VALIDATION_ERROR
//     details.closeTime: ['Debe ser posterior a la hora de apertura']
//     details.slotDurationMinutes: ['No entra ningún turno completo en ese horario']
// 409 COURT_NAME_ALREADY_EXISTS
```

### `PATCH /admin/courts/:id`

```ts
// Body (UpdateCourtDto): cualquier subconjunto de CreateCourtDto. `surface` e `imageUrl` aceptan null.
// 200
{ data: AdminCourt }

// 400 VALIDATION_ERROR   (incluye body vacío: details._: ['No hay cambios'])
// 404 NOT_FOUND
// 409 COURT_NAME_ALREADY_EXISTS
// 409 COURT_HAS_FUTURE_BOOKINGS
```

## DTOs

```ts
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateCourtDto {
  @IsString() @Length(2, 40) @Transform(trim) name!: string;
  @IsEnum(Sport) sport!: Sport;
  @IsOptional() @IsString() @MaxLength(40) @Transform(trimOrUndefined) surface?: string;
  @IsBoolean() isIndoor!: boolean;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(500) imageUrl?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @Matches(HHMM, { message: 'Formato HH:mm' }) openTime!: string;
  @Matches(HHMM, { message: 'Formato HH:mm' }) closeTime!: string;
  @IsInt() @Min(15) @Max(240) slotDurationMinutes!: number;
  @IsInt() @Min(0) pricePerSlot!: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// PartialType de @nestjs/swagger (mantiene los validadores) + null permitido en surface / imageUrl
export class UpdateCourtDto extends PartialType(CreateCourtDto) {
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(40) surface?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUrl(...) imageUrl?: string | null;
}
```

Las validaciones cruzadas (`openTime < closeTime`, "entra al menos un turno") se hacen en el service porque en `PATCH` dependen del valor actual de los campos que no vienen en el body.

## Reglas de negocio

### `AdminCourtsService`

```
list()                     → findMany (todas) + futureBookingsCount por cancha (una query agrupada)
findOrThrow(id)            → 404 si no existe (inactiva OK)
create(dto)                → validar horario → sortOrder default → insert (P2002 [complex_id, name] → COURT_NAME_ALREADY_EXISTS)
update(id, dto)            → merge con el actual → validar horario → chequear reservas futuras → update
```

### Validación de horario (`assertScheduleValid(openTime, closeTime, slotDurationMinutes)`)

- `openTime !== closeTime` → si son iguales, `VALIDATION_ERROR` `details.closeTime: ['Debe ser distinta de la hora de apertura']`. `closeTime < openTime` es válido y significa que cierra al día siguiente (turnos trasnoche, ver `03-courts.md` › Día de agenda).
- `generateSlots({ date: '2000-01-03', timezone: complex.timezone, ... }).length >= 1` (un día cualquiera sin DST) → si no, `details.slotDurationMinutes`.

### `futureBookingsCount`

`count({ where: { courtId, status: 'CONFIRMED', startsAt: { gte: clock.now() } } })`. En `list()` se resuelve con un `groupBy(['courtId'])` + `_count` en una sola query y se mapea; canchas sin reservas → `0`.

### Reglas al editar (`update`)

Sea `current` la cancha en DB y `next = { ...current, ...dto }`:

1. Body sin ninguna propiedad → `400 VALIDATION_ERROR` `details._: ['No hay cambios']`.
2. Si cambia `name` → unique `[complexId, name]` decide; `P2002` → `409 COURT_NAME_ALREADY_EXISTS`.
3. Si cambia alguno de `openTime`, `closeTime`, `slotDurationMinutes` **o** `isActive` pasa de `true` a `false`:
   - `n = futureBookingsCount(id)`; si `n > 0` → `409 COURT_HAS_FUTURE_BOOKINGS` con `message` "La cancha tiene {n} reservas futuras. Cancelalas antes de cambiar el horario, la duración o desactivarla." y `details: { futureBookings: [String(n)] }`.
   - Se compara contra el valor actual: mandar `openTime` igual al que ya tiene **no** dispara el chequeo.
4. `assertScheduleValid` sobre `next`.
5. `pricePerSlot`, `surface`, `imageUrl`, `sortOrder`, `isIndoor`, `sport`, `isActive: true` se cambian libremente.
6. `update` y releer con `futureBookingsCount`.

Por qué no se permite cambiar la grilla con reservas futuras: una reserva cuyo `startsAt` ya no coincide con ningún slot no aparecería en la agenda ni en `availability` (que marcan `BOOKED` por igualdad de `startsAt`), y el índice único no impediría una reserva nueva que se solape en tiempo. La restricción es más simple y más segura que migrar reservas.

Cambiar `sport` con reservas futuras se permite (no afecta la grilla ni el precio snapshot).

### Efectos sobre el resto del sistema

- `GET /courts` (jugador) sigue filtrando `isActive`; una cancha nueva aparece en la siguiente consulta.
- `ComplexService` no interviene; `CourtsService.findActiveOrThrow` no se cachea, así que desactivar tiene efecto inmediato en `POST /bookings` y `availability`.
- `AgendaService` lista `isActive: true`; una cancha desactivada desaparece de la agenda de días futuros y presentes. Sus reservas pasadas siguen en `GET /admin/bookings` (no filtra por `isActive`).

### Serialización

```ts
toAdminCourtResponse(court, futureBookingsCount) = {
  ...toCourtResponse(court),          // omite null en surface / imageUrl
  sortOrder, createdAt: toComplexIso(...), updatedAt: toComplexIso(...), futureBookingsCount,
}
```

## Diseño interno

```
AdminCourtsController (@Roles('ADMIN'))
  ├── GET   /admin/courts        → AdminCourtsService.list
  ├── GET   /admin/courts/:id    → AdminCourtsService.findOrThrow
  ├── POST  /admin/courts        → AdminCourtsService.create
  └── PATCH /admin/courts/:id    → AdminCourtsService.update

AdminCourtsModule imports: ComplexModule (timezone para assertScheduleValid)
deps: PrismaService, ComplexService, Clock
```

## Tests

### Unit (`admin-courts.service.spec.ts`)

- [ ] `create` con `closeTime <= openTime` → `VALIDATION_ERROR` `details.closeTime`.
- [ ] `create` 10:00–10:30 con 60 min → `details.slotDurationMinutes`.
- [ ] `create` sin `sortOrder` → `max + 1`; con tabla vacía → `0`.
- [ ] `create` con P2002 `[complex_id, name]` → `COURT_NAME_ALREADY_EXISTS`.
- [ ] `update` de `pricePerSlot` con 3 reservas futuras → OK, no consulta el count.
- [ ] `update` de `openTime` con 3 reservas futuras → `COURT_HAS_FUTURE_BOOKINGS` con `details.futureBookings: ['3']`.
- [ ] `update` con `openTime` igual al actual y reservas futuras → OK.
- [ ] `update { isActive: false }` con reservas futuras → 409; sin reservas → OK; `{ isActive: true }` siempre OK.
- [ ] `update {}` → `VALIDATION_ERROR` `details._`.
- [ ] `update { surface: null }` → guarda `null`.
- [ ] `update` que deja `openTime >= closeTime` combinando body y actual → `VALIDATION_ERROR`.

### E2E (`admin-courts.e2e-spec.ts`)

- [ ] `GET /admin/courts` → 8 canchas (incluida "Cancha vieja" con `isActive: false`), orden `sortOrder`, cada una con `futureBookingsCount: 0`.
- [ ] `POST /admin/courts` "Pádel 4" (08:00–22:00, 90, 11000) → 201 con `sortOrder: 100` (max 99 + 1); aparece en `GET /courts` de `ana`; `GET /courts/:id/availability` devuelve 9 slots.
- [ ] `POST` "Pádel 4" de nuevo → `409 COURT_NAME_ALREADY_EXISTS`. `POST` "pádel 4" (minúscula) → 201 (case-sensitive, documentado).
- [ ] `POST` con `closeTime: '07:00'` → 400 `details.closeTime`. Con `slotDurationMinutes: 10` → 400. Con `imageUrl: 'ftp://x'` → 400.
- [ ] `PATCH` precio de Pádel 1 a 13000 → 200; una reserva previa de `ana` conserva `price: 12000`; una nueva se crea a 13000.
- [ ] Con reserva futura de `ana` en Pádel 1: `PATCH { openTime: '09:00' }` → 409 con `details.futureBookings: ['1']`; `PATCH { isActive: false }` → 409; `PATCH { name: 'Pádel Uno' }` → 200.
- [ ] Cancelar esa reserva → `PATCH { openTime: '09:00' }` → 200 y `availability` de mañana empieza 09:00.
- [ ] `PATCH { isActive: false }` Tenis 1 → 200; `ana` `GET /courts` no la lista, `GET /courts/:id` → 404, `POST /bookings` → 404, `GET /admin/agenda` no la incluye; `GET /admin/courts/:id` → 200 con `isActive: false`. `PATCH { isActive: true }` → vuelve a todos.
- [ ] `PATCH {}` → 400. `PATCH { surface: null }` → 200 sin `surface` en la respuesta.
- [ ] `ana` en cualquiera de los 4 endpoints → 403.

## Fuera de alcance

- `DELETE /admin/courts/:id`.
- Reordenamiento en bloque (`PATCH /admin/courts/order`).
- Subida de imágenes; horarios por día de la semana; precios por franja.
- Migrar reservas al cambiar la grilla.
