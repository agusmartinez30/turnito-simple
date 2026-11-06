# 17 — Clientes

## Objetivo

`Customer`: la persona que reserva, por complejo, **sin cuenta**. Reemplaza a las dos formas que convivían hasta ahora —un `User` con `role = PLAYER` (global, con email y contraseña) o el par suelto `customer_name` / `customer_phone` sobre la reserva— por una entidad con identidad propia: el teléfono dentro del complejo.

Un cliente nace solo cuando alguien pide turno desde `/public/c/:slug/requests`, o lo carga el panel. Toda `Booking` y toda `RecurringBooking` cuelgan de uno (`customer_id NOT NULL`). Contraparte de [`web/docs/18-admin-customers.md`](../../web/docs/18-admin-customers.md).

Con este módulo se elimina el concepto de "cliente con cuenta": `User` queda exclusivamente como la cuenta de administrador del complejo.

## Endpoints

Todos: `Auth: Bearer` + `@Roles('ADMIN')`, scoping por `@ComplexId()`.

### `GET /admin/customers`

```ts
// Query (ListCustomersDto)
// q?: string           trim, >= 2 · nombre, apellido o teléfono (ILIKE, tokens AND-eados)
// status?: 'active' | 'archived' | 'all'   default 'active'
// limit?: number       entero 1–200, default 100

// 200
{ data: AdminCustomer[] }   // orden first_name asc, last_name asc
```

### `GET /admin/customers/:id`

```ts
// 200
{ data: AdminCustomerDetail }   // AdminCustomer + { stats, bookings }
// 400 (no UUID) · 404 NOT_FOUND "Cliente no encontrado." (inexistente o de otro complejo)
```

### `POST /admin/customers`

```ts
// Body (CreateCustomerDto)
{
  firstName: string;   // trim, 2–60
  lastName?: string;   // trim, 2–60
  phone?: string;      // canonizado a '+' + dígitos, 8–15 dígitos
  note?: string;       // trim, <= 280
}

// 201
{ data: AdminCustomer }

// 400 VALIDATION_ERROR
// 409 CUSTOMER_PHONE_ALREADY_EXISTS   "Ya hay un cliente con ese teléfono."
```

### `PATCH /admin/customers/:id`

```ts
// Body (UpdateCustomerDto): cualquier subconjunto de CreateCustomerDto, más `isActive`.
// `lastName`, `phone` y `note` aceptan null para borrar.
// 200
{ data: AdminCustomer }

// 400 VALIDATION_ERROR   (incluye body vacío: details._: ['No hay cambios'])
// 404 NOT_FOUND
// 409 CUSTOMER_PHONE_ALREADY_EXISTS
```

`isActive: false` archiva y `true` restaura, igual que en canchas. Archivar no cancela nada.

### Cambios en endpoints existentes

| Endpoint | Cambio |
|---|---|
| `POST /admin/bookings` | `customer: { userId } \| { name, phone? }` → `customerId: string` |
| `POST /admin/recurring-bookings` | Ídem (hereda el DTO) |
| `POST /public/c/:slug/requests` | `name` → `firstName` + `lastName`, ambos 2–60 obligatorios |
| `GET /admin/users` | **Se elimina.** Buscaba sobre la tabla global `users`: no encontraba clientes reales y dejaba ver usuarios de otros complejos |
| `GET /bookings`, `POST /bookings`, `PATCH /bookings/:id/cancel` | **Se eliminan** con el módulo `bookings` (flujo de jugador con cuenta). `GET /courts` y `GET /courts/:id/availability` quedan |

Errores nuevos en los dos primeros: `404 NOT_FOUND` si el cliente no existe o es de otro complejo, y `422 CUSTOMER_ARCHIVED` ("Ese cliente está archivado.").

## DTOs

