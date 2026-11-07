# 08 — Admin · Canchas: alta, edición, activar / desactivar

## Objetivo

Que el administrador administre el catálogo de canchas sin tocar el seed ni la base de datos: crear una cancha nueva, corregir precio u horario, y sacar de servicio una cancha sin perder su historial.

## User stories

- Como admin quiero **dar de alta una cancha** con su deporte, horario, duración de turno y precio.
- Como admin quiero **cambiar el precio** de una cancha y que las reservas ya hechas conserven el precio con el que se reservaron.
- Como admin quiero **cambiar el horario o la duración de turno** de una cancha cuando no tiene reservas futuras.
- Como admin quiero **desactivar una cancha** (obra, temporada) para que los jugadores no la vean, y **reactivarla** después.
- Como admin quiero **ver todas las canchas**, incluidas las inactivas, con su estado.
- Como admin quiero **ordenar** cómo se listan las canchas en la web de jugadores.

## Rutas / pantallas

| Ruta | Layout | Auth | Descripción |
|---|---|---|---|
| `/admin/courts` | `(admin)` | `ADMIN` | Tabla de canchas |
| `/admin/courts/new` | `(admin)` | `ADMIN` | Alta |
| `/admin/courts/[id]` | `(admin)` | `ADMIN` | Edición |

## UI

### `/admin/courts` — Tabla

**Header**: `PageHeader` título "Canchas", acción primaria **"Nueva cancha"** → `/admin/courts/new`.

**Tabla** (`CourtsTable`; en mobile, cards):

| Columna | Contenido |
|---|---|
| Orden | `sortOrder` |
| Cancha | miniatura (o placeholder por deporte) + nombre; debajo superficie |
| Deporte | badge |
| Techada | "Sí" / "No" |
| Horario | "08:00 – 23:00 · 90 min" |
| Precio | "$ 12.000" |
| Estado | `Switch` activa / inactiva (ver reglas) + badge "Inactiva" si corresponde |
| Reservas futuras | número (`futureBookingsCount`); si `> 0`, link a `/admin/agenda` |
| Acciones | "Editar" → `/admin/courts/[id]` |

Orden: `sortOrder asc, name asc`. Las inactivas se muestran al final con opacidad reducida (`Tabs` "Todas" / "Activas" / "Inactivas", default "Todas").

**Switch de estado** (activar / desactivar in place):
- Desactivar → `AlertDialog`: "¿Desactivar {nombre}? Los jugadores dejarán de verla y no podrán reservarla. Las reservas pasadas se conservan." / "Sí, desactivar".
- Si la cancha tiene `futureBookingsCount > 0`, el `Switch` está deshabilitado con `Tooltip`: "Tiene {N} reservas futuras. Cancelalas antes de desactivarla." (La API igual responde `409 COURT_HAS_FUTURE_BOOKINGS` si se fuerza.)
- Activar → sin confirmación.

### `CourtForm` (alta y edición)

Mismo componente para `/admin/courts/new` y `/admin/courts/[id]`, `react-hook-form` + `zod`. Layout en dos columnas en desktop (`Card` "Datos" y `Card` "Turnos y precio"), una en mobile.

**Datos**
- **Nombre** — `Input`, requerido, 2–40. Único dentro del complejo.
- **Deporte** — `Select` con las etiquetas de `Sport`.
- **Superficie** — `Input`, opcional, ≤ 40 ("césped sintético", "cemento").
- **Techada** — `Switch`.
- **Imagen (URL)** — `Input type="url"`, opcional. Preview debajo si es válida.
- **Orden** — `Input type="number"`, entero `>= 0`. Ayuda: "Menor número, más arriba en el listado." Default en alta: máximo actual + 1.

