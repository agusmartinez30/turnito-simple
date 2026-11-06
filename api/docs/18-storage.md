# 18 — Storage de archivos

## Objetivo

Guardar los archivos que suben los admins —hoy solo el **logo del complejo**
([`08-admin-complex.md`](./08-admin-complex.md))— fuera de la base y fuera del disco del
contenedor, en un **bucket público de Supabase Storage**, detrás de una interfaz que permita
cambiar de proveedor sin tocar el resto de la API.

Contraparte de [`web/docs/19-branding.md`](../../web/docs/19-branding.md).

## Por qué un bucket y no la base ni el disco

- La API corre en Railway con **una sola réplica**, pero el disco del contenedor es efímero: se
  pierde en cada deploy. Un logo guardado ahí sobrevive hasta el próximo push.
- Guardar bytes en Postgres funciona, pero mete binarios en cada backup y obliga a servirlos desde
  la API, que pasa a ser el CDN de imágenes de todos los links públicos.
- El bucket es **público** porque el logo lo ve cualquier cliente sin cuenta que abra
  `/app/[slug]`, igual que los colores de marca. Firmar cada lectura agregaría latencia y rompería
  el cache del layout público para proteger algo que ya está a la vista.

## Módulo

```
src/modules/storage/
├── storage.module.ts                      # elige el provider por STORAGE_PROVIDER
├── image-type.ts                          # sniffer de magic bytes + allowlist + extensión
├── image-type.spec.ts
└── providers/
    ├── storage-provider.interface.ts      # STORAGE_PROVIDER_TOKEN + IStorageProvider
    ├── stub.provider.ts                   # en memoria: dev y e2e
    ├── supabase.provider.ts
    └── supabase.provider.spec.ts
```

Es el mismo patrón que `modules/whatsapp/providers/` (`docs/13-whatsapp.md`): un token de DI, un
proveedor real y un stub, y una `useFactory` que elige por env. No vive en `src/shared/` porque
ahí van helpers puros y serializers, no un módulo con DI.

```ts
export const STORAGE_PROVIDER_TOKEN = Symbol('STORAGE_PROVIDER');

export interface UploadInput {
  /** Key dentro del bucket, ej. `complexes/<complexId>/logo-1a2b3c4d.png`. */
  key: string;
  body: Buffer;
  contentType: string;
}

export interface IStorageProvider {
  /** Sube (o pisa) el objeto y devuelve su URL pública absoluta. */
  upload(input: UploadInput): Promise<string>;
  /** Idempotente: borrar algo que ya no está no es un error. */
  remove(key: string): Promise<void>;
  /** Key a partir de una URL pública guardada. `null` si la URL no es de este bucket. */
  keyFromUrl(url: string): string | null;
}
```

`keyFromUrl` es lo que permite tener **una sola columna** (`Complex.logoUrl`) en vez de guardar
también la key: para reemplazar o borrar, el service deriva la key de la URL que ya tenía. El
costo aceptado es que si algún día cambia el proyecto o el nombre del bucket, las URLs viejas
dejan de parsear y el borrado queda en no-op — un objeto huérfano por complejo, una vez.

## Validación de imágenes — `image-type.ts`

```ts
export const ALLOWED_LOGO_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;
export function sniffImageType(buffer: Buffer): LogoImageType | null;
```

Mira los primeros bytes: `89 50 4E 47 0D 0A 1A 0A` (PNG), `FF D8 FF` (JPEG), `RIFF` + `WEBP` en
los offsets 0 y 8 (WebP). Todo lo demás es `null` → `415 UNSUPPORTED_FILE_TYPE`.

**No se mira el `mimetype` del multipart**: ese header lo elige el cliente. Con una allowlist sobre
ese valor, un `.html` renombrado a `.png` pasaría, y la validación sería decorativa.

**SVG no se acepta.** Un SVG es un documento ejecutable (`<script>`, `<foreignObject>`, `<use
href>` externo). Servido desde el dominio del bucket no llega a las cookies de la app, pero sigue
siendo una página arbitraria controlada por el usuario, alojada en un dominio que el complejo le
pasa a sus clientes — phishing y redirecciones. Sanitizarlo bien pide DOMPurify + jsdom del lado
del servidor. PNG con transparencia cubre cualquier logo real.

## Proveedor Supabase — `fetch` a mano, sin SDK

`@supabase/supabase-js` es el SDK entero de la plataforma (auth + postgrest + realtime) para dos
llamadas HTTP, en un proceso que ya carga Baileys. Node 22 trae `fetch` y `AbortSignal.timeout`
globales, y el repo ya tiene la doctrina de escribir clientes HTTP finos a mano
(`web/src/lib/api/client.ts`, y el generador de color de `19-branding.md` sobre una librería de
color). Lo que se paga a cambio: el mapeo de errores y cualquier cambio futuro de la API de
Storage son nuestros. Por eso `supabase.provider.spec.ts` fija la forma exacta del request —
un cambio aparece como test en rojo, no como un 500 silencioso.

