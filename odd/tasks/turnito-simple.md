# turnito-simple

## Objective
Create `turnito-simple`: a reduced copy of `sports-system` (NestJS + Prisma API, Next.js web) that keeps only the
bookings module: bookings list, create booking, booking detail, payments inside a booking, the public payment link,
and payments management (payment proofs review / ledger). Minimum support kept: auth, complex, courts, customers,
storage, users. The source repo is never modified.

## Route
Delegated direct, single writer. Trigger evidence: 2+ non-trivial files, broad mapping across api and web.

## Tasks
- [x] T1 Scaffold + copy api (robocopy excluding node_modules/dist/.env)
- [x] T2 Trim api + prisma schema + fresh `init` migration with hand-appended SQL constraints
- [x] T3 API build, lint, unit and e2e green
- [ ] T4 Copy + trim web
- [ ] T5 Web typecheck, lint, build green
- [ ] T6 README

## Decisions
- Prisma: models Complex, Court, User, Customer, Booking, Payment, PaymentProof; BookingSource = PLAYER | ADMIN | PUBLIC.
  Kept `Complex.contactWhatsapp` and `autoConfirmPublicRequests` (still in the complex contract; avoids churn).
- Migration: the latest state of the original history has NO exclusion constraint (the per-customer overlap was dropped
  on purpose in `customers` migration; only the partial unique index on active court+start remains). `btree_gist` is
  still created. `bookings_customer_or_admin_chk` rewritten without TOURNAMENT.
- `isSuperadmin` removed from the session user (no superadmin module); `activeRecurring` removed from customer stats;
  `items`/`recurringBookingId`/`tournamentMatch` removed from the booking response.
- Added `PublicComplexController` (`GET /public/c/:slug/complex`) because the public payment pages need the complex
  branding; the original served it from the (cut) public requests controller.
- Docker: compose project is named `turnito-simple` (port 5441, db `turnito_simple`, test db `turnito_simple_test`).
- `.env.test` BOOKING_MAX_DAYS_AHEAD set to 7 (the original value 14 contradicted the courts e2e expectations).

## Progress / evidence
- API: `pnpm build` ok, `pnpm lint` clean, `pnpm test` 26 suites / 250 tests pass, `pnpm test:e2e` 13 suites / 187 tests pass.
