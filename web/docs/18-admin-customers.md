# 18 — Admin · Clientes: ficha única por persona

## Objetivo

Que cada complejo tenga **su** lista de clientes. Un cliente nace solo cuando alguien pide un turno desde `/app/[slug]` (nombre, apellido y teléfono) o cuando lo carga el mostrador, y desde entonces toda reserva —pública, manual y turno fijo— cuelga de él. El cliente **no tiene cuenta**: no se registra, no inicia sesión, no tiene email ni contraseña.

Con eso el panel gana lo que hoy no puede responder: quién es esta persona, cuántas veces vino, cuánto facturó, cuánto debe.

## User stories

- Como cliente quiero **pedir un turno dejando mi nombre, apellido y teléfono**, sin crear ninguna cuenta.
- Como cliente quiero que **si vuelvo a pedir turno con el mismo teléfono** el complejo me reconozca.
- Como admin quiero **ver la lista de mis clientes** y buscar por nombre, apellido o teléfono.
- Como admin quiero **cargar un cliente a mano** cuando alguien cae al mostrador.
- Como admin quiero **cargar un turno eligiendo un cliente existente**, o crear uno nuevo sin salir del diálogo.
- Como admin quiero **abrir la ficha de un cliente** y ver sus turnos, lo que facturó, lo que pagó y lo que debe.
- Como admin quiero **corregir el nombre o el teléfono** de un cliente y que se refleje en todo su historial.
- Como admin quiero **archivar** a un cliente que ya no viene, para que deje de aparecer en el buscador, sin perder sus turnos.

## Rutas / pantallas

| Ruta | Layout | Auth | Descripción |
|---|---|---|---|
| `/admin/customers` | `(admin)` | `ADMIN` | Tabla de clientes con buscador |
| `/admin/customers/new` | `(admin)` | `ADMIN` | Alta |
| `/admin/customers/[id]` | `(admin)` | `ADMIN` | Ficha: datos, totales e historial |

La edición vive en la ficha (`CustomerForm` dentro de un `Dialog` / `Sheet`), no en una ruta aparte: la ficha es la pantalla donde el admin ya está mirando al cliente.

## UI

### `/admin/customers` — Tabla

**Header**: `PageHeader` título "Clientes", acción primaria **"Nuevo cliente"** → `/admin/customers/new`.

**Buscador**: `Input` con ícono de lupa, debounce 300 ms, mínimo 2 caracteres. Placeholder "Nombre, apellido o teléfono". El término viaja como `?q=` y se refleja en la URL para poder compartir el link.

**Tabs**: "Activos" (default) · "Archivados" · "Todos" → `?status=`.

**Tabla** (`CustomersTable`; en mobile, cards):

| Columna | Contenido |
|---|---|
| Cliente | `firstName lastName`; badge "Archivado" si corresponde |
| Teléfono | link `tel:`; "—" si no tiene |
| Turnos | `bookingsCount` (no canceladas), `tabular-nums` |
| Último turno | fecha local del turno más reciente; "—" si nunca vino |
| Alta | "App" o "Panel" según `source` |
| Acciones | "Ver ficha" → `/admin/customers/[id]` |

Orden: `firstName asc, lastName asc`.

### `CustomerForm` (alta y edición)

Mismo componente para `/admin/customers/new` y el diálogo de edición de la ficha. `react-hook-form` + `zod`, una sola columna.

- **Nombre** — `Input`, requerido, 2–60.
- **Apellido** — `Input`, opcional, 2–60. Ayuda: "Opcional, pero ayuda a no confundir clientes."
- **Teléfono** — `Input type="tel"`, opcional, 8 a 15 dígitos. Ayuda: "Es lo que identifica al cliente. Sin teléfono no le podemos mandar WhatsApp."
- **Nota** — `Textarea`, opcional, ≤ 280. Ayuda: "Interna del complejo; el cliente nunca la ve."

**Footer**: "Cancelar" / **"Crear cliente"** o **"Guardar cambios"** (`loading`). En edición el botón se habilita solo si el form está `dirty`.

**Errores**
- `VALIDATION_ERROR` → `setError` por campo desde `details`.
- `409 CUSTOMER_PHONE_ALREADY_EXISTS` → el form consulta `GET /admin/customers?q=<phone>&status=all` y muestra, arriba, la tarjeta del cliente real con su nombre y sus turnos, más un botón **"Ver ficha"** (en el alta suelta) o **"Usar este cliente"** (cuando el form vive dentro del `CustomerPicker`). El campo Teléfono queda marcado en error.

