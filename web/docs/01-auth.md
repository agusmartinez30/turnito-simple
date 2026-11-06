# 01 — Auth: login, registro y sesión

## Objetivo

Identificar al jugador para que las reservas queden asociadas a su cuenta. Sin auth no hay "Mis reservas" ni cancelación.

## User stories

- Como jugador nuevo quiero **registrarme** con mi email para poder reservar turnos.
- Como jugador registrado quiero **iniciar sesión** para ver y gestionar mis reservas.
- Como jugador quiero que **la sesión persista** al recargar la página para no loguearme cada vez.
- Como jugador quiero **cerrar sesión** desde cualquier pantalla.
- Como jugador, si intento entrar a una pantalla protegida sin sesión, quiero que **me lleve al login y después me devuelva** a donde quería ir.

## Rutas / pantallas

| Ruta | Layout | Auth | Comportamiento |
|---|---|---|---|
| `/login` | `(public)` | No | Si ya hay sesión → redirect a `/admin` (o a `?next=`) |
| `/register` | `(public)` | No | Alta de complejo (`16-multi-complex.md`). Si ya hay sesión → redirect a `/admin` |
| `/api/auth/session` | route handler interno | — | `POST` setea cookie, `DELETE` la borra |

Rutas protegidas (`(app)/*`) sin sesión → `middleware.ts` redirige a `/login?next=<pathname>`.

## UI

### `/login`

- Card centrada, logo/nombre del complejo arriba.
- Form (`react-hook-form` + `zod`):
  - **Email** — `Input type="email"`, requerido.
  - **Contraseña** — `Input type="password"`, requerido, con toggle mostrar/ocultar.
  - Botón **"Ingresar"** — full width, `loading` mientras se envía.
- Link: "¿No tenés cuenta? **Registrate**" → `/register` (preserva `?next=`).
- Error de credenciales: `Alert variant="destructive"` arriba del form con el `message` de la API. No se marca qué campo falló.

### `/register`

> **Multi-complejo (docs/16-multi-complex.md):** el formulario de esta sección fue reemplazado por el alta de complejo (`RegisterForm` con bloques "Tu complejo" / "Tu cuenta", botón "Crear complejo"). Se conserva como referencia del comportamiento de errores.

- Mismo layout que login.
- Form:
  - **Nombre** — requerido, 2–60 caracteres.
  - **Email** — requerido, formato email.
  - **Teléfono** — opcional, solo dígitos/`+`, 8–15 caracteres. Texto de ayuda: "Para que el complejo pueda contactarte".
  - **Contraseña** — requerido, mínimo 8 caracteres.
  - **Repetir contraseña** — debe coincidir.
  - Botón **"Crear cuenta"**.
- Link: "¿Ya tenés cuenta? **Ingresá**" → `/login`.
- Error `EMAIL_ALREADY_EXISTS`: se muestra inline debajo del campo email ("Ya existe una cuenta con este email").
- Error `VALIDATION_ERROR`: se mapean los `details` a errores por campo con `setError` de RHF.

### Navbar (layout `(app)`)

- Nombre del complejo (link a `/`), links "Canchas" y "Mis reservas".
- `DropdownMenu` con el nombre del usuario → item "Cerrar sesión".

### Estados

| Estado | Comportamiento |
|---|---|
| Enviando | Botón deshabilitado con spinner; inputs deshabilitados. |
| Error de red | `Alert` genérico "No pudimos conectar con el servidor. Intentá de nuevo." |
| Sesión vencida (401 en cualquier request) | Se limpia la cookie y se redirige a `/login?next=<ruta>` con un `toast` "Tu sesión expiró". |

## Reglas de negocio y validaciones

### Validación cliente (zod)

```ts
const loginSchema = z.object({
  email: z.string().email('Ingresá un email válido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
});

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(60),
    email: z.string().email('Ingresá un email válido'),
    phone: z.string().regex(/^\+?\d{8,15}$/, 'Solo números, 8 a 15 dígitos').optional().or(z.literal('')),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden',
  });
```