```ts
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const phone = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() !== '' ? normalizePhone(value) : value;

export class CreateCustomerDto {
  @Transform(trim)
  @IsString({ message: 'El nombre debe ser texto' })
  @Length(2, 60, { message: 'El nombre debe tener entre 2 y 60 caracteres' })
  firstName!: string;

  @Transform(trim) @Transform(emptyToNull)
  @IsOptional()
  @IsString({ message: 'El apellido debe ser texto' })
  @Length(2, 60, { message: 'El apellido debe tener entre 2 y 60 caracteres' })
  lastName?: string;

  @Transform(phone) @Transform(emptyToNull)
  @IsOptional()
  @Matches(/^\+\d{8,15}$/, { message: 'El teléfono debe tener entre 8 y 15 dígitos' })
  phone?: string;

  @Transform(trim) @Transform(emptyToNull)
  @IsOptional()
  @IsString({ message: 'La nota debe ser texto' })
  @MaxLength(280, { message: 'La nota no puede superar 280 caracteres' })
  note?: string;
}
```

`UpdateCustomerDto = PartialType(CreateCustomerDto)` con `lastName` / `phone` / `note` redeclarados como nullables (`@ValidateIf((_, v) => v !== null)`), más `isActive?: boolean`.

`CreateAdminBookingDto.customer` y `AdminBookingCustomerDto` se borran; queda `@IsUUID() customerId!: string`.

`CreatePublicRequestDto` reemplaza `name` por `firstName` y `lastName`, ambos con `@Length(2, 60)`, y canoniza `phone` con el mismo `@Transform`.

## Reglas de negocio

- **Identidad = teléfono por complejo**, canonizado a `'+'` más los dígitos (`shared/customers/phone.ts`). Unique `(complex_id, phone)`; como Postgres usa `NULLS DISTINCT`, **varios clientes sin teléfono conviven** en el mismo complejo.
- **Apellido y teléfono opcionales en la columna**, exigidos donde importa: la app pública pide los tres, el panel solo el nombre. Obligar al mostrador a completar todo para cargar un turno genera datos basura.
- **Desde la app el cliente se reusa**: `upsertByPhone` actualiza el nombre con el dato más fresco (el apellido solo si viene uno nuevo, nunca lo borra) y reactiva al archivado.
- **Desde el panel el teléfono repetido avisa** con `409`: reusar es decisión del admin. Esa asimetría es intencional.
- **Un cliente archivado no recibe turnos nuevos desde el panel** (`422 CUSTOMER_ARCHIVED`); desde la app se reactiva solo.
- **No hay borrado**: la FK es `onDelete: Restrict`.
- **Sin snapshot del nombre en la reserva.** Editar el cliente cambia todo su historial: corregir un typo debe aplicarse hacia atrás. Precio y estado de pago sí siguen siendo snapshot, como antes.
- **Scoping**: un id de otro complejo devuelve el mismo `404` que uno inexistente.
- **Turnos superpuestos permitidos**: un cliente puede tomar dos canchas a la misma hora (un grupo alquilando dos). Por eso no se crea una exclusion sobre `customer_id`.

### Semántica de los totales de la ficha

| Dato | Cálculo | Por qué |
|---|---|---|
| `bookings` | count por `status` | — |
| `billed` | Σ `price` de las `CONFIRMED` | Un `PENDING` todavía no se debe; un `CANCELLED` tampoco |
| `paid` | Σ `amount` de los pagos con `voided_at IS NULL` de **todas** sus reservas | Un pago sobre una reserva después cancelada existió igual |
| `balance` | `billed − paid`; negativo = saldo a favor | Misma semántica que `computePaymentSummary` |
| `activeRecurring` | count de series `ACTIVE` | — |

## Diseño interno

### Base de datos

