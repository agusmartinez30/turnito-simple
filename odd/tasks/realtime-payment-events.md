# realtime-payment-events

## Objective
Admin screens (booking detail, payments ledger) update instantly when a payer submits a proof or a payment changes, via WebSocket (Socket.IO), instead of waiting for 15 s polling.

## Decisions (user)
- Use WebSockets (user chose over SSE/polling).

## Defaults assumed (not confirmed)
- Admin-only for now (authenticated sockets, room per complex). Public payer page keeps its own polling.
- Events are lightweight "something changed" signals; web reacts by invalidating React Query caches. 15 s polling stays as a fallback if the socket drops.
- Railway, single replica -> in-process rooms, no Redis adapter.

## Constraints
- Socket auth reuses the existing admin auth (JWT); role-check admin; never broadcast across complexes.
- Emit only after the DB transaction commits.
- Payloads carry ids only (complexId, bookingId, kind), no PII.

## Tasks
- [x] T1 API: gateway (Socket.IO) + auth + complex rooms + event emission on proof created, proof approved/rejected, payment registered/voided; unit + e2e tests (socket.io-client). Route: delegated.
- [x] T2 Web admin: socket provider in the admin shell, subscribe and invalidate queries (admin booking detail, payment proofs, payments ledger, bookings list); fallback polling stays. Route: delegated.
- [x] T3 Docs (api + web).

## Evidence
- No WebSocket/SSE code exists today (rg: 0 matches). API on Railway, single replica (api/docs/18-storage.md:14).
- Current refresh: refetchInterval 15 s on useAdminBooking, usePaymentProofs, usePaymentsLedger (commit f8d8fdd).

## Next step
All tasks done. Pending: manual browser check (API + web together), and Railway env WEB_ORIGIN must match the web origin. T2 evidence: tsc/eslint/prettier/build clean; token via getAccessToken(), socket URL = API origin + /admin; never exercised against a running API in a browser. T1 evidence: jest 277, e2e 204 (realtime e2e 9), tsc/eslint/prettier clean. Exception: no recorded RED (impl written before tests). Namespace /admin, event `payment.changed` {complexId, bookingId, kind}; token via handshake.auth.token or Bearer header.
