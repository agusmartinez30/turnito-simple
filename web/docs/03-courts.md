# 03 — Canchas: listado, detalle y disponibilidad

## Objetivo

Que el jugador encuentre una cancha y vea qué turnos tiene libres en un día concreto. Esta pantalla es el **punto de partida del flujo de reserva**: al clickear un turno disponible se abre la confirmación descrita en [`04-bookings.md`](./04-bookings.md).

## User stories

- Como jugador quiero **ver todas las canchas** del complejo con su deporte, si es techada y el precio.
- Como jugador quiero **filtrar por deporte** y por techada/descubierta para encontrar rápido lo que busco.
- Como jugador quiero **elegir un día** y ver **qué turnos están libres** en una cancha.
- Como jugador quiero **seleccionar un turno libre** para reservarlo.
- Como jugador quiero que los turnos ocupados o pasados **se vean claramente diferenciados** y no se puedan seleccionar.

## Rutas / pantallas

| Ruta | Layout | Auth | Query params |
|---|---|---|---|
| `/courts` | `(app)` | Protegida | `?sport=PADEL&indoor=true` (ambos opcionales) |
| `/courts/[id]` | `(app)` | Protegida | `?date=YYYY-MM-DD` (opcional, default hoy) |

Los filtros y la fecha viven en la URL para que sean compartibles y sobrevivan al back del navegador.

## UI

### `/courts` — Listado

**Header**
- Título "Canchas".
- Filtros en una fila (wrap en mobile):
  - **Deporte**: `ToggleGroup type="single"` con "Todos" + un item por deporte presente en el listado.
  - **Techada**: `ToggleGroup type="single"` con "Todas" / "Techadas" / "Descubiertas".
- Cambiar un filtro actualiza la URL (`router.replace`, sin scroll) y refetchea.

**Grid**
- `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, gap 4.
- `CourtCard` (componente en `src/features/courts/components/CourtCard.tsx`, reutilizado por el home):
  - Imagen (`imageUrl` o placeholder por deporte), `aspect-video`.
  - Nombre de la cancha (`font-semibold`).
  - Fila de badges: deporte · "Techada" / "Descubierta" · superficie (si existe).
  - Pie: "$ {pricePerSlot} · {slotDurationMinutes} min".
  - Toda la card es link a `/courts/[id]`.

### `/courts/[id]` — Detalle + disponibilidad

**Header de la cancha**
- Botón "← Canchas" (vuelve a `/courts` preservando filtros si se llegó desde ahí; si no, a `/courts` limpio).
- Imagen grande (`aspect-[21/9]` en desktop, `aspect-video` en mobile).
- Nombre, badges (deporte, techada, superficie), precio por turno y duración.
- Horario: "Abierta de {openTime} a {closeTime}".

**Selector de fecha**
- Componente `DatePicker` horizontal: fila scrolleable de chips, uno por día, desde hoy hasta hoy + `MAX_DAYS_AHEAD - 1` (constante en `src/features/courts/constants.ts`, default `7`).
- Cada chip: día de la semana abreviado arriba ("Sáb") y número abajo ("13"). Hoy se marca con "Hoy".
- Chip seleccionado con `variant="default"`; el resto `outline`.
- Seleccionar un día actualiza `?date=` en la URL.
- Los chips usan el timezone del complejo para decidir qué día es "hoy".

**Grilla de turnos** (`AvailabilityGrid`)
- Título: "Turnos para el {fecha larga}" (ej. "sábado 13 de septiembre").
- Grid de botones, `grid-cols-2 sm:grid-cols-3 md:grid-cols-4`, uno por `TimeSlot`.
- Cada botón muestra "{HH:mm} – {HH:mm}" y, debajo en texto pequeño, la etiqueta del estado.
- Estilos por estado:

| Estado | Apariencia | Interacción |
|---|---|---|
| `AVAILABLE` | `variant="outline"`, borde primario al hover | Click → abre `BookingConfirmDialog` (ver `04-bookings.md`) |
| `BOOKED` | `variant="secondary"`, texto "Ocupado" | `disabled` |
| `BLOCKED` | `variant="secondary"`, texto "No disponible" | `disabled` |
| `PAST` | `variant="ghost"`, opacidad 50%, sin etiqueta | `disabled` |

- Debajo de la grilla: leyenda de colores (Disponible / Ocupado / No disponible).

### Estados

| Pantalla / sección | Loading | Empty | Error |
|---|---|---|---|
| Listado | 6 `CourtCard` skeleton | "No hay canchas para estos filtros" + botón "Limpiar filtros" | `Alert` + "Reintentar" |
| Detalle (cancha) | Skeleton del header | — | 404 → página "Cancha no encontrada" con link a `/courts` |
| Grilla | Grid de 12 botones skeleton (mantiene el layout) | "No hay turnos para este día" (ej. cancha cerrada) | `Alert` inline + "Reintentar" solo para la grilla |

Cambiar de fecha muestra el skeleton de la grilla; el header de la cancha no se re-renderiza.

## Reglas de negocio y validaciones

### Cómo se construye la grilla

La API devuelve la lista completa de slots del día con su estado (`GET /courts/:id/availability?date=`). **La web no genera los slots**; los renderiza tal cual vienen. Esto evita que web y API discrepen en redondeos, horarios partidos o feriados.

La API los genera así (documentado acá para que el contrato sea inequívoco):

1. Desde `openTime` hasta `closeTime` del día `date` en `complex.timezone`, en pasos de `slotDurationMinutes`. Si el último slot no entra completo antes de `closeTime`, se descarta.
2. `status`:
   - `PAST` si `startsAt < now`.
   - `BOOKED` si existe una `Booking` con `status: CONFIRMED` en ese `startsAt`.
   - `BLOCKED` si el admin bloqueó el horario (post-MVP; en MVP la API puede no devolverlo nunca, pero la web lo soporta).
   - `AVAILABLE` en cualquier otro caso.
3. Un slot `PAST` prevalece sobre `BOOKED` (un turno pasado ocupado se ve como pasado, no como ocupado).

### Validaciones

- `date` fuera del rango `[hoy, hoy + MAX_DAYS_AHEAD - 1]` → la web normaliza a hoy y reemplaza la URL. La API además responde `400 VALIDATION_ERROR` si recibe una fecha fuera de su propio rango configurado.
- `date` con formato inválido → misma normalización.
- Cancha con `isActive: false` → la API responde `404`; la web muestra "Cancha no encontrada".
- `?sport=` con valor que no está en `Sport` → se ignora el filtro.

### Refresco de disponibilidad

- `staleTime: 30s` para la query de disponibilidad, `refetchOnWindowFocus: true`. Un jugador que dejó la pestaña abierta y vuelve ve el estado actualizado.
- Al recibir `409 SLOT_UNAVAILABLE` al intentar reservar, se invalida la query de disponibilidad de esa cancha y fecha (ver `04-bookings.md`).

## Contrato API

### `GET /courts`

```ts
// Query (opcionales)
{ sport?: Sport; indoor?: 'true' | 'false' }