```prisma
enum CustomerSource { PUBLIC ADMIN }

model Customer {
  id          String         @id @default(uuid())
  complexId   String         @map("complex_id")
  firstName   String         @map("first_name")
  lastName    String?        @map("last_name")
  phone       String?        // '+' + dígitos (CHECK customers_phone_fmt_chk)
  note        String?
  isActive    Boolean        @default(true) @map("is_active")
  source      CustomerSource @default(ADMIN)
  createdById String?        @map("created_by_id") // null = alta desde la app
  createdAt   DateTime       @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime       @updatedAt @map("updated_at") @db.Timestamptz(3)

  complex   Complex            @relation(fields: [complexId], references: [id], onDelete: Restrict)
  createdBy User?              @relation("customerCreatedBy", fields: [createdById], references: [id])
  bookings  Booking[]
  recurring RecurringBooking[]

  @@unique([complexId, phone])
  @@index([complexId, isActive, firstName, lastName])
  @@map("customers")
}
```

`Booking` y `RecurringBooking` ganan `customerId String @map("customer_id")` con relación `onDelete: Restrict`, y **pierden** `userId`, `customerName`, `customerPhone` y la relación `user`. En `Booking`, `@@index([userId, status, startsAt])` se reemplaza por `@@index([customerId, startsAt])`.

Constraints manuales de la migración (Prisma no conoce las escritas a mano, hay que agregar los `DROP`):

```sql
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_customer_chk";
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_user_no_overlap_excl";
DROP INDEX "bookings_customer_name_lower_idx";
ALTER TABLE "recurring_bookings" DROP CONSTRAINT "recurring_customer_chk";

ALTER TABLE "customers" ADD CONSTRAINT "customers_phone_fmt_chk"
  CHECK ("phone" IS NULL OR "phone" ~ '^\+[0-9]{8,15}$');
CREATE INDEX "customers_complex_first_name_lower_idx" ON "customers" ("complex_id", lower("first_name"));
CREATE INDEX "customers_complex_last_name_lower_idx"  ON "customers" ("complex_id", lower("last_name"));
```

`bookings_customer_chk` y `recurring_customer_chk` se caen porque su invariante ("hay cliente") ahora la expresa `customer_id NOT NULL` + FK, que es estrictamente más fuerte. `bookings_court_starts_at_active_uidx` —la garantía real contra el doble booking— no se toca.

`bookings_user_no_overlap_excl` se elimina sin reemplazo: `ErrorCode.USER_HAS_OVERLAPPING_BOOKING` y su traducción en `booking-core.ts` quedan sin emisor y se borran. La extensión `btree_gist` queda instalada.

Con `user_id` fuera, `cancelledByOf()` pasa a `cancelledById ? 'ADMIN' : 'SYSTEM'` y `BookingActor` a `'ADMIN' | 'SYSTEM'`.

### Módulos

Dos, siguiendo el precedente `users/` (service compartido, sin controller) vs `admin-*`:

- **`modules/customers/`** — `CustomersService`, exportado. Lo importan `AdminBookingsModule`, `RecurringBookingsModule` y `PublicModule`.

  ```ts
  findActiveOrThrow(complexId: string, id: string): Promise<Customer>  // 404 · 422 si archivado
  upsertByPhone(complexId: string, input: UpsertCustomerInput): Promise<Customer>
  search(complexId: string, q: string, limit: number): Promise<Customer[]>
  ```

- **`modules/admin-customers/`** — controller + service con el listado (agregados) y el detalle.

`shared/customers/`: `phone.ts` (`normalizePhone`) y `customer-search.ts` con `customerWhere(q): Prisma.CustomerWhereInput` (tokens AND-eados sobre `firstName` / `lastName` / `phone`) y `customerSearch(q): Prisma.BookingWhereInput` = `{ customer: { is: customerWhere(q) } }`. Lo reusan el listado de clientes, `admin-bookings.service`, `admin-payments.service` y `recurring-bookings.service`, que hasta ahora duplicaban el `OR` a mano. Se borra `shared/bookings/customer-resolver.ts`.

