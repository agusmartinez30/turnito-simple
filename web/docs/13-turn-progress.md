# 13 — Admin · Turno en curso (inicio manual + cronómetro)

## Objetivo

Cuando el cliente entra a la cancha, el admin **inicia el turno** desde el panel y ve **cuánto tiempo lleva**. Al cumplirse la duración pactada, el turno pasa a **"Terminado"** en rojo y llamativo, y en el dashboard **suena una alarma hasta que el admin la apaga**, para que se note desde el mostrador que hay que liberar la cancha aunque nadie esté mirando la pantalla.

## User stories

- Como admin quiero **iniciar un turno con un click** desde el dashboard, sin abrir el detalle.
- Como admin quiero **ver el tiempo transcurrido** de cada turno en curso, en un lugar fijo arriba del dashboard.
- Como admin quiero que un turno que **se pasó de su tiempo** se destaque en un color distinto, con cuánto se pasó.
- Como admin quiero que **suene una alarma** cuando un turno cumple su tiempo, aunque no esté mirando la pantalla, y poder **apagarla** o **silenciarla en este dispositivo**.
- Como admin quiero que el inicio **quede guardado**: si recargo o entro desde otro dispositivo, el cronómetro sigue.
- Como admin quiero **finalizar el turno** cuando el cliente se va, para que el reloj se detenga y quede registrado cuánto duró.

## Rutas / pantallas

Sin rutas nuevas. Vive en `/admin` (dashboard, `11`) y en `/admin/bookings/[id]` (detalle, `07`).

## UI

### Panel "En curso" (`InProgressPanel`, en `DashboardView`)

Sección entre `WeekNav` y `DashboardSummary`, solo cuando la semana mostrada incluye hoy **y** hay reservas de hoy **en curso** (`startedAt` sin `finishedAt`). Un turno finalizado sale del panel. Título **"En curso"** + muted "· 2 turnos" + `Badge` rojo "1 terminado" si hay alguno pasado de tiempo. A la derecha del título, el **parlante** (`Button ghost icon-sm`, `Volume2` / `VolumeX`, `aria-pressed`, tooltip "Alarma sonora activada / silenciada") activa o silencia la alarma sonora en este dispositivo (ver "Alarma al terminar").

Grid de `Card` (`sm:grid-cols-2 lg:grid-cols-3`), cada una con link overlay al detalle.

- **Banda superior** (`RUNNING_BAND_CLASS`): **primario** (negro en claro, blanco en oscuro; `bg-primary` + `text-primary-foreground`) con la cancha, el badge de deporte (`outline` + `border-current text-current`, para que el filete y la tinta salgan claros sobre el primario) y el horario pactado a la derecha (`formatTimeRange`, `opacity-80`). Es la única superficie primaria del contenido del panel: marca de un vistazo qué canchas están ocupadas ahora. El primario va de **relleno con tinta clara**, nunca de tinta sobre la card (ver el comentario de tokens en `globals.css`).
- **Cuerpo** (claro, zona de lectura densa): cliente, `TurnTimer size="lg"` — el cronómetro sigue siendo el héroe y conserva su verde / rojo de estado —, "de 90 min" y a la derecha el botón **"Finalizar"** (`TurnActionButton`, por encima del overlay).
- Orden: **terminados primero**, después por más tiempo transcurrido.
- Card terminada: la banda pasa a rojo sólido (`OVERTIME_BAND_CLASS`) y el cuerpo toma `OVERTIME_CARD_CLASS` (fondo rojo suave + ring). El estado viaja siempre por la banda, en la misma posición: primario = en curso, rojo = se pasó.

### `TurnTimer`

| Estado | Cuándo | Cómo se ve |
|---|---|---|
| `running` | `now − startedAt < endsAt − startsAt` | punto verde con `animate-ping` + elapsed `mm:ss` (o `h:mm:ss`) en verde (`text-emerald-600`). Tamaño `sm`: sufijo muted "/ 90 min". |
| `overtime` | elapsed ≥ duración | chip `bg-red-600 text-white animate-pulse` con ícono `TimerOff` y **"Terminado · +mm:ss"** (excedido). |
| `finished` | tiene `finishedAt` | chip gris `bg-muted` con `CircleCheck` y **"Finalizado · h:mm:ss"** (total = `finishedAt − startedAt`); si se pasó, sufijo rojo "(+mm:ss)". No tickea. |

Lógica pura en `features/admin-dashboard/lib/turn-progress.ts`: `turnProgress(booking, now)`, `formatElapsed(ms)`, `canStartTurn(booking, today, tz)`, `isStarted` / `isInProgress` / `isFinished`.

### `TurnActionButton`

Un solo componente para las tres pantallas (`features/admin-dashboard/components/TurnActionButton.tsx`): `Button outline sm` **"Iniciar"** (`Play`) si `canStartTurn`, **"Finalizar"** (`Square`) si `isInProgress`, nada en otro caso. `label="long"` → "Iniciar turno" / "Finalizar turno" (detalle). Usa `useAdminStartBooking` / `useAdminFinishBooking`, toasts "Turno iniciado" / "Turno finalizado" / `errorMessage(error)`, `Loader2` mientras carga. Hace `preventDefault` + `stopPropagation` en el click para vivir encima de un link overlay sin navegar.

