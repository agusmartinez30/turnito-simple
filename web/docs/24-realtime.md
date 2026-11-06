# 24 — Tiempo real en el admin (Socket.IO)

> Contraparte de la API: [`api/docs/24-realtime-events.md`](../../api/docs/24-realtime-events.md). Pantallas afectadas: [`12-admin-payments.md`](./12-admin-payments.md) y el detalle de reserva. Origen de los eventos: [`23-public-payment-page.md`](./23-public-payment-page.md) (subida de comprobantes).

## Objetivo

Que el detalle de reserva y el listado de pagos del admin se refresquen apenas llega un comprobante o cambia un pago, sin esperar al polling de 15 s.

> **Estado de verificación**: esta integración **no se probó en un navegador contra una API corriendo**. Está verificada por `tsc`, `eslint`, `prettier` y `build`; el lado API tiene tests unitarios y e2e con `socket.io-client`.

## Código (`web/src/features/realtime/`)

| Archivo | Rol |
|---|---|
| `AdminRealtimeProvider.tsx` | Abre **una** conexión Socket.IO y escucha `payment.changed` |
| `invalidate-payment-changed.ts` | Traduce el evento a invalidaciones de React Query |

- **Montaje**: `web/src/app/(admin)/layout.tsx` envuelve el contenido con `<AdminRealtimeProvider>` dentro de `AdminGate`, así que solo se conecta un admin ya autenticado.
- **URL**: origen de `API_BASE_URL` + `/admin` (namespace). Si la URL no se puede parsear, no conecta.
- **Token**: `auth` en forma de callback; llama a `getAccessToken()` en **cada (re)conexión**, así un token renovado se usa sin recrear el socket.
- **Rechazo**: si `connect_error` trae `unauthorized` (o `forbidden`/`token`), se hace `disconnect()` y **deja de reintentar**. Otros errores de red siguen con el reintento automático de Socket.IO.
- **Cleanup**: al desmontar se quitan los listeners y se desconecta.
- **Best-effort**: todo está en `try/catch` y los fallos son silenciosos; nunca afectan a la UI.

## Evento `payment.changed`

Payload `{ complexId, bookingId, kind }` con `kind` ∈ `proof_submitted | proof_approved | proof_rejected | payment_registered | payment_voided`. Ante cualquier `kind`, `invalidatePaymentChanged` invalida (refetch de lo que esté montado):

| Query key | Pantalla |
|---|---|
| `paymentProofKeys.list(bookingId)` | Comprobantes del detalle de reserva |
| `adminBookingKeys.all` | Detalle y listados de reservas |
| `adminPaymentKeys.all` | Listado/ledger de `/admin/payments` |
| `['admin', 'customers']` | Clientes (saldos) |

Replica lo que ya invalidan las mutaciones de aprobar/confirmar.

## Toast

En `proof_submitted` se muestra `toast.info('Nuevo comprobante recibido')`, deduplicado **por `bookingId` durante 5 s** (varios eventos seguidos de la misma reserva muestran un solo aviso).

## Fallback: polling

El `refetchInterval` de 15 s de `useAdminBooking`, `usePaymentProofs` y `usePaymentsLedger` **se mantiene**. Si el socket cae, es rechazado o la API corre en varias réplicas sin adaptador, la UI igual converge en hasta 15 s.

## Checklist manual (pendiente)

- [ ] Con API y web corriendo, abrir el detalle de una reserva como admin, subir un comprobante desde `/app/<slug>/pagar/<id>` y ver que aparece sin esperar 15 s, con el toast.
- [ ] Aprobar/rechazar desde otra pestaña de admin del mismo complejo actualiza la primera.
- [ ] Un admin de otro complejo no recibe nada.
- [ ] Con token inválido no hay reintentos en loop (un solo `unauthorized`).