Tras guardar: toast "Cliente creado" / "Cambios guardados", `router.push('/admin/customers/<id>')`, e invalidar `['admin','customers']`, `['admin','bookings']`, `['admin','agenda']` y `['admin','dashboard']` — el nombre del cliente viaja en cada reserva.

### `/admin/customers/[id]` — Ficha

**Breadcrumb**: Clientes › {nombre}.

**Card "Datos"** — nombre y apellido en grande; teléfono como link `tel:` más botón "Enviar WhatsApp" (reusa `WhatsappMessageDialog` del detalle de reserva); nota; "Cliente desde {fecha}" y si lo cargó la app o el panel. Acciones: **"Editar"** y **"Archivar"** / **"Restaurar"**.

**Card "Resumen"** — cuatro números en `tabular-nums`:

| Dato | Qué es |
|---|---|
| Turnos | confirmados · pendientes · cancelados |
| Facturado | Σ `price` de los **confirmados** |
| Pagado | Σ pagos vigentes de todos sus turnos |
| Saldo | facturado − pagado; en rojo si es positivo, "a favor" si es negativo |

Si tiene turnos fijos activos, debajo: "Tiene {N} turno(s) fijo(s) activo(s)" con link a `/admin/recurring`.

**Card "Turnos"** — los últimos 20, más recientes primero: fecha y hora, cancha, estado, precio y estado de pago. Cada fila linkea a `/admin/bookings/[id]`. Al pie, "Ver todos sus turnos" → `/admin/customers/[id]` (la lista completa vive en la ficha; ya no hay listado global de reservas).

**Archivar** → `AlertDialog`: "¿Archivar a {nombre}? Deja de aparecer en el buscador y al cargar turnos. Sus turnos, pagos y turnos fijos se conservan tal cual." / "Sí, archivar". Si tiene turnos futuros o un turno fijo activo, el diálogo lo advierte pero **no** lo bloquea. Restaurar no pide confirmación.

### `CustomerPicker` (dentro de `AdminBookingDialog`)

Typeahead sobre `GET /admin/customers?q=&limit=10`, debounce 300 ms, `shouldFilter={false}`:

- Menos de 2 caracteres → "Escribí al menos 2 caracteres".
- Cada resultado: `Nombre Apellido` en negrita y el teléfono debajo.
- Último ítem, siempre presente: **`+ Crear cliente "<término>"`**. Al elegirlo se despliega un sub-formulario inline (Nombre / Apellido / Teléfono) con el término ya repartido: si parece un teléfono (`/^\+?\d{6,}$/`) va a Teléfono, si no a Nombre. Confirmar llama a `POST /admin/customers` y deja el cliente nuevo seleccionado.
- Con un cliente elegido, el picker se reemplaza por una tarjeta con su nombre y teléfono y un botón "Cambiar".

### Flujo público `/app/[slug]`

`PublicRequestDialog` pasa de dos campos a tres: **Nombre** (`autoComplete="given-name"`), **Apellido** (`family-name`) y **Teléfono** (`tel`), los tres obligatorios. El resto del diálogo no cambia. La pantalla de estado del pedido tampoco: la API sigue devolviendo `customer: { name, phone }`.

### Estados

| Pantalla | Loading | Empty | Error |
|---|---|---|---|
| Tabla | 6 filas skeleton | Sin `q`: "Todavía no hay clientes. Aparecen solos cuando alguien pide turno desde la app, o **cargá el primero**". Con `q`: "No encontramos clientes con ese dato." | `Alert` + "Reintentar" |
| Ficha | Skeleton de las tres cards | Sin turnos: "Todavía no reservó ningún turno." | 404 → "Cliente no encontrado" con link a `/admin/customers` |
| Picker | "Buscando…" con spinner | "No encontramos clientes con ese dato." + el ítem de crear | mensaje de la API en rojo |

## Reglas de negocio y validaciones

### Validación cliente (zod)

```ts
export const customerSchema = z.object({
  firstName: z.string().trim().min(2, 'Mínimo 2 caracteres').max(60, 'Máximo 60 caracteres'),
  lastName: z
    .string().trim().min(2, 'Mínimo 2 caracteres').max(60, 'Máximo 60 caracteres')
    .optional().or(z.literal('')),
  phone: z
    .string().trim().regex(/^\+?\d{8,15}$/, 'Solo números, 8 a 15 dígitos')
    .optional().or(z.literal('')),
  note: z.string().trim().max(280, 'Máximo 280 caracteres').optional(),
});
```

