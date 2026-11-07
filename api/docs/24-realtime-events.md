# 24 — Eventos en tiempo real (Socket.IO) para pagos

## Objetivo

Que las pantallas de admin (detalle de reserva, listado de pagos) se actualicen al instante cuando un jugador sube un comprobante o cuando cambia un pago, sin esperar al polling de 15 s. El servidor empuja una señal liviana de "algo cambió" y el cliente decide qué recargar. Contraparte web: [`web/docs/24-realtime.md`](../../web/docs/24-realtime.md). Contexto de los flujos que emiten: [`11-admin-payments.md`](./11-admin-payments.md) y [`23-public-payment-link.md`](./23-public-payment-link.md).

## Decisiones

- **Socket.IO**, namespace **`/admin`** (módulo `api/src/modules/realtime/`). Solo admins; el link público de pago **no** usa sockets (sigue con su polling).
- Los eventos son **señales**, no datos: el cliente invalida cachés y vuelve a pedir por REST (que aplica sus propios permisos).
- **Una sola réplica** (Railway): las rooms viven en memoria del proceso. Ver "Limitación".

## Conexión

| Aspecto | Detalle |
|---|---|
| URL | `<origen de la API>/admin` (namespace Socket.IO) |
| Token | El mismo JWT HS256 de la API. En `handshake.auth.token` o, alternativamente, header `Authorization: Bearer <token>` |
| Quién entra | Solo `role = ADMIN` **con `complexId`**. Rol y complejo se leen de la DB (como `RolesGuard`), así que un admin degradado no puede conectarse |
| Rechazo | Sin token, token inválido/vencido, usuario inexistente, no admin o sin complejo → el handshake falla con `connect_error` y mensaje **`unauthorized`** |
| CORS | Se evalúa en cada handshake contra `WEB_ORIGIN` (el mismo que el CORS HTTP). Pedidos sin `Origin` se aceptan; `credentials: false` |
| Rooms | Al conectar, el socket entra a **`complex:<complexId>`** (su complejo) y a ninguna otra |

## Evento `payment.changed`

Se emite a la room `complex:<id>` del complejo afectado. Payload exacto:

```json
{ "complexId": "uuid", "bookingId": "uuid", "kind": "proof_submitted" }
```

| `kind` | Qué acción lo emite |
|---|---|
| `proof_submitted` | `POST /public/c/:slug/bookings/:id/payment-proof` (el jugador sube un comprobante) — `PublicPaymentService` |
| `proof_approved` | `POST /admin/bookings/:id/payment-proofs/:proofId/approve` — `AdminPaymentProofsService` |
| `proof_rejected` | `POST /admin/bookings/:id/payment-proofs/:proofId/reject` — `AdminPaymentProofsService` |
| `payment_registered` | `POST /admin/bookings/:id/payments` — `AdminPaymentsService.register` |
| `payment_voided` | `PATCH /admin/bookings/:id/payments/:paymentId/void` — `AdminPaymentsService` |

### Privacidad

Solo viajan ids y el `kind`: **sin PII, montos ni claves de archivos**. `RealtimeEmitter` reconstruye el payload con esos tres campos, así que propiedades extra nunca llegan al cliente. Nunca se emite a otro complejo.

### Cuándo y cómo se emite

- **Después del commit**: cada servicio llama a `RealtimeEmitter.paymentChanged(...)` recién cuando la operación de DB terminó. Si la operación falla (p. ej. subida rechazada por validación), **no se emite nada**.
- **Fire-and-forget**: el emitter no espera a la red y atrapa cualquier error (`Logger.warn`); una falla de realtime nunca rompe ni demora el request HTTP. El emitter se inyecta como `@Optional()` en los servicios.

## Evento `notification.created`

Segundo evento del namespace `/admin`, también a la room `complex:<id>`. Se emite al subir un comprobante, después del commit, y **sí lleva datos de display** (`payerName`, `declaredAmount`) porque solo llega a admins autenticados del complejo; nunca claves de archivo. Payload y contexto: [`25-notifications.md`](./25-notifications.md). `payment.changed` sigue siendo solo ids.

## Limitación: una sola réplica

Las rooms son en memoria del proceso: con varias instancias de la API, un evento emitido en una réplica solo llega a los sockets conectados a esa. Hoy el despliegue es de una réplica. Para escalar a varias hay que sumar el **adaptador Redis de Socket.IO** (`@socket.io/redis-adapter`) y, según el balanceador, sticky sessions o transport solo `websocket`. Mientras tanto el polling de 15 s del front cubre cualquier pérdida.

## Tests

- `api/src/modules/realtime/realtime.gateway.spec.ts` — auth del handshake (token por `auth`/header, rol, complejo) y rooms.
- `api/src/modules/realtime/realtime.emitter.spec.ts` — payload reconstruido, no lanza ante errores.
- `notification.created`: unit en `realtime.emitter.spec.ts` y `realtime.gateway.spec.ts` (sin e2e de socket).
- `api/test/e2e/realtime-payment-events.e2e-spec.ts` — con `socket.io-client`: handshake (sin token, token inválido, no admin → rechazo; admin ok), aislamiento por complejo con payload solo de ids, no emite si la subida falla, y los `kind` aprobado, rechazado, registrado y anulado.
