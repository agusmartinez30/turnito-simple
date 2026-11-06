# 15 — Multi-complejo

## Objetivo

Que varios complejos convivan en la misma API y base de datos, cada uno con su administrador y viendo solo sus datos. El alta de un complejo la hace su dueño desde la web (`POST /auth/register`), sin seed ni intervención manual. Contraparte de [`web/docs/16-multi-complex.md`](../../web/docs/16-multi-complex.md).

## Decisiones

| Tema | Decisión |
|---|---|
| Identidad del complejo | `Complex.slug` (unique, URL-safe, **inmutable**) identifica al complejo en las rutas públicas (`/public/c/:slug`, `/app/[slug]`). `Complex.id` viaja en el JWT. |
| Usuario ↔ complejo | `User.complexId` (FK nullable). `ADMIN` ⇒ obligatorio (CHECK `users_admin_has_complex_chk`). `PLAYER` ⇒ `null`: los jugadores son globales y pueden reservar en cualquier complejo. Un admin pertenece a **un** complejo; no hay tabla de membresías. |
| Cómo llega el complejo a los servicios | Explícito. El JWT lleva `complexId`; `RolesGuard` lo refresca desde la DB en cada ruta `@Roles`; el decorador `@ComplexId()` lo inyecta en el controller y **cada método de servicio lo recibe como primer parámetro** (mismo estilo que `adminId`). No hay contexto implícito por request. |
| Fugas entre complejos | Todo `findOrThrow(id)` es `findFirst({ where: { id, <scope> } })` y responde el **mismo** `404 NOT_FOUND` (mismo `message`) que un id inexistente. Un admin nunca puede distinguir "no existe" de "es de otro". |
| Rutas públicas | `/public/c/:slug/...`. El controller resuelve `slug → Complex` una vez por request; slug inexistente → `404 NOT_FOUND` "Complejo no encontrado.". |
| API de jugador | Se mantiene mínima para un futuro cliente móvil. `GET /courts` exige `?complexId=`; el resto deriva el complejo de la cancha. `GET /complex` pasa a ser del admin. |
| `timezone` | Se elige al crear el complejo y no se edita (ver `08-admin-complex.md`). Se valida con `Intl.DateTimeFormat` (acepta alias como `America/Argentina/Buenos_Aires`, que `Intl.supportedValuesOf('timeZone')` omite). |

## Base de datos (migración `multi_complex`)

```prisma
model Complex {
  slug  String @unique   // ^[a-z0-9]+(-[a-z0-9]+)*$ (CHECK complexes_slug_fmt_chk)
  users User[]
}

model User {
  complexId String?  @map("complex_id")
  complex   Complex? @relation(fields: [complexId], references: [id], onDelete: Restrict)
  @@index([complexId])
}
```

La migración rellena las filas existentes de una instalación single-tenant: el complejo recibe `slug = 'complejo-' || left(id, 8)` y todos los `ADMIN` quedan asociados al complejo más antiguo. El seed (`pnpm prisma:seed`) renombra ese slug a `complejo-demo` si el nombre coincide y agrega un segundo complejo (`complejo-sur`, `admin.sur@demo.com`) para probar el aislamiento.

`onDelete: Restrict` en `users.complex_id`: borrar un complejo con admins violaría el CHECK; primero hay que degradarlos.

## Endpoints

### `POST /auth/register` — alta de complejo (reemplaza al registro de jugador)

```ts
// Body (RegisterComplexDto) — plano a propósito: los details de validación son por campo simple
{
  complexName: string;     // trim, 2–80
  complexAddress: string;  // trim, 2–160
  timezone: string;        // IANA válido; "La zona horaria no es válida"
  name: string;            // 2–60
  email: string;           // lowercase
  phone?: string;
  password: string;        // 8–72
}

// 201 { data: { accessToken, expiresAt, user } }   user.role = 'ADMIN', user.complexId = <nuevo>
// 400 VALIDATION_ERROR · 409 EMAIL_ALREADY_EXISTS
```

Flujo (`AuthService.register`):