`''` en `lastName` / `phone` / `note` se envía como `null` para borrar el valor; `undefined` no toca el campo (PATCH parcial).

En el flujo público los tres campos son **obligatorios**:

```ts
export const publicRequestSchema = z.object({
  firstName: z.string().trim().min(2, 'Mínimo 2 caracteres').max(60, 'Máximo 60 caracteres'),
  lastName: z.string().trim().min(2, 'Mínimo 2 caracteres').max(60, 'Máximo 60 caracteres'),
  phone: z.string().trim().regex(/^\+?\d{8,15}$/, 'Solo números, 8 a 15 dígitos'),
});
```

### Reglas que aplica la API

- **El teléfono es la identidad** del cliente dentro del complejo: único cuando está presente. Se guarda canonizado como `'+'` más los dígitos, así `+54 9 11 0000 0077` y `+5491100000077` son la misma persona.
- **Varios clientes sin teléfono conviven**: la unicidad solo aplica a los que tienen uno.
- **Desde la app, el cliente se reusa**: si el teléfono ya existe, no se crea otro; se actualiza el nombre con el que acaba de dar la persona (el apellido solo si viene uno nuevo) y, si estaba archivado, se reactiva.
- **Desde el panel, el teléfono repetido avisa**: `409 CUSTOMER_PHONE_ALREADY_EXISTS`. La decisión de reusar es del admin, no automática.
- **Un cliente archivado no puede recibir turnos nuevos** desde el panel → `422 CUSTOMER_ARCHIVED`. Si pide turno desde la app, se reactiva solo.
- **Archivar no cancela nada**: ni turnos futuros ni turnos fijos.
- **No hay borrado.** Un cliente con historial no se elimina; se archiva.
- **Editar el nombre cambia todo el historial.** No hay snapshot del nombre en la reserva: corregir un error de tipeo se aplica hacia atrás, que es lo que se quiere.
- **Un cliente de otro complejo es un 404**, con el mismo mensaje que uno inexistente.
- **Un cliente puede tener dos turnos superpuestos** (dos canchas a la misma hora, para un grupo). No hay ninguna restricción al respecto.

Limitaciones conocidas, a propósito: `1100000077` y `5491100000077` se guardan como dos clientes distintos (no se infiere el código de país, porque fusionar a dos personas en silencio es peor que un duplicado visible); y la búsqueda no ignora acentos, así que "Perez" no encuentra a "Pérez".

## Contrato API

```ts
export type CustomerSource = 'PUBLIC' | 'ADMIN';

export interface AdminCustomer {
  id: string;
  firstName: string;
  lastName?: string;
  phone?: string;              // '+' + dígitos
  note?: string;
  isActive: boolean;           // false = archivado
  source: CustomerSource;
  createdAt: string;           // ISO con offset del complejo
  bookingsCount: number;       // no canceladas
  lastBookingAt?: string;
}

export interface CustomerStats {
  bookings: { confirmed: number; pending: number; cancelled: number };
  billed: number;              // Σ price de las CONFIRMED
  paid: number;                // Σ pagos vigentes
  balance: number;             // billed − paid; < 0 = saldo a favor
  activeRecurring: number;
}

export interface AdminCustomerDetail extends AdminCustomer {
  stats: CustomerStats;
  bookings: AdminBooking[];    // últimos 20, startsAt desc
}
```

El cliente de una reserva (`05-admin-overview.md`) pasa a ser:

```ts
export interface BookingCustomer {
  id: string;
  name: string;         // derivado: `${firstName} ${lastName ?? ''}`.trim()
  firstName: string;
  lastName?: string;
  phone?: string;
  isActive: boolean;
}
```

### `GET /admin/customers`

```ts
// Auth: Bearer · rol ADMIN
// Query: q? (>= 2 caracteres) · status? 'active' | 'archived' | 'all' (default 'active') · limit? 1–200 (default 100)
// 200
{ data: AdminCustomer[] }   // orden firstName asc, lastName asc
```

### `GET /admin/customers/:id`

```ts
// 200
{ data: AdminCustomerDetail }
// 404 NOT_FOUND   (inexistente o de otro complejo, mismo message)
```

### `POST /admin/customers`

```ts
// Request
{
  firstName: string;   // 2–60
  lastName?: string;   // 2–60
  phone?: string;      // 8–15 dígitos, con o sin '+'
  note?: string;       // <= 280
}

// 201
{ data: AdminCustomer }

// 400 VALIDATION_ERROR
// 409 CUSTOMER_PHONE_ALREADY_EXISTS   message: "Ya hay un cliente con ese teléfono."
```

