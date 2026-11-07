# 25 — Centro de notificaciones del admin

## Objetivo

Que el admin tenga una lista persistente (con estado leído/no leído) de los comprobantes de transferencia que suben los jugadores, además del aviso en vivo. Contraparte web: [`web/docs/25-notifications.md`](../../web/docs/25-notifications.md). Flujo que las genera: [`23-public-payment-link.md`](./23-public-payment-link.md). Evento en vivo: [`24-realtime-events.md`](./24-realtime-events.md).

## Decisiones

- **Tabla `notifications`** (módulo `api/src/modules/notifications/`), no derivada de los comprobantes `PENDING`: sobrevive a aprobar/rechazar y guarda su propio estado de lectura.
- **Lectura compartida por complejo**: `readAt` vive en la fila; si un admin la lee, queda leída para todos los admins del complejo.
- Un solo tipo hoy, `PROOF_SUBMITTED` (enum `NotificationType`), para poder sumar otros.

## Modelo

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid | |
| `complexId` | FK `complexes` | `onDelete: Restrict` |
| `bookingId` | FK `bookings` | `onDelete: Restrict` |
| `proofId` | FK `payment_proofs`, nullable | `onDelete: SetNull` |
| `type` | `NotificationType` | `PROOF_SUBMITTED` |
| `payerName` | string | Lo que declaró el jugador |
| `declaredAmount` | int | Monto declarado |
| `createdAt` | timestamptz | |
| `readAt` | timestamptz, nullable | `null` = no leída |

Índices: `(complexId, readAt)` y `(complexId, createdAt)`. Migración: `20261109000000_payment_notifications`.

## Endpoints

Todos `ADMIN`, prefijo `/admin/notifications`, siempre filtrados por el `complexId` del admin.

| Método y ruta | Respuesta | Detalle |
|---|---|---|
| `GET /admin/notifications` | `NotificationResponse[]` | Las 30 más recientes (`createdAt desc`, `id desc`) |
| `GET /admin/notifications/unread-count` | `{ "count": number }` | No leídas del complejo |
| `POST /admin/notifications/:id/read` | `NotificationResponse` | Idempotente: si ya estaba leída conserva su `readAt`. `NOT_FOUND` ("Notificación no encontrada.") si no existe o es de otro complejo |
| `POST /admin/notifications/read-all` | `{ "updated": number }` | Marca todas las no leídas del complejo |

`NotificationResponse`:

```json
{
  "id": "uuid", "type": "PROOF_SUBMITTED", "bookingId": "uuid", "proofId": "uuid|null",
  "payerName": "Juan Pérez", "declaredAmount": 5000,
  "createdAt": "ISO-8601 UTC", "readAt": "ISO-8601 UTC | null",
  "booking": {
    "courtName": "Cancha 1", "startsAt": "ISO-8601 en la zona del complejo",
    "customerName": "string | null", "price": 12000, "paidAmount": 0, "balance": 12000
  }
}
```

`balance = price - paidAmount` (negativo = saldo a favor).

## Creación

`PublicPaymentService` crea la `Notification` **dentro de la misma transacción** que el `PaymentProof` (`POST /public/c/:slug/bookings/:id/payment-proof`): nunca existe una notificación sin su comprobante, y si la subida falla no se crea nada.

## Evento `notification.created`

Se emite **después del commit**, solo a la room `complex:<id>` (admins autenticados del complejo), vía `RealtimeEmitter.notificationCreated`. Payload exacto:

```json
{
  "notificationId": "uuid", "complexId": "uuid", "bookingId": "uuid",
  "type": "PROOF_SUBMITTED", "payerName": "Juan Pérez",
  "declaredAmount": 5000, "createdAt": "ISO-8601 UTC"
}
```

- A diferencia de `payment.changed` (solo ids), lleva `payerName` y `declaredAmount` para armar el toast; sigue sin incluir claves de archivo. El emitter reconstruye el payload con esos campos.
- Mismas garantías que el resto del realtime: fire-and-forget, un fallo no rompe el request HTTP.
- `payment.changed` (`proof_submitted`) se sigue emitiendo; el detalle viene de este evento.

## Fallback: polling

Si el socket cae, el front sigue consultando `unread-count` cada 15 s; la lista se pide al abrir el popover.

## Tests

- `api/src/modules/notifications/notifications.service.spec.ts` — lista, conteo, marcar leída (idempotente), marcar todas, scoping por complejo.
- `api/src/modules/public/public-payment.service.spec.ts` — creación en la transacción y emisión posterior.
- `api/src/modules/realtime/realtime.emitter.spec.ts` y `realtime.gateway.spec.ts` — payload reconstruido y room.
- `api/test/e2e/admin-notifications.e2e-spec.ts` — endpoints, roles y aislamiento por complejo. No hay e2e de socket para `notification.created` (cubierto por unit).