// 200
{ data: Court[] }   // solo isActive: true; orden: sport (según enum), luego name

// Errores: 400 VALIDATION_ERROR (sport inválido)
```

### `GET /courts/:id`

```ts
// 200
{ data: Court }

// Errores: 404 NOT_FOUND (inexistente o isActive: false)
```

### `GET /courts/:id/availability`

```ts
// Query
{ date: string }   // YYYY-MM-DD en el timezone del complejo. Requerido.

// 200
{
  data: {
    date: string;                 // eco del parámetro
    timezone: string;             // complex.timezone
    slots: TimeSlot[];            // ordenados por startsAt asc
  }
}

// Errores: 400 VALIDATION_ERROR (formato o fuera de rango) · 404 NOT_FOUND
```

Ejemplo de respuesta (cancha de 90 min, abre 18:00, cierra 22:00, consultado a las 19:10):

```json
{
  "data": {
    "date": "2026-09-12",
    "timezone": "America/Argentina/Buenos_Aires",
    "slots": [
      { "startsAt": "2026-09-12T18:00:00-03:00", "endsAt": "2026-09-12T19:30:00-03:00", "status": "PAST" },
      { "startsAt": "2026-09-12T19:30:00-03:00", "endsAt": "2026-09-12T21:00:00-03:00", "status": "BOOKED" }
    ]
  }
}
```

(El slot 21:00–22:30 no entra antes de las 22:00 y se descarta.)

### Query keys

| Key | Endpoint | `staleTime` |
|---|---|---|
| `['courts', { sport, indoor }]` | `GET /courts?…` | 5 min |
| `['courts', id]` | `GET /courts/:id` | 5 min |
| `['courts', id, 'availability', date]` | `GET /courts/:id/availability?date=` | 30 s |

## Criterios de aceptación

- [ ] `/courts` lista todas las canchas activas con imagen, nombre, deporte, techada/descubierta, precio y duración.
- [ ] Filtrar por deporte muestra solo canchas de ese deporte y la URL refleja `?sport=`.
- [ ] Filtrar por techada/descubierta funciona combinado con el filtro de deporte.
- [ ] Recargar `/courts?sport=PADEL` mantiene el filtro aplicado.
- [ ] Sin resultados para los filtros, se ve el empty state y "Limpiar filtros" vuelve al listado completo.
- [ ] `/courts/[id]` muestra el header de la cancha y la grilla del día de hoy por defecto.
- [ ] Cambiar de día refetchea la grilla y actualiza `?date=`; volver atrás con el navegador restaura el día anterior.
- [ ] Los slots `PAST`, `BOOKED` y `BLOCKED` están deshabilitados y visualmente diferenciados; solo `AVAILABLE` responde al click.
- [ ] Clickear un slot `AVAILABLE` abre el diálogo de confirmación de reserva.
- [ ] Después de reservar un turno y volver a la grilla, ese slot figura como `BOOKED`.
- [ ] Un `id` inexistente muestra "Cancha no encontrada" con link a `/courts`.

## Fuera de alcance (MVP)

- Vista semanal / calendario mensual de disponibilidad.
- Ver disponibilidad de todas las canchas a la vez para un horario ("¿qué hay libre el sábado a las 20?").
- Galería de fotos, descripción larga, mapa.
- Precios diferenciados por franja horaria o día.
- Bloqueos administrados por el admin (la web solo renderiza `BLOCKED` si la API lo devuelve).