### `PATCH /admin/customers/:id`

```ts
// Request: cualquier subconjunto de los campos de POST, más `isActive`.
// `lastName`, `phone` y `note` aceptan `null` para borrar.
// 200
{ data: AdminCustomer }

// 400 VALIDATION_ERROR      (incluye el body vacío: details._ = ['No hay cambios'])
// 404 NOT_FOUND
// 409 CUSTOMER_PHONE_ALREADY_EXISTS
```

### Cambios en endpoints existentes

`POST /admin/bookings` y `POST /admin/recurring-bookings` — el objeto `customer` se reemplaza por un id:

```ts
// Antes: customer: { userId } | { name, phone? }
// Ahora:
{ courtId: string; startsAt: string; customerId: string; price?: number; note?: string }

// 404 NOT_FOUND          cliente inexistente o de otro complejo
// 422 CUSTOMER_ARCHIVED  message: "Ese cliente está archivado."
```

`POST /public/c/:slug/requests` — `name` se parte en dos:

```ts
{ sport?: Sport; courtId?: string; startsAt: string; firstName: string; lastName: string; phone: string }
```

`GET /admin/users` **se elimina**: buscaba sobre la tabla global de usuarios y no encontraba a los clientes reales.

### Query keys y mutaciones

| Key | Endpoint | `staleTime` |
|---|---|---|
| `['admin', 'customers', 'list', params]` | `GET /admin/customers` | 1 min |
| `['admin', 'customers', id]` | `GET /admin/customers/:id` | 1 min |
| `['admin', 'customers', 'search', q]` | `GET /admin/customers?q=&limit=10` | 1 min |

| Mutación | `onSuccess` invalida |
|---|---|
| `useCreateCustomer` | `['admin','customers']` |
| `useUpdateCustomer` (incluye archivar / restaurar) | `['admin','customers']` · `['admin','bookings']` · `['admin','agenda']` · `['admin','dashboard']` |
| `useCreateAdminBooking` · `useCreateRecurringBooking` | lo de siempre, más `['admin','customers']` |

## Criterios de aceptación

- [ ] Pedir un turno desde `/app/<slug>` con nombre, apellido y teléfono crea el cliente y aparece en `/admin/customers` marcado como alta "App".
- [ ] Pedir un segundo turno con el **mismo teléfono** y otro nombre no crea un cliente nuevo: actualiza el nombre y la ficha muestra los dos turnos.
- [ ] Pedir un tercero escribiendo el teléfono con espacios y guiones cae en el mismo cliente.
- [ ] Crear un cliente desde el panel con un teléfono ya usado muestra la tarjeta del cliente existente y no duplica.
- [ ] Crear un cliente sin teléfono funciona, y crear un segundo sin teléfono también.
- [ ] En `/admin/agenda`, el picker encuentra al cliente por nombre, apellido y teléfono, y `+ Crear cliente` da de alta uno sin cerrar el diálogo.
- [ ] El detalle de una reserva tiene **Ver ficha** y lleva al cliente correcto.
- [ ] Un turno fijo cargado desde la agenda deja la serie y todas sus fechas colgando del mismo cliente.
- [ ] Reservar dos canchas en el mismo horario para el mismo cliente está permitido.
- [ ] Facturado, pagado y saldo de la ficha coinciden con lo que muestra `/admin/payments` para esos turnos.
- [ ] Editar el apellido de un cliente cambia el nombre que se ve en la agenda, en el listado de reservas y en el dashboard.
- [ ] Archivar un cliente lo saca del picker y del listado por defecto, lo deja en "Archivados", y sus turnos siguen mostrando su nombre.
- [ ] Cargar un turno para un cliente archivado responde `422` y el diálogo lo dice.
- [ ] Un `GET /admin/customers/:id` con el id de un cliente de otro complejo responde 404 con el mismo mensaje que un id inexistente.

## Fuera de alcance

- Cuentas de cliente: registro, login, "mis reservas". El cliente no tiene email ni contraseña.
- Fusionar dos clientes duplicados.
- Importar clientes desde un CSV o desde la agenda del teléfono.
- Búsqueda insensible a acentos y detección de teléfonos equivalentes con y sin código de país.
- Etiquetas o segmentos de clientes (habitué, moroso, cumpleaños).
- Envío masivo de WhatsApp a una selección de clientes.
