# 26 - Super admin (platform panel)

A `SUPER_ADMIN` operates the whole platform: it sees every complex, its monthly activity, and can suspend or reactivate a complex. It belongs to no complex (`users.complex_id` is NULL, enforced by the CHECK `users_super_admin_no_complex_chk`).

## Bootstrap

- `pnpm admin:promote-super <email>` (`ts-node scripts/set-role.ts SUPER_ADMIN <email>`): sets `role = SUPER_ADMIN` and `complexId = null`. Idempotent. Refuses when the user is the only ADMIN of their complex. `pnpm admin:demote <email>` turns a SUPER_ADMIN back into PLAYER.
- The dev seed creates `superadmin@demo.com` (same `SEED_PASSWORD` as the other demo users).

## Endpoints (`@Roles(SUPER_ADMIN)`, everything else gets 403 `FORBIDDEN`)

### GET /super-admin/complexes?month=YYYY-MM

`month` is optional (default: current month in each complex timezone); other formats are 400 `VALIDATION_ERROR`. Returns an array ordered by name:

| Field | Meaning |
| --- | --- |
| `id`, `slug`, `name`, `createdAt` | Complex identity |
| `suspendedAt` | ISO date, `null` = active |
| `month` | Month the stats refer to |
| `bookingsCount` | Non-CANCELLED bookings whose `startsAt` falls in the month (complex timezone) |
| `proofsCount` | Payment proofs (any status) attached to those bookings |
| `approvedProofsCount` | Same, `APPROVED` only |
| `proofsPerBooking`, `approvedProofsPerBooking` | Counts divided by `bookingsCount`, 2 decimals; `null` when `bookingsCount = 0` |

### PATCH /super-admin/complexes/:id/suspension

Body `{ "suspended": boolean }`. Sets `suspendedAt` (keeping the original date if already suspended) or clears it. Returns the same summary as the list (current month). Unknown id: 404 `NOT_FOUND`.

## Suspension effects

- A suspended complex ADMIN can still log in, but `RolesGuard` answers every `@Roles(ADMIN)` route with 403 `COMPLEX_SUSPENDED`.
- Every `/public/c/:slug/...` endpoint answers 403 `COMPLEX_SUSPENDED`. There is no public booking creation endpoint today; the public payment-proof upload is covered.
- The `ComplexService` cache is invalidated on suspension. With several API instances the cache would need a short TTL (see the note in `ComplexService`).
- The realtime gateway needs no change: it only admits ADMINs of a complex.
