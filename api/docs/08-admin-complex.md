# 08 — Admin · Complejo

## Objetivo

Permitir editar los datos del complejo desde el panel: nombre, dirección, ventana de cancelación, confirmación automática de los pedidos públicos, redes sociales y **logo**. Contraparte de [`web/docs/09-admin-settings.md`](../../web/docs/09-admin-settings.md).

## Endpoints

### `PATCH /admin/complex` — `@Roles('ADMIN')`

```ts
// Body (UpdateComplexDto): subconjunto de
{
  name?: string;                     // trim, 2–80
  address?: string;                  // trim, 2–160
  cancellationWindowHours?: number;  // entero 0–168
  autoConfirmPublicRequests?: boolean;
  instagramUrl?: string | null;      // URL con protocolo; null la borra
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
  youtubeUrl?: string | null;
  contactWhatsapp?: string | null;   // se canoniza a '+' + dígitos (8–15); null lo borra
  bankCbu?: string | null;           // exactamente 22 dígitos; vacío o null lo borra
  bankAlias?: string | null;         // 6–20: letras, dígitos, '.' y '-'; vacío o null lo borra
  bankHolderName?: string | null;    // hasta 100; vacío o null lo borra
}

// 200
{ data: Complex }   // mismo shape que GET /complex

// 400 VALIDATION_ERROR   (timezone, logoUrl u otro campo → forbidNonWhitelisted; body vacío → details._: ['No hay cambios'])
// 403 FORBIDDEN
```

No hay `GET /admin/complex`: el panel usa `GET /complex` (el complejo del admin autenticado). > **Multi-complejo (docs/15-multi-complex.md):** el controller recibe `@ComplexId()` y llama `ComplexService.update(complexId, data)`; el cache es por id y se invalida solo ese complejo. La respuesta incluye `slug` (inmutable, no editable por este endpoint).

### `POST /admin/complex/logo` — `@Roles('ADMIN')`

```ts
// Request: multipart/form-data con un único campo `logo`
//   PNG, JPG o WebP · máximo 2 MB (MAX_LOGO_BYTES)

// 200
{ data: Complex }   // con logoUrl ya apuntando al objeto nuevo

// 400 VALIDATION_ERROR   details.logo: ['Elegí un archivo']
// 413 FILE_TOO_LARGE     lo corta multer con `limits.fileSize`
// 415 UNSUPPORTED_FILE_TYPE
// 502 LOGO_UPLOAD_FAILED el bucket respondió mal o no respondió
// 403 FORBIDDEN
```

### `DELETE /admin/complex/logo` — `@Roles('ADMIN')`

```ts
// 200
{ data: Complex }   // logoUrl: null

// 403 FORBIDDEN
```

Idempotente: borrar el logo de un complejo que no tiene devuelve `200` igual.

Los dos devuelven el `Complex` entero (y no `204`) para que el panel reescriba la cache de
`['complex']` con la misma función que usa `PATCH`, sin un refetch.

## DTOs

```ts
export class UpdateComplexDto {
  @IsOptional() @IsString() @Length(2, 80) @Transform(trim) name?: string;
  @IsOptional() @IsString() @Length(2, 160) @Transform(trim) address?: string;
  @IsOptional() @IsInt() @Min(0) @Max(168) cancellationWindowHours?: number;
  @IsOptional() @IsBoolean() autoConfirmPublicRequests?: boolean;
  @IsOptional() @IsUrl({ require_protocol: true }) @Transform(trim) instagramUrl?: string | null;
  // idem facebookUrl / tiktokUrl / youtubeUrl
  // WhatsApp público de contacto (botón "Inscribirme" de los torneos, docs/22-tournaments.md).
  // Mismo formato que customers.phone: normalizePhone() y después la regex.
  @IsOptional() @Matches(/^\+\d{8,15}$/) @Transform(normalizePhone) contactWhatsapp?: string | null;
  // Datos para transferir (docs/23-public-payment-link.md). `blankToNull`: '' → null.
  @IsOptional() @Matches(/^\d{22}$/) @Transform(blankToNull) bankCbu?: string | null;
  @IsOptional() @Matches(/^[A-Za-z0-9.-]{6,20}$/) @Transform(blankToNull) bankAlias?: string | null;
  @IsOptional() @MaxLength(100) @Transform(blankToNull) bankHolderName?: string | null;
}
```