### Fila del dashboard (`DashboardBookingRow`, solo en el día de hoy)

- Columna propia "Acciones" (la última, a la derecha del estado): `TurnActionButton` — "Iniciar" antes de iniciar, "Finalizar" mientras está en curso, nada al finalizar. Siempre se renderiza la celda (vacía si no hay acción) para que todas las filas tengan la misma altura. La fila no navega al clickear el botón.
- Iniciada → `TurnTimer` en lugar del badge de estado; en `overtime` toda la fila con `OVERTIME_ROW_CLASS` (fondo rojo suave). Finalizada → chip gris "Finalizado · total" (se muestra aunque no haya reloj).
- Los demás días no reciben `now`: sin botón ni cronómetro.

### Detalle (`AdminBookingDetail`)

- Junto al badge de estado: `TurnTimer` si está iniciada (tickeando en curso, congelado si finalizó) y `TurnActionButton label="long"` ("Iniciar turno" / "Finalizar turno"). Al finalizar el reloj se detiene y el botón desaparece.
- Card "Turno": líneas **"Iniciado el 14/09/2026 13:16 por Admin Demo"** y **"Finalizado el … por …"** (`startedAt` / `finishedAt`).

### Reloj

`useNow(enabled, intervalMs)` (`src/hooks/use-now.ts`, compartido con la agenda): `setInterval` de **1 s** solo mientras haya turnos **en curso** hoy (`enabled`); si no, devuelve `null` y no tickea. Al volver a habilitarse arranca del reloj real (no del último tick). En el detalle, solo mientras ese turno esté en curso.

### Alarma al terminar (`TurnAlarmBanner`)

Solo en el dashboard. Cuando un turno **cumple su tiempo** (pasa de `running` a `overtime`) con el dashboard abierto:

| Pieza | Comportamiento |
|---|---|
| Banner | Primer elemento del dashboard (arriba de `PageHeader`), `role="alert"`, rojo sólido (`bg-red-600 text-white`), `sticky top-14 lg:top-0 z-30` (debajo del header mobile). Ícono `BellRing` pulsante. 1 turno: **"Terminó el turno de Cancha 1 · Juan Pérez"** + horario pactado (`formatTimeRange`). N turnos: **"Terminaron 2 turnos"** + lista "cancha · cliente · horario". Botón blanco **"Apagar alarma"** (`BellOff`): apaga todos. Si el sonido está silenciado, línea "Sonido silenciado en este dispositivo." (la alarma visual se muestra igual). |
| Sonido | Web Audio, sin archivo (`features/admin-dashboard/lib/alarm-sound.ts`: `unlock` / `start` / `stop` / `beep`). Buffer de 1 s en loop: dos bips de 120 ms a 880 Hz separados por 80 ms, resto silencio; corre en el hilo de audio (no depende de timers) hasta `stop()`. |
| Toggle | Parlante en el título de "En curso". Preferencia **por dispositivo** en `localStorage['admin:turn-alarm-sound']` (default activado) vía `useStoredFlag` (`src/hooks/use-stored-flag.ts`, `useSyncExternalStore`, sincroniza pestañas). Al reactivar: bip corto de confirmación. |

Lógica en `useTurnAlarm(inProgress, now, soundEnabled)` (`features/admin-dashboard/hooks.ts`), usada por `TurnAlarmBanner`: registra cuándo se **vio por primera vez** cada turno en curso; un turno suena si se lo vio antes de cumplir su duración y ahora ya la cumplió, y no fue apagado. Devuelve `{ ringing, dismiss }`; el sonido es un effect declarativo sobre `ringing.length > 0 && soundEnabled`.

**Autoplay**: el navegador mantiene el `AudioContext` suspendido hasta un gesto del usuario; el dashboard lo desbloquea en cada `pointerdown` / `keydown`. En el uso normal el admin ya apretó "Iniciar" en esa sesión. Si recargó y no tocó nada cuando termina un turno, el banner aparece igual y el sonido arranca con el primer click.

## Reglas de negocio