**Turnos y precio**
- **Abre** / **Cierra** — dos `Input type="time"` (`step 900` = 15 min). Regla: `openTime !== closeTime` ("Debe ser distinta de la hora de apertura"). Un cierre **menor** que la apertura es del día siguiente (turnos trasnoche): debajo de "Cierra" se muestra "Cierra al día siguiente (turnos trasnoche)", y si no, la ayuda "Para cerrar después de medianoche elegí la hora del día siguiente, por ejemplo 01:00". En la tabla el horario se muestra como "18:00 – 01:00 (+1)" (`closesNextDay` en `src/lib/slots.ts`). La agenda muestra esos turnos al final de la grilla del día que los contiene, por eso tras crear/cancelar/pagar se invalidan todas las agendas (`adminAgendaKeys.all`).
- **Duración del turno** — `Select`: 30 · 45 · 60 · 90 · 120 · 180 min (la API acepta 15–240; la UI ofrece los usuales).
- Debajo, texto calculado en vivo: "**{N} turnos por día** · último turno {HH:mm} – {HH:mm}" usando la misma regla de slots que la grilla (helper `countSlots(open, close, duration)` en `src/lib/slots.ts`; es solo informativo, la API sigue siendo la fuente de verdad).
- **Precio por turno** — `Input type="number"`, entero `>= 0`, con prefijo "$".

**Edición: campos con reservas futuras**

Si `futureBookingsCount > 0`, los campos **Abre**, **Cierra** y **Duración** se muestran deshabilitados con un `Alert` arriba de la card: "Esta cancha tiene {N} reservas futuras. Para cambiar el horario o la duración, cancelalas primero." con link "Ver reservas". Precio, nombre, superficie, imagen y orden siguen editables.

**Footer del form**: "Cancelar" (vuelve a `/admin/courts`) / **"Crear cancha"** o **"Guardar cambios"** (`loading`). En edición, el botón se habilita solo si el form está `dirty`.

**Errores**
- `VALIDATION_ERROR` → `setError` por campo desde `details`.
- `409 COURT_NAME_ALREADY_EXISTS` → error inline en Nombre: "Ya existe una cancha con ese nombre."
- `409 COURT_HAS_FUTURE_BOOKINGS` → `Alert` arriba del form con el `message` de la API y se refetchea la cancha (por si `futureBookingsCount` cambió).

Tras guardar: toast "Cancha creada" / "Cambios guardados", `router.push('/admin/courts')`, invalidar `['admin', 'courts']`, `['courts']` (listado de jugadores) y `['admin', 'agenda']`.

### Estados

| Pantalla | Loading | Empty | Error |
|---|---|---|---|
| Tabla | 6 filas skeleton | "Todavía no hay canchas. **Creá la primera**" | `Alert` + "Reintentar" |
| Form edición | Skeleton de las dos cards | — | 404 → "Cancha no encontrada" con link a `/admin/courts` |

## Reglas de negocio y validaciones

### Validación cliente (zod)

```ts
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const courtSchema = z
  .object({
    name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(40, 'Máximo 40 caracteres'),
    sport: z.enum(['PADEL', 'FOOTBALL_5', 'FOOTBALL_7', 'TENNIS']),
    surface: z.string().trim().max(40).optional().or(z.literal('')),
    isIndoor: z.boolean(),
    imageUrl: z.string().url('Ingresá una URL válida').optional().or(z.literal('')),
    sortOrder: z.coerce.number().int().min(0),
    openTime: z.string().regex(HHMM, 'Formato HH:mm'),
    closeTime: z.string().regex(HHMM, 'Formato HH:mm'),
    slotDurationMinutes: z.coerce.number().int().min(15).max(240),
    pricePerSlot: z.coerce.number().int().min(0, 'No puede ser negativo'),
  })
  .refine((v) => v.openTime < v.closeTime, {
    path: ['closeTime'],
    message: 'Debe ser posterior a la hora de apertura',
  })
  .refine((v) => countSlots(v.openTime, v.closeTime, v.slotDurationMinutes) >= 1, {
    path: ['slotDurationMinutes'],
    message: 'No entra ningún turno completo en ese horario',
  });
```

`''` en `surface` / `imageUrl` se envía como `null` para borrar el valor; `undefined` no toca el campo (PATCH parcial).

### Reglas que aplica la API (documentadas para que el contrato sea inequívoco)

- **Nombre único** por complejo (case-sensitive, tal como está en DB) → `409 COURT_NAME_ALREADY_EXISTS`.
- **Precio**: cambiarlo no afecta reservas existentes (`price` es snapshot). Aplica a reservas nuevas desde el momento del cambio.
- **Horario / duración**: solo se pueden cambiar si la cancha **no tiene reservas `CONFIRMED` con `startsAt >= now`** → si tiene, `409 COURT_HAS_FUTURE_BOOKINGS`. Razón: una reserva que no coincide con la nueva grilla quedaría invisible en la agenda y podría solaparse con una nueva.
- **Desactivar**: misma condición → `409 COURT_HAS_FUTURE_BOOKINGS`. Las reservas pasadas se conservan y se siguen viendo en la agenda (`/admin/agenda`) y en el historial del jugador.
- **Reactivar**: siempre permitido.
- **No hay borrado.** Una cancha con historial no se elimina; se desactiva.
- Cambiar `sortOrder` no reordena a las demás; dos canchas pueden compartir número (desempata `name asc`).

