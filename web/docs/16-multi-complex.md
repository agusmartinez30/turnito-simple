# 16 — Multi-complejo: la web es el panel de cada complejo

## Objetivo

Que cualquier dueño de complejo pueda darlo de alta desde la web y administrarlo, y que sus clientes pidan turno en un link propio (`/app/[slug]`). La web deja de ser "la app de jugadores de un complejo": queda como **panel de administración + flujo público de solicitud de turno**. Contraparte de [`api/docs/15-multi-complex.md`](../../api/docs/15-multi-complex.md).

## Decisiones

| Tema | Decisión |
|---|---|
| Registro | `/register` crea un **complejo con su primer administrador**, no una cuenta de jugador. Formulario mínimo: complejo (nombre, dirección, zona horaria) + cuenta (nombre, email, teléfono opcional, contraseña). Las canchas se cargan después desde `/admin/courts`. |
| Flujo de jugador con cuenta | **Eliminado** de la web: `/`, `/courts`, `/courts/[id]`, `/bookings`, `/bookings/[id]`, la `Navbar` y las features `home`, `bookings` y la parte de jugador de `courts`. Las specs `02`–`04` quedan como históricas. Los clientes piden turno sin cuenta en `/app/[slug]`. |
| Aterrizaje con sesión | `/` redirige a `/admin` (proxy). `safeNext` devuelve `/admin` por defecto. Un usuario logueado que no es admin ve `AdminForbidden` (el proxy ya no decodifica el JWT). |
| Link público | `/app/[slug]`, donde `slug` es el del complejo (`GET /complex` lo devuelve). Se muestra en `/admin/settings` con botón "Copiar" y en "Ver app" del panel. |
| Nombre de producto | `NEXT_PUBLIC_APP_NAME` (default `Clubix`) reemplaza a `NEXT_PUBLIC_COMPLEX_NAME`: las pantallas sin sesión ya no son de un complejo. |
| Zona horaria | `Select` con una lista curada (`src/features/auth/timezones.ts`, Latinoamérica + España), default `America/Argentina/Buenos_Aires`. `Intl.supportedValuesOf('timeZone')` omite alias como ese y varía entre navegadores. |

## Rutas / pantallas

| Ruta | Layout | Auth | Comportamiento |
|---|---|---|---|
| `/` | — | — | Redirect a `/admin` (con o sin sesión; sin sesión termina en `/login?next=/admin`). |
| `/login` | `(public)` | No | Con sesión → `?next=` o `/admin`. Footer: "¿Todavía no cargaste tu complejo? **Crealo**". |
| `/register` | `(public)` | No | Alta de complejo. Con sesión → `/admin`. |
| `/admin/*` | `(admin)` | Sí, ADMIN | Sin cambios de rutas. |
| `/app/[slug]` | `(open)` | Ninguna | Flujo público del complejo `slug` (`10-public-request.md`). |
| `/app/[slug]/requests/[id]` | `(open)` | Ninguna | Estado del pedido. |
| `/app` | — | — | Sin página (404): no hay complejo por defecto. |

### `/register` — `RegisterForm`

Dos bloques (`FieldSet` + `FieldLegend`):

- **Tu complejo**: Nombre del complejo (2–80; ayuda "Así lo van a ver tus clientes en el link para reservar"), Dirección (2–160), Zona horaria (`Select`; ayuda "Define los horarios de las canchas. No se puede cambiar después").
- **Tu cuenta**: Nombre, Email, Teléfono (opcional), Contraseña, Repetir contraseña.
- Botón **"Crear complejo"**. Al éxito: cookie de sesión + `router.replace('/admin')` (o `?next=`).
- Errores: `EMAIL_ALREADY_EXISTS` inline en email; `VALIDATION_ERROR` mapea `details` (planos: `complexName`, `complexAddress`, `timezone`, `name`, `email`, `phone`, `password`) con `setError`.

### `/admin/settings` — `PublicLinkCard`

Arriba del formulario de configuración: card "Link para tus clientes" con `${origin}/app/${slug}` en un `Input` de solo lectura, **Copiar** (`navigator.clipboard`, toast "Link copiado") y **Abrir** (pestaña nueva). El origen se lee solo en el cliente (`useSyncExternalStore`); en SSR se muestra el path.

### `/app/[slug]` — cambios sobre `10-public-request.md`

- Todos los hooks de `features/public-request` leen el slug de la URL (`usePublicSlug()`, `useParams`) y pegan a `/public/c/:slug/...`. Query keys: `['public', slug, ...]`.
- `usePublicHome()` arma `/app/${slug}` para los links (header, "Pedir otro turno", redirect tras enviar).
- Slug inexistente (`GET /public/c/:slug/complex` → 404): `PublicRequestFlow` muestra "Complejo no encontrado" ("El link no es válido. Pedile al complejo su link para reservar y volvé a intentar"); sin reintento (`retry: false`).

## Modelo de datos

```ts
interface Complex { id; slug; name; address; timezone; cancellationWindowHours }
interface User { id; name; email; phone?; role; complexId: string | null }
type PublicComplex = Pick<Complex, 'slug' | 'name' | 'address' | 'timezone' | 'cancellationWindowHours'>;
```

## Contrato API (cambios)

| Endpoint | Cambio |
|---|---|
| `POST /auth/register` | Body plano `{ complexName, complexAddress, timezone, name, email, phone?, password }` → `user.role = 'ADMIN'`, `user.complexId`. |
| `GET /complex` | Solo ADMIN: el complejo del admin, con `slug`. |
| `/public/*` | Pasa a `/public/c/:slug/*`; `GET .../complex` incluye `slug`. |
| `GET /courts`, `/bookings*` | Ya no los usa la web. |

## Criterios de aceptación

1. [ ] `/register` → completar "Club Río" → aterriza en `/admin` con el panel vacío; `/admin/settings` muestra `/app/club-rio`.
2. [ ] Crear una cancha; abrir `/app/club-rio` en incógnito → pedir turno → aparece PENDING en `/admin`; confirmar.
3. [ ] Loguearse como `admin@demo.com` → no ve la cancha ni el pedido de Club Río; `/app/complejo-demo` sigue funcionando.
4. [ ] `/app/no-existe` muestra "Complejo no encontrado".
5. [ ] `/` y `/login` con sesión → `/admin`; `/courts` y `/bookings` → 404.
6. [ ] Loguearse como `ana@demo.com` (PLAYER) → `/admin` muestra `AdminForbidden`.

## Fuera de alcance

- Invitar a un segundo admin desde el panel (hoy: CLI `admin:promote <email> <slug>`).
- Editar el slug o la zona horaria.
- Selector de complejo para un admin con varios.
- Cuentas de jugador en la web.