- Solo se inicia una reserva **CONFIRMED de hoy** (día local del complejo), **una sola vez**. Sin restricción de hora: el cliente puede llegar antes o después del horario pactado.
- El turno se marca **"Terminado"** al cumplirse la duración (`endsAt − startsAt`) contada desde el inicio manual, no al llegar a `endsAt`: si empezó tarde tiene su tiempo completo. Es solo visual; el reloj sigue hasta que el admin lo **finaliza** a mano.
- **Finalizar** solo un turno iniciado, una sola vez; no se puede reiniciar.
- Cancelar un turno iniciado sigue las reglas de `07` (se puede mientras `endsAt > now`).
- La alarma suena solo por una transición **observada** con el dashboard abierto: al recargar, volver de otra página o recibir por refetch un turno **ya terminado**, no suena ni hay banner.
- Varios turnos pueden sonar a la vez; un solo "Apagar alarma" apaga todos, y un turno apagado no vuelve a sonar. **Finalizar** (o cancelar) un turno lo saca del banner y, si era el último, apaga el sonido. Al salir del dashboard se apaga.
- El silencio es **por dispositivo** (`localStorage`), no por usuario ni por complejo. Silenciado, la alarma visual sigue.
- Limitaciones: con la pestaña en segundo plano el navegador frena el `setInterval` del reloj (Chrome: 1/min tras 5 min oculta), así que la detección puede atrasarse hasta ~60 s; el loop, una vez arrancado, no se ve afectado. En mobile con la pantalla bloqueada no suena (el SO suspende la pestaña).

## Contrato API

```ts
// AdminBooking +=
startedAt?: string;                    // ISO con offset; solo si se inició
startedBy?: { id: string; name: string };
finishedAt?: string;                   // solo si se finalizó a mano
finishedBy?: { id: string; name: string };
```

| Método | Path | Auth | Respuesta |
|---|---|---|---|
| `PATCH` | `/admin/bookings/:id/start` | ADMIN | `{ data: AdminBooking }` (detalle) · 404 · 422 `BOOKING_NOT_CONFIRMED` / `BOOKING_ALREADY_STARTED` / `BOOKING_NOT_TODAY` |
| `PATCH` | `/admin/bookings/:id/finish` | ADMIN | `{ data: AdminBooking }` (detalle) · 404 · 422 `BOOKING_NOT_STARTED` / `BOOKING_ALREADY_FINISHED` |

Detalle en [`api/docs/12-turn-progress.md`](../../api/docs/12-turn-progress.md).

### Query keys

Sin keys nuevas. `useAdminStartBooking` y `useAdminFinishBooking` (`features/admin-bookings/hooks.ts`) usan `useAfterAdminBookingChange`: setea el detalle e invalida `['admin','bookings']`, `['admin','dashboard']`, la agenda del día y disponibilidad.

## Criterios de aceptación E2E

1. [ ] `admin` en `/admin`, sección "Hoy": una reserva confirmada muestra "Iniciar"; click → toast "Turno iniciado", aparece el panel "En curso" con el cronómetro corriendo (`00:01`, `00:02`…) y la fila lo repite en verde; la URL sigue en `/admin`.
2. [ ] Recargar: el cronómetro sigue desde `startedAt` (no vuelve a cero). Repetir el `PATCH` → 422 `BOOKING_ALREADY_STARTED`.
3. [ ] Con `started_at` 100 min atrás en un turno de 90: card y fila en rojo con "Terminado · +10:00"; el badge "1 terminado" en el título del panel.
4. [ ] Una pendiente o una de otro día no muestra "Iniciar". `/admin/bookings/:id` muestra "Iniciado el … por Admin Demo" y el cronómetro junto al estado.
5. [ ] "Finalizar" desde una card de "En curso" y desde una fila de hoy → toast, el turno sale del panel, la fila muestra el chip gris "Finalizado · total", la URL sigue en `/admin`; clickear el cuerpo de la card / fila sigue llevando al detalle. En el detalle, "Finalizar turno" hace lo mismo y aparece "Finalizado el … por …".
6. [ ] Mobile (400px): panel en una columna, cronómetro grande legible; el banner de alarma queda debajo del header sticky y "Apagar alarma" baja de línea.
7. [ ] Con un turno en curso al que le faltan ~20 s (`UPDATE bookings SET started_at = now() - (ends_at - starts_at) + interval '20 seconds'`), esperar mirando el dashboard: al pasar a "Terminado" aparece el banner rojo arriba "Terminó el turno de … · …" y suena el loop (dos bips por segundo). "Apagar alarma" → se van banner y sonido; el chip sigue "Terminado" y no vuelve a sonar.
8. [ ] Con ese turno ya terminado, recargar (o ir a `/admin/agenda` y volver): card roja pero **sin** banner ni sonido.
9. [ ] Silenciar con el parlante y recargar: sigue silenciado. Provocar otro fin de turno → banner con "Sonido silenciado en este dispositivo." y sin audio; reactivar → bip corto; togglear en otra pestaña actualiza la primera.
10. [ ] Con el banner sonando, "Finalizar" ese turno desde la card → el turno sale del panel y la alarma se apaga sola. Con dos turnos terminando con segundos de diferencia: un solo banner "Terminaron 2 turnos"; finalizar uno deja al otro; "Apagar alarma" apaga el resto. Ir a `/admin/agenda` con la alarma sonando → se apaga; el detalle de un turno terminado nunca suena.

## Fuera de alcance

- Reiniciar un turno finalizado, acciones de turno en la agenda, tiempo extra facturable.
- Alarma fuera del dashboard (detalle, otras páginas, pestaña cerrada o pantalla bloqueada), notificaciones push, volumen o sonido configurable, preferencia de sonido por usuario en la API.
