# 06 — Admin · Agenda, reservas y búsqueda de clientes

> **Actualizado por `17-admin-customers.md`.** El objeto `customer` del body se reemplazó por `customerId: string` (un cliente de la tabla `customers`, de este complejo y activo); `GET /admin/users` y `UsersService.search` se eliminaron, y el buscador del panel es `GET /admin/customers?q=`. `customerSearch(q)` pasa a filtrar por la relación `customer`. Las secciones de abajo describen el diseño original del incremento.

## Objetivo

Servir la agenda del día de todas las canchas, permitir al admin crear reservas para clientes con o sin cuenta, listar / buscar cualquier reserva y cancelarla sin ventana. Contraparte de [`web/docs/06-admin-agenda.md`](../../web/docs/06-admin-agenda.md) y [`web/docs/07-admin-bookings.md`](../../web/docs/07-admin-bookings.md).

## Endpoints

Todos: `Auth: Bearer` + `@Roles('ADMIN')` (403 `FORBIDDEN` si no).

### `GET /admin/agenda`

```ts
// Query (AgendaQueryDto)
{ date: string }   // YYYY-MM-DD, día local del complejo

// 200
{
  data: {
    date: string;
    timezone: string;
    summary: { bookings: number; slots: number };
    courts: Array<{
      court: { id, name, sport, isIndoor, slotDurationMinutes, openTime, closeTime, pricePerSlot };
      slots: Array<{
        startsAt: string; endsAt: string;
        status: 'AVAILABLE' | 'BOOKED' | 'BLOCKED' | 'PAST';
        booking?: { id, customer: BookingCustomer, price, source, note? };
      }>;
    }>;
  }
}

// 400 VALIDATION_ERROR   (formato o fecha inexistente; sin límite de rango)
```

### `POST /admin/bookings`

```ts
// Body (CreateAdminBookingDto)
{
  courtId: string;                 // UUID
  startsAt: string;                // ISO-8601 con offset
  customer: { userId: string } | { name: string; phone?: string };
  price?: number;                  // entero >= 0
  note?: string;                   // <= 280
}

// 201
{ data: AdminBooking }

// 400 VALIDATION_ERROR   (customer con ambos o ninguno · slot inválido · price negativo)
// 404 NOT_FOUND          "Cancha no encontrada." · "Cliente no encontrado."
// 409 SLOT_UNAVAILABLE
// 409 USER_HAS_OVERLAPPING_BOOKING   (solo con userId)
// 422 BOOKING_IN_PAST
```

### `GET /admin/bookings`

```ts
// Query (ListAdminBookingsDto), todos opcionales
{
  date?: string;            // YYYY-MM-DD → startsAt ∈ [00:00, 24:00) del día local
  from?: string;            // ISO → endsAt > from     (ignorado si hay date)
  to?: string;              // ISO → startsAt < to     (ignorado si hay date)
  courtId?: string;         // UUID
  status?: BookingStatus;
  q?: string;               // >= 2 chars
  order?: 'asc' | 'desc';   // default: 'asc' si hay date o from; si no, 'desc'
  limit?: number;           // 1–200, default 100
}

// 200
{ data: AdminBooking[] }
```

### `GET /admin/bookings/:id`

```ts
// 200
{ data: AdminBooking }
// 400 (id no UUID) · 404 NOT_FOUND "Reserva no encontrada."
```

### `PATCH /admin/bookings/:id/cancel`

```ts
// Body (CancelAdminBookingDto), opcional
{ reason?: string }   // <= 280

// 200
{ data: AdminBooking }   // status CANCELLED, cancelledAt, cancelledBy: 'ADMIN', cancellationReason?

// 404 NOT_FOUND
// 422 BOOKING_ALREADY_CANCELLED  "Esta reserva ya fue cancelada."
// 422 BOOKING_ALREADY_FINISHED   "Ese turno ya terminó."
```

### `GET /admin/users`

```ts
// Query (SearchUsersDto)
{ q: string; limit?: number }   // q >= 2 chars (trim) · limit 1–25, default 10

// 200
{ data: Array<{ id, name, email, phone?, role }> }   // orden name asc

// 400 VALIDATION_ERROR
```

## DTOs

```ts
class CustomerWithAccountDto { @IsUUID() userId!: string; }
class CustomerWithoutAccountDto {
  @IsString() @Length(2, 60) @Transform(trim) name!: string;
  @IsOptional() @Matches(/^\+?\d{8,15}$/) @Transform(emptyToUndefined) phone?: string;
}

export class CreateAdminBookingDto {
  @IsUUID() courtId!: string;
  @IsISO8601({ strict: true }) startsAt!: string;
  @ValidateNested() @Type(customerDiscriminator) customer!: CustomerWithAccountDto | CustomerWithoutAccountDto;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsString() @MaxLength(280) @Transform(trim) note?: string;
}
```