`timezone` no está en el DTO: con `forbidNonWhitelisted` cualquier intento de mandarlo es `400` con `details.timezone: ['property timezone should not exist']`.

**`logoUrl` tampoco está en el DTO, y es a propósito.** Es de solo lectura: la única forma de
cambiarlo es subir un archivo. Aceptar una URL arbitraria convertiría el panel en una superficie
de hotlinking y phishing renderizada en la página pública que el complejo le pasa a sus clientes,
y el `<img>` filtraría la IP y el referrer de cada visitante al host que el admin haya escrito.
`forbidNonWhitelisted` ya devuelve `400 details.logoUrl` sin escribir una línea; hay un e2e que
lo fija para que no se vuelva accidental.

## Reglas de negocio

- `ComplexService.update(id, data)`: `prisma.complex.update({ where: { id } })` → **`invalidate(id)`** del cache en memoria → devolver el nuevo.
- El cache de `ComplexService` es por proceso. Con una sola instancia de la API (MVP) la invalidación es suficiente. Si se escala horizontalmente, el cache pasa a TTL corto (30 s) o se elimina; queda anotado en `ComplexService`.
- `cancellationWindowHours` se evalúa en cada `PATCH /bookings/:id/cancel` a partir de `findByIdOrThrow(booking.court.complexId)`, así que el cambio rige de inmediato para todas las reservas del complejo.
- `timezone` sigue siendo solo por seed. Cambiarlo con datos existentes desplazaría `openTime` / `closeTime` respecto de las reservas ya persistidas en UTC.
- `logoUrl` se expone **sin auth** en `GET /public/c/:slug/complex` (`docs/09-public-requests.md`): es lo que pinta `/app/[slug]`, que se sirve a clientes sin cuenta. No es un dato sensible — está a la vista en cada pantalla del link público.

- **Datos bancarios** (`bankCbu` / `bankAlias` / `bankHolderName`): columnas `VARCHAR(22/20/100)` nullables, independientes entre sí. Se serializan en `toComplexResponse` (respuestas del panel, `GET /complex` y `PATCH`) pero **no** en `GET /public/c/:slug/complex`: el único endpoint público que los devuelve es `GET /public/c/:slug/bookings/:id/payment` (`docs/23-public-payment-link.md`).

### Logo

Lo sube `ComplexLogoService` (`modules/admin-complex/complex-logo.service.ts`) apoyado en
`StorageModule` (`docs/18-storage.md`). Reglas:

- **Formato**: PNG, JPEG o WebP, decidido por los **primeros bytes del archivo**, no por el
  `mimetype` del multipart — ese lo elige el cliente, así que confiarle el formato es lo mismo que
  no validar. Un `.html` renombrado a `.png` es `415`. **SVG no se acepta** (ver `18-storage.md`).
- **Tamaño**: 2 MB, cortado por `limits.fileSize` de `FileInterceptor` antes de bufferear el
  archivo entero.
- **Key**: `complexes/<complexId>/logo-<8 hex al azar>.<ext>`. El prefijo por complejo deja todo
  lo de un inquilino junto; el sufijo al azar hace que cada subida sea una URL nueva, que es el
  cache-busting (el CDN del bucket cachea por path, y el objeto se sirve `immutable`).
- **Orden de escritura**: subir → guardar `logoUrl` → borrar el objeto anterior *best-effort*. Al
  revés, un fallo de Supabase dejaría al complejo apuntando a un objeto que no existe; y fallar el
  request porque no se pudo borrar el objeto viejo sería un error visible por algo que ya salió
  bien. Un huérfano en el bucket es el costo aceptado, y queda logueado como `warn`.
- `ComplexLogoService` escribe a través de `ComplexService.update()`, así que **invalida el cache
  del complejo** igual que el `PATCH`.

## Diseño interno

```
AdminComplexController (@Roles('ADMIN'))
  ├── PATCH  /admin/complex      → ComplexService.update(dto)        → toComplexResponse
  ├── POST   /admin/complex/logo → ComplexLogoService.replace(file)  → toComplexResponse
  │     @UseInterceptors(FileInterceptor('logo', { storage: memoryStorage(), limits }))
  └── DELETE /admin/complex/logo → ComplexLogoService.remove()       → toComplexResponse

AdminComplexModule imports: ComplexModule, StorageModule
                 providers: ComplexLogoService
```