1. `findByEmail` → `409` sin hashear ni abrir transacción.
2. `argon2.hash`.
3. `prisma.$transaction`: `ComplexService.create({ name, address, timezone }, tx)` → `tx.user.create({ role: ADMIN, complexId })`.
4. `P2002` en `email` (carrera) → `409`. `P2002` en `slug` (dos altas simultáneas con el mismo nombre) → se repite la transacción entera, hasta 3 intentos.

Slug (`shared/slug.ts`): `slugify(name)` = NFD sin diacríticos, minúsculas, `[^a-z0-9]+ → -`, máx. 60 chars, vacío → `complejo`. `uniqueSlug(db, base)` devuelve `base` o `base-N` con `N` = mayor sufijo numérico en uso + 1 (arranca en 2).

### JWT y `req.user`

Payload `{ sub, email, role, complexId }`. `AuthUser = { id, email, role, complexId: string | null }`. Tokens anteriores a esta versión no traen `complexId` (→ `null`): en rutas `@Roles` `RolesGuard` lo refresca de la DB; en el resto el admin debe volver a loguearse.

`UserResponse` gana `complexId: string | null` (siempre presente).

### `@ComplexId()` (`common/decorators/complex-id.decorator.ts`)

Devuelve `req.user.complexId`; si es `null` → `403 FORBIDDEN` "Tu cuenta no está asociada a un complejo.". Se usa en todos los controllers `admin/*` y en `GET /complex`.

### Rutas públicas — `/public/c/:slug/*`

| Método | Path | Cambio |
|---|---|---|
| `GET` | `/public/c/:slug/complex` | + `slug` en la respuesta |
| `GET` | `/public/c/:slug/courts` | canchas activas del complejo |
| `GET` | `/public/c/:slug/courts/:id/availability?date=` | cancha de otro complejo → 404 |
| `GET` | `/public/c/:slug/sports/:sport/availability?date=&courtId=` | agrega solo canchas del complejo |
| `POST` | `/public/c/:slug/requests` | `courtId` de otro complejo → 404; con `sport` asigna entre las del complejo |
| `GET` | `/public/c/:slug/requests/:id` | pedido de otro complejo → 404 |

Rate limit sin cambios (por IP). `:sport` se valida con `sportParam()` (pipe) en lugar de un DTO de params, para que `slug` no choque con `forbidNonWhitelisted`.

### API de jugador

| Endpoint | Regla |
|---|---|
| `GET /complex` | `@Roles(ADMIN)` + `@ComplexId()`: el complejo del admin. Jugador → `403`. |
| `GET /courts?complexId=` | Obligatorio para `PLAYER` (`400 details.complexId: ['Indicá el complejo']`); un `ADMIN` puede omitirlo y ve el suyo. |
| `GET /courts/:id`, `GET /courts/:id/availability` | Sin cambios de contrato; el complejo sale de la cancha. |
| `POST /bookings` | Timezone y `cancellationWindowHours` del complejo de `courtId`. |
| `GET /bookings` | Sigue por usuario, **cross-complejo**; cada reserva se formatea en el timezone de su complejo. |
| `PATCH /bookings/:id/cancel` | Ventana del complejo de la reserva. |
| `GET /admin/users` | Sigue **global**: los jugadores no pertenecen a un complejo. |

## Scoping por modelo

| Modelo | Filtro |
|---|---|
| `Court` | `{ complexId }` |
| `Booking`, `RecurringBooking` | `{ court: { complexId } }` |
| `Payment` | a través de la reserva: primero `booking.findFirst({ id, court: { complexId } })` |
| `WhatsappConnection`, `WhatsappMessage`, `WhatsappAutoReply`, `WhatsappSessionKey` | `{ complexId }` |

Firmas (el `complexId` va primero):

```
AdminCourtsService.list(complexId) · findOrThrow(complexId, id) · create(complexId, dto) · update(complexId, id, dto)
AdminBookingsService.create(complexId, adminId, dto) · list(complexId, q) · findOrThrow(complexId, id) · confirm|start|finish|cancel(complexId, adminId, id, …)
AgendaService.getAgenda(complexId, date) · AdminDashboardService.getRange(complexId, q)
AdminPaymentsService.list(complexId, q) · register(complexId, adminId, bookingId, dto) · void(complexId, adminId, bookingId, paymentId, reason?)
RecurringBookingsService.create|list|findOrThrow|end(complexId, …)
WhatsappService.getConnection|connect|disconnect|update(complexId, …) · WhatsappMessagesService.list|retry|sendManual(complexId, …)
CourtsService.list(complexId, q) · findActiveOrThrow(id, complexId?)   // sin complexId: solo por id (rutas de jugador)
ComplexService.findByIdOrThrow(id) · findBySlugOrThrow(slug) · create(input, tx?) · update(id, data) · invalidate(id)
```