```http
POST   {SUPABASE_URL}/storage/v1/object/{bucket}/{key}
       Authorization: Bearer {service_role}
       apikey: {service_role}
       Content-Type: image/png
       Cache-Control: max-age=31536000
       x-upsert: true
       <cuerpo binario crudo, no multipart>

DELETE {SUPABASE_URL}/storage/v1/object/{bucket}/{key}     # 404 se ignora

URL pública (sin firmar, es solo string):
       {SUPABASE_URL}/storage/v1/object/public/{bucket}/{key}
```

**Un objeto borrado puede seguir respondiendo 200 un rato.** El `Cache-Control` de un año hace que
el CDN de Supabase (Cloudflare) siga sirviendo la copia vieja después del `DELETE`, aunque el
objeto ya no esté en el bucket. No es un problema: cuando se borra el logo, `logoUrl` queda en
`null` y nadie pide más esa URL; y cuando se reemplaza, la key nueva es otra. Es justamente el
motivo del sufijo al azar — con una key fija, el CDN seguiría mostrando el logo anterior.

Cualquier otra respuesta que no sea `2xx` se loguea con el body y se convierte en
`502 LOGO_UPLOAD_FAILED` ("No pudimos guardar el logo. Probá de nuevo en un momento."). Es `502` y
no `500` porque la falla es de una dependencia externa, y porque le dice al admin que reintente.

## Proveedor stub

Un `Map` en memoria. Devuelve URLs con origen `https://storage.stub.local`, deliberadamente
inalcanzables: en la web, `ComplexMark` cae al ícono genérico si la imagen no carga, así que un
entorno sin bucket real degrada bien. Expone `keys()` para que los e2e verifiquen que el objeto
anterior se borró. Es el default (`STORAGE_PROVIDER=stub`), igual que `WHATSAPP_PROVIDER`.

## Configuración (env)

| Variable                    | Ejemplo                        | Notas                                                                        |
| --------------------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| `STORAGE_PROVIDER`          | `stub`                         | `stub` (default, en memoria) o `supabase`                                    |
| `SUPABASE_URL`              | `https://abcdefgh.supabase.co` | Obligatoria con `supabase`                                                   |
| `SUPABASE_SERVICE_ROLE_KEY` | (secreto)                      | Obligatoria con `supabase`. **Solo servidor**                                |
| `SUPABASE_STORAGE_BUCKET`   | `complex-logos`                | Default `complex-logos`; el bucket tiene que existir y estar marcado público |
| `SUPABASE_PRIVATE_BUCKET`   | `private-documents`            | Default `private-documents`; privado, solo imágenes: fotos del DNI de torneos |
| `SUPABASE_PAYMENT_PROOFS_BUCKET` | `payment-proofs`          | Default `payment-proofs`; privado, PDF/JPG/PNG: comprobantes de pago |

El `superRefine` de `env.schema.ts` exige las credenciales cuando el proveedor es `supabase`, así
que una configuración incompleta **no arranca** en vez de fallar con un 503 en la primera subida.
Con `STORAGE_PROVIDER=stub` en producción se loguea un `warn` al arrancar, pero el proceso levanta:
que el default rompa un deploy existente sería peor.

La `service_role` key **bypassea RLS de todo el proyecto de Supabase**, no solo de Storage. Nunca
va con prefijo `NEXT_PUBLIC_`, nunca llega a `web/`, nunca se loguea.

## Setup manual del bucket

1. Storage › **New bucket**, nombre `complex-logos`, **Public bucket: ON**, _file size limit_ 2 MB,
   _allowed MIME types_ `image/png, image/jpeg, image/webp`. Los dos últimos son defensa en
   profundidad: la API ya los valida, pero un tope del bucket acota el daño si la key se filtra.
   Sirve igual cualquier bucket público que ya exista — basta apuntar `SUPABASE_STORAGE_BUCKET` a
   él. Las keys van bajo `complexes/<id>/`, así que conviven sin chocar con otro contenido.
2. Project Settings › API: _Project URL_ → `SUPABASE_URL`, secreto **`service_role`** →
   `SUPABASE_SERVICE_ROLE_KEY`. Nunca la `anon`.
3. **Ninguna policy.** La `service_role` saltea RLS, así que la escritura no necesita policy; y un
   bucket público sirve `GET /object/public/...` sin key ni policy. Si el proyecto vino con
   policies que le dan a `anon` permisos de escritura sobre el bucket, **hay que borrarlas**:
   dejarían que cualquiera con la key pública pise el logo de un complejo.

## Bucket privado — documentos (DNI)

Las fotos del DNI de jugadores de torneos (docs/22-tournaments.md › Link del delegado) **no** van al bucket público:

- `SUPABASE_PRIVATE_BUCKET` (default `private-documents`) tiene que existir y **no** estar marcado público. Recomendado: límite 8 MB y MIME `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`.
- `IStorageProvider.uploadPrivate` / `removePrivate` / `signedUrl(key, expiresInSec)`, con un selector opcional `bucket: 'documents' | 'paymentProofs'` (default `documents`, así que los call sites del DNI no cambian). Los comprobantes de pago usan **otro** bucket (sección siguiente). Se guarda la **key**; la lectura es con `POST /storage/v1/object/sign/{bucket}/{key}` `{ expiresIn }` → `origin + /storage/v1 + signedURL` (10 min, se piden al abrir el visor del panel, nunca en listados).
- Stub: `Map` aparte por bucket (`privateKeys()` = documentos, `paymentProofKeys()` = comprobantes); `signedUrl` devuelve un `data:` URL, así en dev/tests las fotos se ven sin bucket.
- Error de Storage → `LOGO_UPLOAD_FAILED` (502, "No pudimos guardar el archivo…"), igual que el bucket público.

### Comprobantes de pago (PDF, JPG y PNG)

Los comprobantes del link público de pago ([`23-public-payment-link.md`](./23-public-payment-link.md)) van a un **bucket privado dedicado**, `SUPABASE_PAYMENT_PROOFS_BUCKET` (default `payment-proofs`), y no al de documentos: `private-documents` tiene el MIME restringido y rechazaba el PDF con `415 invalid_mime_type`. Usan los mismos métodos `uploadPrivate` / `removePrivate` / `signedUrl` con `bucket: 'paymentProofs'`:

- Key: `payment-proofs/<bookingId>/<16 hex al azar>.<pdf|jpg|png>`. Se guarda la key en `payment_proofs.file_key`; nunca una URL.
- Lectura: solo el admin, con `signedUrl(key, 600)` (10 min), pedida al abrir un comprobante.
- Si el INSERT del comprobante falla, la API borra el objeto con `removePrivate` (*best-effort*).
- **Setup manual:** Storage › **New bucket**, nombre `payment-proofs`, **Public bucket: OFF**, _file size limit_ 5 MB, _allowed MIME types_ `application/pdf`, `image/jpeg`, `image/png` (si el bucket ya existía solo con PDF, hay que agregar los dos tipos de imagen o las capturas fallan con `invalid_mime_type`). Si usás otro nombre, apuntá `SUPABASE_PAYMENT_PROOFS_BUCKET` a él.
- El tope de la API es 5 MB y la API valida que la extensión (`.pdf`, `.jpg`, `.jpeg`, `.png`) coincida con los bytes (`%PDF-`, JPEG o PNG), vía `payment-proof-type.ts`; el límite y el MIME del bucket son defensa en profundidad.
- **Cambiar de bucket no migra objetos.** Un comprobante subido antes de este cambio al bucket `private-documents` quedaría con su key apuntando a un bucket donde ya no se busca. No se espera ninguno: en el entorno donde se detectó, Storage rechazaba los PDF, así que no llegó a persistir ninguno. Si existiera alguno, hay que copiarlo a `payment-proofs` con la misma key.

**Sniffer de PDF — `pdf-type.ts`.** `isPdf(buffer)` es `true` si el buffer arranca con los bytes `%PDF-`. Igual que con las imágenes, no se confía en el `mimetype` del multipart; además el endpoint exige extensión `.pdf`. Cualquier otra cosa → `415 UNSUPPORTED_FILE_TYPE`. Spec: `pdf-type.spec.ts`.

## Tests

### Unit

- [ ] `image-type.spec.ts`: headers de PNG / JPEG / WebP → su tipo; GIF, PDF, SVG, buffer vacío,
      buffer de 3 bytes y un `RIFF…WAVE` → `null`.
- [ ] `supabase.provider.spec.ts` (con `global.fetch` stubeado): URL, método y headers exactos del
      upload; la URL pública que devuelve; un `400` del bucket → `AppException LOGO_UPLOAD_FAILED`;
      `remove` se traga el `404` pero tira con `500`; `keyFromUrl` hace round-trip con su propia
      salida y devuelve `null` para otro host; los métodos privados con `bucket: 'paymentProofs'` pegan a
      `/object/payment-proofs/...` y `/object/sign/payment-proofs/...` (URL exacta) y sin selector
      siguen yendo a `private-documents`.
- [ ] `stub.provider.spec.ts`: documentos y comprobantes viven en buckets separados; firmar y borrar
      solo actúan dentro del bucket elegido.

### E2E

Los del logo viven en `admin-complex.e2e-spec.ts` (ver `08-admin-complex.md`), contra el stub.

## Fuera de alcance

- Redimensionar o convertir las imágenes (`sharp`): se guarda el archivo tal cual.
- Subidas directas del navegador con URL firmada: el archivo pasa por la API, que es donde está
  la validación y el único lugar con la `service_role` key.
- Cualquier archivo que no sea el logo del complejo.