`ComplexService` gana `update()` e `invalidate()` (este último ya existe).

El archivo nunca toca el disco (`memoryStorage()`): llega como `Buffer`, se valida y se sube.
El endpoint no tiene `@Body()` DTO, así que el `ValidationPipe` global no participa; toda la
validación vive en `ComplexLogoService`, en un solo lugar.

**`FileInterceptor` no necesita que `multer` esté en `package.json`**: es dependencia directa de
`@nestjs/platform-express`, que lo requiere desde adentro. Sí hace falta `@types/multer` en
`devDependencies` para que `Express.Multer.File` tipe bajo `strict`.

Cuando multer corta por tamaño, `transformException` de `@nestjs/platform-express` lo convierte en
`PayloadTooLargeException` (413) — no en un `AppException`. Por eso `HttpExceptionFilter` mapea
`413 → FILE_TOO_LARGE` y `415 → UNSUPPORTED_FILE_TYPE` en `CODE_BY_STATUS`: sin eso un archivo
grande se vería como un `500 INTERNAL_ERROR` con el mensaje genérico.

## Tests

### Unit (`complex.service.spec.ts`)

- [ ] `update` invalida el cache: `getCurrent()` después de `update` devuelve el valor nuevo aunque antes estuviera cacheado.
- [ ] `update({})` → `VALIDATION_ERROR` `details._`.

### E2E (`admin-complex.e2e-spec.ts`)

- [ ] `PATCH /admin/complex { name: 'Complejo Norte' }` → 200; `GET /complex` (como `ana`) devuelve el nombre nuevo en la **misma** instancia (cache invalidado).
- [ ] `PATCH { cancellationWindowHours: 2 }`: una reserva de `ana` para mañana 17:00 con Clock en hoy 15:00 se puede cancelar (`200`); `PATCH { cancellationWindowHours: 48 }` → la misma cancelación (otra reserva equivalente) → `422 CANCELLATION_WINDOW_EXCEEDED` con "48 horas" en el mensaje.
- [ ] `PATCH { timezone: 'UTC' }` → 400 `details.timezone`. `PATCH { cancellationWindowHours: 200 }` → 400. `PATCH {}` → 400.
- [ ] `ana` → 403. Sin token → 401.
- [ ] Datos bancarios: `PATCH` con CBU, alias y titular válidos → 200 y los devuelve; CBU de 21 dígitos / alias corto / con espacios / titular de 101 → 400; vacío → `null` (el alias se recorta); no aparecen en `GET /public/c/:slug/complex`.

### E2E del logo (mismo archivo, con `STORAGE_PROVIDER=stub`)

- [ ] `POST /admin/complex/logo` con un PNG de 1×1 → 200 y `logoUrl` con la forma
      `…/complexes/<uuid>/logo-<8 hex>.png`. `GET /complex` (misma instancia, cache invalidado) y
      `GET /public/c/complejo-demo/complex` (sin token) lo devuelven.
- [ ] Segunda subida → URL distinta y en el provider queda **un solo** objeto bajo ese prefijo.
- [ ] `DELETE` → 200 con `logoUrl: null` y sin objetos; un segundo `DELETE` → 200 (idempotente).
- [ ] Un GIF mandado como `logo.png` / `image/png` → 415 (esto prueba el sniffer).
- [ ] Un SVG → 415. Sin archivo → 400 `details.logo`.
- [ ] Un buffer de más de 2 MB → **413**, no 500 (esto prueba el mapeo del filtro).
- [ ] `PATCH /admin/complex { logoUrl: '…' }` → 400 `details.logoUrl`.
- [ ] El logo de un complejo no aparece en el `GET /complex` del otro.
- [ ] `ana` → 403 en los dos endpoints. Sin token → 401.

## Fuera de alcance

- Editar `timezone`, contacto, horario general.
- Editar el `slug`.
- Redimensionar o recortar el logo: se guarda el archivo tal cual, con el tope de 2 MB.
- Limpiar `complexes/<id>/` del bucket al borrar un complejo: hoy no hay baja de complejos.