`shared/serializers/customer.serializer.ts` expone `BookingCustomer` con un campo `name` derivado (`` `${firstName} ${lastName ?? ''}`.trim() ``): mantenerlo es lo que permite que agenda, dashboard, ledger y WhatsApp no cambien.

`BOOKING_INCLUDE`, `RECURRING_INCLUDE` y `PAYMENT_LEDGER_INCLUDE` cambian `user: true` por `customer: true` — un join menos. `BookingForMessage` (whatsapp) pasa a `Booking & { court: Court; customer: Customer }`.

### Upsert público, sin transacción

```ts
async upsertByPhone(complexId, input) {
  const phone = normalizePhone(input.phone);
  try {
    return await this.prisma.customer.create({ data: { complexId, phone, ... } });
  } catch (err) {
    if (!isUniqueViolationOn(err, 'phone')) throw err;
    return this.prisma.customer.update({
      where: { complexId_phone: { complexId, phone } },
      data: { firstName, ...(lastName ? { lastName } : {}), isActive: true },
    });
  }
}
```

Tres decisiones que importan:

- **`create` + catch `P2002`, no `prisma.customer.upsert`.** Prisma *puede* compilar un upsert simple a `INSERT ... ON CONFLICT`, pero es una optimización interna condicionada: la corrección no debería depender de ella. `isUniqueViolationOn` ya existe para esto.
- **Nada de transacción interactiva alrededor de cliente + reserva.** `BookingCore.insert()` se apoya en *atrapar* violaciones de constraint (`P2002` → `SLOT_UNAVAILABLE`) y `PublicRequestsService.create` itera canchas reintentando. Dentro de una transacción, la primera violación la aborta y el reintento muere con `25P02 current transaction is aborted`. La idempotencia del cliente es lo que hace innecesaria la transacción.
- **Se llama después de validar el slot** (tras el `if (attempts.length === 0) throw`) y antes del loop de inserción, para que un `startsAt` inválido no deje un cliente fantasma. Si **todas** las canchas se ocupan en el ínterin sí queda uno: es aceptable, y limpiarlo requeriría la transacción que no se puede usar. El spam está acotado por el `ThrottlerGuard` de `/requests` (10/min).

### Agregados sin N+1

- **Listado**: la página con `_count: { bookings: { where: { status: { not: 'CANCELLED' } } } }`, más un `booking.groupBy(['customerId'], { _max: { startsAt } })` acotado a los ids de esa página. Dos queries fijas.
- **Ficha**: cinco queries en paralelo, todas indexadas por `customer_id` — `customer.findFirst({ id, complexId })`, `booking.groupBy({ by: ['status'], _count, _sum: { price } })`, `payment.aggregate({ voidedAt: null, booking: { customerId } })`, `recurringBooking.count({ status: 'ACTIVE' })` y `booking.findMany({ take: 20, orderBy: { startsAt: 'desc' }, include: BOOKING_INCLUDE })`.

### Códigos de error

| Código | HTTP | Cuándo |
|---|---|---|
| `CUSTOMER_PHONE_ALREADY_EXISTS` | 409 | `POST` / `PATCH` con un teléfono ya usado en el complejo |
| `CUSTOMER_ARCHIVED` | 422 | Reservar desde el panel para un cliente archivado |

Se agregan al enum **y** al mapa `ERROR_HTTP_STATUS`. Se elimina `USER_HAS_OVERLAPPING_BOOKING` de ambos. El choque de teléfono se detecta con `isUniqueViolationOn(err, 'phone')`.

El 409 **no** lleva el cliente existente adentro: `ErrorDetails` es `Record<string, string[]>` y ensancharlo tocaría todo el sistema de errores. La web resuelve con un `GET /admin/customers?q=<phone>&status=all`.

### Limitaciones conocidas