`customerDiscriminator`: si el objeto trae `userId` → `CustomerWithAccountDto`; si no → `CustomerWithoutAccountDto`. Un objeto con `userId` **y** `name` se rechaza en el service con `VALIDATION_ERROR` `details.customer: ['Indicá un cliente con cuenta o un nombre, no ambos']` (class-validator no lo expresa bien con `forbidNonWhitelisted` + discriminador; se resuelve explícitamente).

```ts
export class ListAdminBookingsDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @IsOptional() @IsISO8601({ strict: true }) to?: string;
  @IsOptional() @IsUUID() courtId?: string;
  @IsOptional() @IsEnum(BookingStatus) status?: BookingStatus;
  @IsOptional() @IsString() @MinLength(2) @Transform(trim) q?: string;
  @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit: number = 100;
}

export class CancelAdminBookingDto {
  @IsOptional() @IsString() @MaxLength(280) @Transform(trim) reason?: string;
}

export class AgendaQueryDto { @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string; }   // "fecha real" se valida en el service
export class SearchUsersDto {
  @IsString() @MinLength(2) @Transform(trim) q!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(25) limit: number = 10;
}
```

## Reglas de negocio

### `shared/bookings/booking-core.ts` (extraído del módulo de jugador)

```ts
/** Valida cancha activa, no pasado y slot exacto. Devuelve el slot y la cancha. Lanza AppException. */
assertSlotBookable(input: { courtId, startsAt: Date, now, complex, enforceWindow: boolean, maxDaysAhead })
  → { court, slot }

/** INSERT con traducción de constraints. Sin SELECT previo. */
insertConfirmed(tx, data: Prisma.BookingUncheckedCreateInput) → BookingWithRelations
  P2002 (court_id, starts_at)         → SLOT_UNAVAILABLE
  exclusion bookings_user_no_overlap  → USER_HAS_OVERLAPPING_BOOKING
```

`BookingsService.create` (jugador) llama a `assertSlotBookable({ enforceWindow: true })` y `insertConfirmed({ userId, source: 'PLAYER' })`. Comportamiento y tests del MVP no cambian.

### Crear reserva admin — `AdminBookingsService.create(adminId, dto)`

1. `customer`: exactamente una forma. Con `userId` → `usersService.findById` → si no existe, `404 NOT_FOUND "Cliente no encontrado."`.
2. `assertSlotBookable({ enforceWindow: false })` → 404 cancha, 422 pasado, 400 slot inválido. **Sin** `BOOKING_MAX_DAYS_AHEAD`.
3. `price = dto.price ?? court.pricePerSlot`.
4. `insertConfirmed({ courtId, userId | null, customerName | null, customerPhone | null, startsAt, endsAt, price, source: 'ADMIN', note, createdById: adminId })`.
5. Serializar con `toAdminBookingResponse`.

La regla de solapamiento por usuario aplica solo con `userId` (la exclusion no compara `NULL`). Dos clientes sin cuenta con el mismo nombre en el mismo horario en canchas distintas es válido.

### Agenda — `AgendaService.getAgenda(date)`

1. Validar `date` real (`isValidLocalDate`). Sin restricción de rango.
2. `courts = prisma.court.findMany({ where: { isActive: true }, orderBy: [sortOrder, name] })`.
3. Para cada cancha, `generateSlots(...)` (puro, `shared/time/slots.ts`).
4. **Una sola query** de reservas: `CONFIRMED` con `startsAt >= min(slots.startsAt)` y `< max(slots.endsAt)` de todas las canchas, `include: { user }`. Se indexan en `Map<courtId, Map<startsAtMs, booking>>`.
5. Estado por slot con la misma precedencia que `AvailabilityService` (`PAST` > `BOOKED` > `AVAILABLE`), **pero** `booking` se adjunta siempre que exista, también en `PAST`.
6. `summary.bookings` = cantidad de reservas de la query que cayeron en algún slot; `summary.slots` = suma de slots de todas las canchas.
7. Serializar `startsAt` / `endsAt` con offset del complejo; `customer` con `toBookingCustomer`.

Un día sin canchas activas → `courts: []`, `summary: { bookings: 0, slots: 0 }`.

### Listar — `AdminBookingsService.list(query)`