## Contrato API

### `GET /admin/courts`

```ts
// Auth: Bearer · rol ADMIN
// 200
{ data: AdminCourt[] }   // activas e inactivas · orden sortOrder asc, name asc
```

### `GET /admin/courts/:id`

```ts
// 200
{ data: AdminCourt }
// 404 NOT_FOUND (inexistente; una inactiva SÍ se devuelve acá, a diferencia de GET /courts/:id)
```

### `POST /admin/courts`

```ts
// Request
{
  name: string;                 // 2–40
  sport: Sport;
  surface?: string;             // <= 40
  isIndoor: boolean;
  imageUrl?: string;            // URL http(s)
  sortOrder?: number;           // entero >= 0 · default: max actual + 1
  openTime: string;             // HH:mm
  closeTime: string;            // HH:mm, > openTime
  slotDurationMinutes: number;  // 15–240, entero
  pricePerSlot: number;         // entero >= 0
  isActive?: boolean;           // default true
}

// 201
{ data: AdminCourt }

// 400 VALIDATION_ERROR (incluye openTime >= closeTime y "no entra ningún turno")
// 409 COURT_NAME_ALREADY_EXISTS
```

### `PATCH /admin/courts/:id`

```ts
// Request: cualquier subconjunto de los campos de POST. `surface` e `imageUrl` aceptan `null` para borrar.
// 200
{ data: AdminCourt }

// 400 VALIDATION_ERROR
// 404 NOT_FOUND
// 409 COURT_NAME_ALREADY_EXISTS
// 409 COURT_HAS_FUTURE_BOOKINGS   (openTime / closeTime / slotDurationMinutes / isActive:false con reservas futuras)
//                                 message: "La cancha tiene {N} reservas futuras. Cancelalas antes de cambiar el horario, la duración o desactivarla."
```

### Query keys y mutaciones

| Key | Endpoint | `staleTime` |
|---|---|---|
| `['admin', 'courts', 'list']` | `GET /admin/courts` | 1 min |
| `['admin', 'courts', id]` | `GET /admin/courts/:id` | 1 min |

| Mutación | `onSuccess` invalida |
|---|---|
| `useCreateCourt` | `['admin', 'courts']` · `['courts']` · `['admin', 'agenda']` |
| `useUpdateCourt` (incluye activar / desactivar) | `['admin', 'courts']` · `['courts']` · `['courts', id]` · `['admin', 'agenda']` |

## Criterios de aceptación

- [ ] `/admin/courts` lista las 8 canchas del seed, "Cancha vieja" marcada como inactiva y al final.
- [ ] Crear "Pádel 4" (PADEL, 08:00–22:00, 90 min, $ 11.000) muestra "9 turnos por día · último turno 20:00 – 21:30" antes de guardar, y tras guardar aparece en la tabla y en `/courts` de la web de jugadores.
- [ ] Crear otra cancha llamada "Pádel 4" muestra el error inline "Ya existe una cancha con ese nombre."
- [ ] Editar el precio de Pádel 1 a $ 13.000: una reserva previa sigue mostrando $ 12.000; una nueva reserva se crea a $ 13.000.
- [ ] Con una reserva futura en Pádel 1, los campos de horario y duración aparecen deshabilitados con el `Alert`; cancelada la reserva, vuelven a habilitarse.
- [ ] Desactivar Tenis 1 (sin reservas futuras) la saca de `/courts` de jugadores y de la agenda; `GET /courts/:id` responde 404; reactivarla la devuelve a ambos.
- [ ] Intentar desactivar una cancha con reservas futuras muestra el tooltip y el `Switch` no cambia.
- [ ] `closeTime <= openTime` y "no entra ningún turno" se validan en cliente antes de enviar.

## Fuera de alcance

- Subir imágenes (solo URL).
- Drag & drop para reordenar.
- Horarios distintos por día de la semana; feriados; precios por franja.
- Borrar canchas.
- Duplicar cancha ("crear a partir de…").