`ComplexService` cachea por id en memoria (`Map`); `update(id)` invalida esa entrada. El slug es inmutable, así que `idBySlug` no necesita invalidación. Con una sola instancia de la API alcanza; si se escala horizontalmente pasa a TTL corto.

## Crons

- `RecurringMaterializerService`: recorre series de **todos** los complejos; el timezone sale de `findByIdOrThrow(series.court.complexId)` (antes usaba el del primer complejo: con dos complejos era un bug).
- `BookingRemindersService`: itera `whatsapp_connections` habilitadas, ya por complejo.
- `WhatsappConnectionManager`: ya estaba keyed por `complexId`; templates y auto-respuesta usan nombre, dirección y timezone del complejo de la reserva, y el link `${WEB_ORIGIN}/app/${slug}`.
- `PendingExpiryService`: global, no necesita complejo.

## CLI

```
pnpm admin:promote <email> <slug>   # role = ADMIN del complejo; si ya era admin de otro, lo mueve
pnpm admin:demote  <email>          # role = PLAYER, complexId = null; falla si es el último admin de su complejo
```

Solo sirve para sumar un segundo admin a un complejo (el usuario tiene que existir). El alta normal es `POST /auth/register`.

## Tests

### Unit
- `slug.spec`: `slugify` (diacríticos, vacío, largo) y `uniqueSlug` (sufijo siguiente al mayor numérico).
- `tz.spec`: `isValidTimezone` acepta alias y rechaza inválidos.
- `auth.service.spec`: `register` con email existente no abre transacción; crea complejo + admin en la misma tx; reintenta ante `P2002` en `slug`; propaga tras agotar reintentos.
- `complex.service.spec`: cache por id, 404 por id y slug, `update(id)` invalida solo ese, `create` deriva y sufija el slug.
- Cada `*.service.spec` de módulos admin: mocks de `findFirst` scopeado y `ComplexService.findByIdOrThrow`.

### E2E — `multi-complex.e2e-spec.ts`
- [x] Registro crea complejo + admin; `GET /complex`, `GET /admin/courts` y agenda vacíos; `/public/c/<slug>/complex` responde.
- [x] Con datos en Demo, el admin de Sur recibe `404` en todos los `:id` de Demo (courts, bookings + confirm/start/finish/cancel, payments + void, recurring + end, whatsapp send/retry) con el **mismo body** que un UUID inexistente; crear sobre una cancha ajena → 404.
- [x] Listados, agenda y dashboard de Sur vacíos; `GET /admin/courts` solo Sur.
- [x] `PATCH /admin/complex` de Sur no toca Demo.
- [x] WhatsApp: conexión y configuración por complejo (una fila por complejo).
- [x] Público: slug inexistente → 404; cancha/pedido de Demo bajo `complejo-sur` → 404; disponibilidad por deporte solo agrega canchas del slug.
- [x] Jugador: reserva en Sur; `GET /bookings` mezcla complejos; `cancel` usa la ventana de Sur.
- [x] Crons: el materializer cubre ambos complejos; recordatorios solo del complejo habilitado.

Además: `auth.e2e-spec` (alta, slug `-2`, timezone inválida), `courts.e2e-spec` (`GET /complex` por rol, `?complexId=`), `admin-auth.e2e-spec` (CLI con slug, último admin por complejo), y las URLs `/public/c/complejo-demo/...` en `public-requests`, `admin-dashboard` y `whatsapp`.

## Fuera de alcance

- Varios admins por complejo con invitación desde el panel (hoy: CLI).
- Un usuario admin de más de un complejo (tabla de membresías).
- Editar el slug o el timezone.
- Borrar un complejo.
- Jugadores "del complejo" (hoy son globales).