- `date` → `[localTimeToUtc(date, '00:00'), localTimeToUtc(date + 1 día, '00:00'))` sobre `startsAt`; anula `from` / `to`.
- `q` → `OR` de `customerName ILIKE %q%`, `user.name ILIKE %q%`, `user.email ILIKE %q%`, `user.phone ILIKE %q%`, `customerPhone ILIKE %q%`. Escapar `%` y `_` del input.
- `order` default: `'asc'` si `date` o `from`; `'desc'` en el resto.
- `include: { court, user, createdBy: { select: { id, name } } }`. Sin N+1.
- `take: limit`.

### Cancelar — `AdminBookingsService.cancel(adminId, id, reason?)`

1. `findUnique` → 404.
2. `status === 'CANCELLED'` → `422 BOOKING_ALREADY_CANCELLED`.
3. `endsAt <= now` → `422 BOOKING_ALREADY_FINISHED`. (Un turno **en curso** sí se puede cancelar.)
4. **Sin** chequeo de `cancellationWindowHours`.
5. `updateMany({ where: { id, status: 'CONFIRMED' }, data: { status: 'CANCELLED', cancelledAt: now, cancelledById: adminId, cancellationReason: reason ?? null } })`; `count === 0` → `422 BOOKING_ALREADY_CANCELLED`.
6. Releer con relaciones y serializar.

La cancelación de jugador (`PATCH /bookings/:id/cancel`) **no** setea `cancelledById`; así `cancelledBy` se deriva sin columna extra: `cancelledById ? 'ADMIN' : 'PLAYER'`.

### Buscar clientes — `UsersService.search(q, limit)`

`findMany({ where: { OR: [name, email, phone] ILIKE %q% }, orderBy: { name: 'asc' }, take: limit, select: { id, name, email, phone, role } })`. Incluye admins (un admin también puede tener reservas).

### Serialización

```ts
// shared/serializers/booking.serializer.ts
toBookingCustomer(b): { userId?, name, email?, phone? }
  // con user: { userId: user.id, name: user.name, email: user.email, phone?: user.phone }
  // sin user: { name: customerName, phone?: customerPhone }

toBookingResponse(b, tz)        // jugador — + cancelledBy?, cancellationReason? (se omiten si no aplica)
toAdminBookingResponse(b, tz)   // = toBookingResponse sin userId + customer, source, note?, createdBy?, cancelledBy?, cancellationReason?
```

`toBookingResponse` (jugador) nunca expone `note`, `source` ni `createdBy`.

## Diseño interno

```
AdminBookingsController  (@Roles('ADMIN'))
  ├── GET  /admin/agenda            → AgendaService.getAgenda(date)
  ├── POST /admin/bookings          → AdminBookingsService.create(admin.id, dto)
  ├── GET  /admin/bookings          → AdminBookingsService.list(query)
  ├── GET  /admin/bookings/:id      → AdminBookingsService.findOrThrow(id)
  ├── PATCH /admin/bookings/:id/cancel → AdminBookingsService.cancel(admin.id, id, dto.reason)
  └── GET  /admin/users             → UsersService.search(q, limit)

AdminBookingsModule imports: CourtsModule, ComplexModule, UsersModule
deps de AdminBookingsService: PrismaService, ComplexService, Clock, BookingCore (provider de shared/bookings)
deps de AgendaService: PrismaService, ComplexService, Clock
```

## Tests

### Unit

`booking-core.spec.ts`
- [ ] `assertSlotBookable` con `enforceWindow: false` acepta `hoy + 60 días`; con `true` lo rechaza.
- [ ] Resto de casos migrados desde `bookings.service.spec` (pasado, slot inválido, fuera de horario, P2002, exclusion).

`agenda.service.spec.ts` (Prisma y Clock mockeados)
- [ ] Dos canchas con duraciones 60 y 90 → cada una con su cantidad de slots; `summary.slots` es la suma.
- [ ] Reserva a las 14:00 con `now = 15:00` → slot `PAST` **con** `booking`.
- [ ] Reserva de cliente sin cuenta → `customer: { name, phone }` sin `userId`; con cuenta → `customer.userId` y `email`.
- [ ] Reserva `CANCELLED` no aparece.
- [ ] Una sola llamada a `findMany` para N canchas.
- [ ] Sin canchas activas → `courts: []`.
- [ ] `2026-02-30` → `VALIDATION_ERROR`; ayer y `hoy + 300` → OK.

`admin-bookings.service.spec.ts`
- [ ] `create` con `{ userId }` inexistente → `NOT_FOUND`.
- [ ] `create` sin cuenta → `userId: null`, `customerName`, `source: 'ADMIN'`, `createdById`.
- [ ] `create` con `price: 8000` → 8000; sin `price` → `court.pricePerSlot`.
- [ ] `create` a `hoy + 60 días` → OK (sin ventana). En el pasado → `BOOKING_IN_PAST`.
- [ ] `cancel` con 1 h de anticipación → OK, `cancelledById`, `cancellationReason`.
- [ ] `cancel` con `endsAt <= now` → `BOOKING_ALREADY_FINISHED`; ya cancelada → `BOOKING_ALREADY_CANCELLED`.
- [ ] `list` con `date` ignora `from`/`to`; `q` arma el `OR` con `contains` + `mode: 'insensitive'` y escapa `%`.