- `1100000077` y `5491100000077` son dos clientes. No se infiere el código de país: fusionar en silencio a dos personas es peor que un duplicado visible, y el buscador con `contains` hace que el admin vea el casi-duplicado al tipear.
- `mode: 'insensitive'` de Prisma cubre solo mayúsculas: "Perez" no encuentra a "Pérez". Si molesta, la respuesta es `CREATE EXTENSION pg_trgm` + GIN (el proyecto ya instala `btree_gist`).
- `contains` genera `ILIKE '%q%'`, que no usa los índices `lower(...)`. Se agregan igual por consistencia con el `bookings_customer_name_lower_idx` que se va; el seq scan filtrado por `complex_id` es irrelevante con miles de clientes.

## Tests

### Unit

- `shared/customers/phone.spec.ts` — `normalizePhone` colapsa espacios, guiones y `+`; idempotente.
- `shared/customers/customer-search.spec.ts` — tokens AND-eados; `%` y `_` escapados por Prisma.
- `modules/customers/customers.service.spec.ts` — `upsertByPhone` crea, reusa actualizando el nombre, no borra el apellido guardado, reactiva al archivado, y ante `P2002` forzado cae en el `update`. `findActiveOrThrow`: 404 por complejo ajeno, 422 por archivado.
- `modules/admin-customers/admin-customers.service.spec.ts` — agregados del listado y de la ficha; `PATCH` vacío → `VALIDATION_ERROR`.
- Adaptar: `booking-core.spec.ts` (se borra el caso de la exclusion de usuario), `admin-bookings.service.spec.ts` (los dos casos "con cuenta" / "sin cuenta" se funden en uno con `customerId`, más 404 y 422), `agenda.service.spec.ts`, `admin-dashboard.service.spec.ts`, `admin-payments.service.spec.ts`, `public-requests.service.spec.ts`, `recurring-bookings.service.spec.ts` (el mock de `UsersService` pasa a `CustomersService`) y `recurring-materializer.service.spec.ts`.

### E2E — `test/e2e/admin-customers.e2e-spec.ts`

- [ ] `POST` crea con nombre solo; con nombre + apellido + teléfono; dos sin teléfono conviven.
- [ ] `POST` con un teléfono ya usado → `409 CUSTOMER_PHONE_ALREADY_EXISTS`.
- [ ] `POST` con el mismo teléfono escrito con espacios y guiones → también `409` (canonización).
- [ ] `GET` lista ordenada por nombre; `q` matchea nombre, apellido y teléfono; `status` filtra.
- [ ] `GET /:id` trae `stats` y los últimos 20 turnos; los totales cierran contra los pagos cargados.
- [ ] `PATCH` edita, archiva y restaura; body vacío → `400` con `details._`.
- [ ] Un id de otro complejo responde `404` con el mismo `message` que uno inexistente.
- [ ] Reservar desde el panel para un archivado → `422 CUSTOMER_ARCHIVED`.

En `test/setup.ts` hay que agregar `customers` al `TRUNCATE` (la lista de tablas es literal) o todos los e2e arrancan sucios. `test/factories/index.ts` suma `createCustomer()` y `createBooking` / `createRecurringBooking` pasan de `userId` a `customerId`.

Se borran `test/e2e/bookings.e2e-spec.ts`, `modules/bookings/bookings.service.spec.ts` y el bloque `bookings_user_no_overlap_excl` de `test/e2e/database.e2e-spec.ts`; este último suma casos para `customers_complex_id_phone_key` y para los clientes sin teléfono.

En `test/e2e/public-requests.e2e-spec.ts` se agregan: mismo teléfono reusa el cliente y actualiza el nombre, y dos pedidos concurrentes con el mismo teléfono terminan en un solo cliente.

## Fuera de alcance

- Cuentas de cliente: registro, login, "mis reservas".
- Fusionar clientes duplicados.
- Importación masiva (CSV, contactos).
- Búsqueda insensible a acentos y equivalencia de teléfonos con y sin código de país.
- Etiquetas o segmentos de clientes.
- Envío masivo de WhatsApp a una selección.
