# 25 — Centro de notificaciones del admin

> Contraparte de la API: [`api/docs/25-notifications.md`](../../api/docs/25-notifications.md). Evento en vivo: [`24-realtime.md`](./24-realtime.md). Detalle al que lleva: [`07-admin-bookings.md`](./07-admin-bookings.md).

## Objetivo

Campana con contador de no leídas en el navbar del admin, lista en un popover y toast con el detalle cada vez que un jugador sube un comprobante.

> **Estado de verificación**: verificado con `tsc`, `eslint`, `prettier` y `build`. La web no tiene test runner y no se probó en un navegador.

## Código (`web/src/features/notifications/`)

| Archivo | Rol |
|---|---|
| `api.ts` | Llamadas a `/admin/notifications` (lista, `unread-count`, `:id/read`, `read-all`) |
| `hooks.ts` | `notificationKeys`, `useUnreadNotificationCount`, `useNotifications`, `useMarkNotificationRead`, `useMarkAllNotificationsRead` |
| `lib.ts` | `formatUnreadBadge` (tope `99+`), `bellLabel`, `relativeTime` ("hace 5 minutos") |
| `types.ts` | `AdminNotification` y `NotificationCreatedEvent` |
| `components/NotificationBell.tsx` | Campana, badge y popover |

## Campana (`NotificationBell`)

- Se monta en `AdminShell`: header del sidebar (desktop) y header mobile, junto al menú de usuario.
- **Badge**: `useUnreadNotificationCount` (`staleTime` 10 s, `refetchInterval` 15 s). Oculto en 0; el `aria-label` incluye el conteo.
- **Popover**: la lista (`useNotifications`) solo se pide mientras está abierto. Cada item muestra pagador, monto declarado, cancha, fecha y hora (zona del complejo) y tiempo relativo; las no leídas van resaltadas con un punto. Estados: skeleton, error y vacío.
- **Click en un item**: si estaba sin leer la marca leída, cierra el popover y navega a `/admin/bookings/<bookingId>`.
- **"Marcar todas como leídas"**: deshabilitado sin no leídas. Ambas mutaciones invalidan `notificationKeys.all` (conteo y lista).
- La lectura es compartida por complejo: lo que lee un admin lo ve leído el resto.

## Tiempo real

`AdminRealtimeProvider` escucha `notification.created` (payload en la doc de la API). Ante el evento:

1. Invalida `notificationKeys.all` (badge y lista se refrescan).
2. Muestra `toast.info('Nuevo comprobante recibido')` con la descripción "`<pagador>` declaró `<monto>`" y la acción **Ver reserva** → `/admin/bookings/<bookingId>`.

- **Deduplicado** por `notificationId` durante 5 s (antes era por `bookingId`).
- Este toast **reemplaza** al genérico que se mostraba en `payment.changed` / `proof_submitted`; `payment.changed` sigue invalidando las pantallas de pagos y reservas, sin toast.
- Todo en `try/catch`: un fallo es silencioso y el polling alcanza.

## Fallback: polling

Si el socket cae o es rechazado, el contador sigue refrescándose cada 15 s; la lista se recarga al abrir el popover.

## Checklist manual (pendiente)

- [ ] Subir un comprobante desde `/app/<slug>/pagar/<id>`: aparece el toast con pagador y monto, y el badge sube sin esperar 15 s.
- [ ] "Ver reserva" y el click en un item llevan al detalle correcto.
- [ ] Marcar una / todas como leídas baja el badge; otra sesión admin del mismo complejo lo ve tras el refetch.
- [ ] Un admin de otro complejo no recibe nada.
- [ ] Layout correcto de la campana en desktop (sidebar) y mobile.