### E2E (`admin-agenda.e2e-spec.ts`, `admin-bookings.e2e-spec.ts`)

Setup: `resetDatabase()`, login `admin@demo.com`, `ana@demo.com`, `bruno@demo.com`. Clock fijo `2026-09-12T15:00:00-03:00`.

- [ ] `ana` → `GET /admin/agenda?date=2026-09-13` → `403 FORBIDDEN` con el mensaje de sección.
- [ ] `admin` → `GET /admin/agenda?date=2026-09-13` → 7 canchas activas en orden `sortOrder`, `summary.slots` correcto (10+10+8+13+13+13+13 = 80), todos `AVAILABLE`.
- [ ] `ana` reserva Pádel 1 mañana 17:00 por `POST /bookings` → la agenda muestra `booking.customer = { userId, name: 'Ana Jugadora', email, phone }`, `source: 'PLAYER'`.
- [ ] `admin` `POST /admin/bookings` Pádel 2 mañana 17:00 `{ userId: bruno }` → 201 `source: 'ADMIN'`, `createdBy.name = 'Admin Demo'`; `bruno` la ve en `GET /bookings?scope=upcoming` **sin** `note`/`source`.
- [ ] `admin` `POST /admin/bookings` Tenis 1 mañana 10:00 `{ name: 'Carlos Pérez', phone: '+5491100000077' }`, `price: 8000`, `note` → 201, `customer` sin `userId`, `price: 8000`.
- [ ] `admin` `POST /admin/bookings` Pádel 3 mañana 17:00 `{ userId: ana }` → `409 USER_HAS_OVERLAPPING_BOOKING`.
- [ ] `admin` `POST /admin/bookings` Pádel 1 mañana 17:00 `{ name: 'Otro' }` → `409 SLOT_UNAVAILABLE` (ocupado por ana).
- [ ] `admin` `POST /admin/bookings` a `2026-11-15` (fuera de los 14 días) → 201. `ana` mismo día por `POST /bookings` → 400.
- [ ] **Carrera admin vs jugador**: `Promise.all` de `POST /admin/bookings` (sin cuenta) y `POST /bookings` (ana) al mismo slot libre, ×5 → siempre un 201 y un 409.
- [ ] `customer: { userId, name }` → 400 con `details.customer`. `customer: {}` → 400.
- [ ] `GET /admin/bookings?date=2026-09-13` → las 3 de mañana en orden asc, con `court`, `customer`, `source`.
- [ ] `GET /admin/bookings?q=carlos` → solo la de Carlos. `?q=ana` → la de Ana. `?q=a` → 400.
- [ ] `GET /admin/bookings?courtId=<padel1>&status=CONFIRMED` → 1.
- [ ] `GET /admin/bookings` sin filtros → orden desc; `?from=<now>` → asc.
- [ ] `admin` `PATCH /admin/bookings/:carlos/cancel { reason: 'Llamó' }` → 200 `cancelledBy: 'ADMIN'`, `cancellationReason`; la agenda muestra el slot `AVAILABLE`; repetir → 422.
- [ ] `admin` cancela la de `ana` (dentro de las 24 h, con Clock movido) → 200. `ana` `GET /bookings/:id` → `status: 'CANCELLED'`, `cancelledBy: 'ADMIN'`, `cancellationReason`.
- [ ] `ana` cancela la suya por `PATCH /bookings/:id/cancel` (otra reserva) → `cancelledBy: 'PLAYER'`, sin `cancellationReason`.
- [ ] Reserva de ayer (creada por factory) → `PATCH /admin/.../cancel` → `422 BOOKING_ALREADY_FINISHED`. Agenda de ayer la muestra en `PAST` con `booking`.
- [ ] `GET /admin/users?q=jug` → Ana y Bruno (orden name asc). `?q=+549110000` → Ana. `?q=x` → 400.
- [ ] Cada uno de los 6 endpoints con token de `ana` → 403; sin token → 401.

## Fuera de alcance (MVP admin)

- Editar reserva (cliente, precio, nota) después de creada.
- Estado `NO_SHOW`. (Los pagos son un resumen derivado, no un estado: `11-admin-payments.md`.)
- Paginación por cursor; exportación.
- Crear reservas en el pasado (registrar un turno ya jugado).
- Búsqueda con `pg_trgm` / full-text.
