# 02 — Auth: registro, login, sesión

## Objetivo

Emitir y validar JWTs para identificar al jugador en cada request. Contraparte de [`web/docs/01-auth.md`](../../web/docs/01-auth.md).

## Endpoints

### `POST /auth/register` — `@Public()` — alta de complejo

> **Multi-complejo (docs/15-multi-complex.md):** el registro ya no crea un jugador sino **un complejo con su primer administrador**. Body `RegisterComplexDto { complexName, complexAddress, timezone, name, email, phone?, password }`; respuesta con `user.role = 'ADMIN'` y `user.complexId`. Detalle, transacción y slug en `15-multi-complex.md`. Lo que sigue describe el resto del módulo.

```ts
// 201
{ data: { accessToken: string; expiresAt: string; user: User } }

// 400 VALIDATION_ERROR   details por campo
// 409 EMAIL_ALREADY_EXISTS "Ya existe una cuenta con este email."
```

`User` en la respuesta: `{ id, name, email, phone?, role, complexId }` — **nunca** `passwordHash`.

### `POST /auth/login` — `@Public()`

```ts
// Body (LoginDto)
{ email: string; password: string }

// 200
{ data: { accessToken: string; expiresAt: string; user: User } }

// 400 VALIDATION_ERROR
// 401 INVALID_CREDENTIALS "Email o contraseña incorrectos."
```

Mismo mensaje y mismo status tanto si el email no existe como si la contraseña es incorrecta. Para evitar timing attacks triviales, si el email no existe igual se ejecuta `argon2.verify` contra un hash dummy.

### `POST /auth/logout`

```ts
// Auth: Bearer
// 204 sin body
```

En MVP es un no-op del lado del servidor (no hay blacklist de tokens). Existe para que la web tenga un punto único y para poder agregar revocación después sin cambiar el cliente.

### `GET /auth/me`

```ts
// Auth: Bearer
// 200
{ data: User }

// 401 UNAUTHORIZED
```

Lee el usuario de la DB por `sub` del token (no del payload) para reflejar cambios de nombre/teléfono. Si el usuario fue borrado → `401 UNAUTHORIZED`.

## DTOs

```ts
export class RegisterDto {
  @IsString() @Length(2, 60) @Transform(({ value }) => value?.trim())
  name!: string;

  @IsEmail() @Transform(({ value }) => value?.trim().toLowerCase())
  email!: string;

  @IsOptional() @Matches(/^\+?\d{8,15}$/) @Transform(({ value }) => (value === '' ? undefined : value))
  phone?: string;

  @IsString() @Length(8, 72)
  password!: string;
}

export class LoginDto {
  @IsEmail() @Transform(({ value }) => value?.trim().toLowerCase())
  email!: string;

  @IsString() @MinLength(1)
  password!: string;
}
```

Mensajes de validación en español (`{ message: 'Mínimo 2 caracteres' }` en cada decorador). El `ValidationPipe` global los agrupa en `details: { name: ['Mínimo 2 caracteres'] }`.

## Reglas de negocio

### Hashing

- `argon2id` con parámetros por defecto de la lib (`memoryCost: 65536, timeCost: 3, parallelism: 4`).
- Límite de 72 chars en password por consistencia con bcrypt en caso de migración; argon2 no lo necesita.

### JWT

- Algoritmo `HS256`, secreto `JWT_SECRET` (≥ 32 chars, validado al arrancar).
- Payload: `{ sub: user.id, email: user.email, role, complexId }` + `iat` / `exp` automáticos.
- `expiresIn = JWT_EXPIRES_IN` (default `7d`). `expiresAt` en la respuesta se calcula desde `exp` del token firmado y se devuelve en ISO UTC (`Z`), no en el timezone del complejo — es un dato técnico, no de negocio.
- Sin refresh tokens en MVP.

### Guard global

```ts
// app.module.ts
{ provide: APP_GUARD, useClass: JwtAuthGuard }
```

`JwtAuthGuard` extiende `AuthGuard('jwt')` y hace bypass cuando el handler o la clase tienen metadata `isPublic` (decorador `@Public()`). Un token ausente, malformado, con firma inválida o vencido → `401 UNAUTHORIZED` con mensaje "Tu sesión expiró. Volvé a ingresar."

`JwtStrategy.validate(payload)` devuelve `{ id: payload.sub, email: payload.email }` sin ir a DB (rápido). Solo `GET /auth/me` consulta la DB.

### Registro

Ver `15-multi-complex.md` › `POST /auth/register`: `findByEmail` → hash → transacción (complejo + admin) → token. `P2002` en `email` → `409`; en `slug` → reintento.

## Diseño interno

```
AuthController
  ├── register(dto)  → AuthService.register
  ├── login(dto)     → AuthService.login
  ├── logout()       → 204
  └── me(@CurrentUser) → UsersService.findByIdOrThrow → toUserResponse

AuthService
  ├── register(dto): Promise<AuthResult>
  ├── login(dto): Promise<AuthResult>
  └── private issueToken(user): { accessToken, expiresAt }

UsersService (sin controller)
  ├── findByEmail(email)
  └── findByIdOrThrow(id)      // lanza AppException(UNAUTHORIZED) si no existe
                               // (el alta vive en AuthService.register)
```

`AuthResult = { accessToken: string; expiresAt: string; user: User }` — el serializer `toUserResponse(user)` vive en `shared/serializers/`.

## Tests

### Unit (`auth.service.spec.ts`)

- `register` con email existente → `EMAIL_ALREADY_EXISTS`.
- `register` hashea la password (no la guarda en claro) y devuelve token válido.
- `login` con email inexistente → `INVALID_CREDENTIALS` y **llama a `argon2.verify` igual**.
- `login` con password incorrecta → `INVALID_CREDENTIALS`.
- `login` correcto → token cuyo `sub` es el id del usuario.

### E2E (`test/e2e/auth.e2e-spec.ts`)

- [ ] `POST /auth/register` con body válido → `201`, `data.user` sin `passwordHash`, `data.accessToken` decodificable.
- [ ] `POST /auth/register` con email en mayúsculas → se guarda en minúsculas; volver a registrar el mismo en minúsculas → `409`.
- [ ] `POST /auth/register` con `phone: ''` → `201` y `user.phone` ausente.
- [ ] `POST /auth/register` con password de 7 chars → `400` con `details.password`.
- [ ] `POST /auth/register` con campo extra (`role: 'ADMIN'`) → `400` (`forbidNonWhitelisted`).
- [ ] `POST /auth/login` correcto → `200`. Incorrecto (email o password) → `401 INVALID_CREDENTIALS` con el mismo body en ambos casos.
- [ ] `GET /auth/me` sin header → `401 UNAUTHORIZED`. Con token vencido → `401`. Con token válido → `200` y datos actuales.
- [ ] `POST /auth/logout` con token → `204`. Sin token → `401`.
- [ ] Cualquier endpoint protegido con `Authorization: Bearer basura` → `401` con envelope de error correcto (no stack trace).

## Fuera de alcance (MVP)

- Refresh tokens / rotación.
- Blacklist o revocación de tokens al hacer logout.
- Recuperación de contraseña (`/auth/forgot-password`, `/auth/reset-password`).
- Verificación de email.
- Login social.
- Rate limiting en `/auth/*` (post-MVP: `@nestjs/throttler`, 10 req/min por IP).
- Cambio de contraseña / edición de perfil (`PATCH /auth/me`).
