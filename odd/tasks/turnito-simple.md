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
- [x] T4 Copy + trim web
- [x] T5 Web typecheck, lint, build green
- [x] T6 README
- [x] T7 Settings page (complex data + bank details)

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
- Web: `pnpm exec tsc --noEmit` clean, `pnpm lint` clean, `pnpm build` ok (13 routes). recharts removed.
- Web decisions: creating a booking lived in the (cut) agenda, so a new `NewBookingDialog` (court + day + start time
  computed client-side from the court grid, customer picker, price, note) was added to the bookings list. The API
  stays the validator of the slot. Trimmed `public-request` feature keeps only the public complex fetch, hooks and
  OpenShell (needed by the public payment page).
- Smoke test: built API served login, bookings list and the public complex endpoint on port 3011.
- Not done: browser-level check of the web UI (no Playwright run), so the new booking dialog is verified by
  typecheck/lint/build only.

## T7 Settings (bank details)
- Ported minimal `admin-settings` (api, hooks, schemas, form-errors, BankDetailsForm, ComplexSettingsForm with name and
  address only, SettingsPage), route `/admin/settings` and a "Configuración" item in AdminShell. Appearance,
  notifications, social, logo, cancellation window and auto-confirm were skipped (cut features).
- API needed no change: `PATCH /admin/complex` is ADMIN-only and already validates `bankCbu` (22 digits), `bankAlias`
  (6-20 chars) and `bankHolderName` (max 100); `test/e2e/admin-complex.e2e-spec.ts` already covers them.
- Saving writes and invalidates the `['complex']` query, which the payment link card reads.
- Evidence: web `tsc --noEmit` clean, `pnpm lint` clean, `pnpm build` ok (`/admin/settings` listed).
- Browser check (Playwright from the npx cache, Chromium): logged in, saved CBU/alias/holder on /admin/settings
  (toast shown), API returned the values, the booking detail no longer shows the "missing bank data" warning and the
  public payment page showed CBU, alias and holder. The dev server already running on :3000 pointed at :3001 (not this
  project's API), so browser calls were rerouted to this project's API on :3011 with Playwright request routing.