### Estrategia de sesión

**Decisión: cookie `httpOnly` seteada por un route handler de Next.**

Flujo:

1. El form llama a `POST ${API}/auth/login` (o `/auth/register`) directamente desde el cliente.
2. La API responde `{ data: { accessToken, user } }`.
3. El cliente hace `POST /api/auth/session` (route handler de Next, mismo origen) con `{ accessToken }`. El handler setea la cookie `session` con flags `httpOnly`, `secure` (en prod), `sameSite=lax`, `path=/`, `maxAge` igual a la expiración del token.
4. El `user` se guarda en el cache de TanStack Query bajo `['auth', 'me']`.
5. `middleware.ts` verifica presencia de la cookie para rutas `(app)/*`. No valida el JWT (eso lo hace la API en cada request); solo redirige si no existe.
6. Para llamar a la API desde el cliente con el token: el cliente HTTP (`src/lib/api/client.ts`) llama a `GET /api/auth/session` que devuelve `{ accessToken }` leyendo la cookie, y lo cachea en memoria. Alternativa más simple si se prefiere: hacer todas las llamadas a la API a través de route handlers de Next que reenvíen con el token. **Elegir la primera** (menos código); documentar si se cambia.

Por qué cookie httpOnly y no `localStorage`:
- El token no es accesible desde JS → menor superficie ante XSS.
- Permite proteger rutas en `middleware.ts` sin flash de contenido.
- Preparado para SSR si más adelante se quiere renderizar datos en el servidor.

### Logout

1. `POST ${API}/auth/logout` (best-effort; si falla, igual se continúa).
2. `DELETE /api/auth/session` → borra la cookie.
3. `queryClient.clear()`.
4. Redirect a `/login`.

## Contrato API

### `POST /auth/register`

```ts
// Request
{ name: string; email: string; phone?: string; password: string }

// 201
{ data: { accessToken: string; expiresAt: string; user: User } }

// Errores: 400 VALIDATION_ERROR · 409 EMAIL_ALREADY_EXISTS
```

### `POST /auth/login`

```ts
// Request
{ email: string; password: string }

// 200
{ data: { accessToken: string; expiresAt: string; user: User } }

// Errores: 400 VALIDATION_ERROR · 401 INVALID_CREDENTIALS
```

### `POST /auth/logout`

```ts
// Auth: Bearer
// 204 sin body
```

### `GET /auth/me`

```ts
// Auth: Bearer
// 200
{ data: User }

// Errores: 401 UNAUTHORIZED
```

Se usa al montar el layout `(app)` para hidratar `['auth', 'me']` cuando el usuario llega con cookie pero sin cache (ej. recarga de página).

## Criterios de aceptación

- [ ] Un usuario nuevo completa el registro y queda logueado en `/` sin pasos intermedios.
- [ ] Registrar un email existente muestra el error inline en el campo email.
- [ ] Login con credenciales inválidas muestra el `Alert` y no revela si el email existe.
- [ ] Al recargar cualquier página protegida, la sesión se mantiene y el navbar muestra el nombre del usuario.
- [ ] Entrar a `/bookings` sin sesión redirige a `/login?next=/bookings`; al loguearse, vuelve a `/bookings`.
- [ ] Entrar a `/login` con sesión activa redirige a `/`.
- [ ] "Cerrar sesión" limpia la cookie, el cache y redirige a `/login`; volver atrás con el navegador no muestra datos del usuario.
- [ ] Un 401 en cualquier request de la app dispara el flujo de sesión expirada.

## Fuera de alcance (MVP)

- Recuperación / cambio de contraseña.
- Login social (Google, Apple).
- Verificación de email.
- Refresh tokens (el `accessToken` tiene expiración larga, ej. 7 días; al vencer se vuelve a loguear).
- Edición de perfil.
