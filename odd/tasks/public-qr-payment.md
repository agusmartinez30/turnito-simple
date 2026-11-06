# public-qr-payment

## Objective
Players scan a QR at the venue, pick the booking they played, see booking + bank data, fill personal data, upload a payment proof; the complex approves/rejects it (admin review already exists).

## Decisions (user)
- Booking discovery: public list with minimal data (court, time, **full name of the person who booked**; no phone), recent bookings only (today + yesterday).
- Existing flow reused: `/app/[slug]/pagar/[id]` (booking, bank data, proof upload) and admin proof review.

## Defaults assumed (not yet confirmed by user)
- Personal data = existing `payerName` + `playersCount` (no new fields).
- Proof format stays PDF-only for now (images = T5, optional).

## Constraints
- Listing endpoint must be `@Public()`, throttled, return minimal fields, only the complex of `:slug`.
- Bank data stays out of `/public/c/:slug/complex` (e2e enforces it).
- ~400 authored changed lines per task is a planning heuristic only.

## Tasks
- [x] T1 API: `GET /public/c/:slug/bookings` (today+yesterday in complex tz, not cancelled; id, court name/sport, startsAt/endsAt, customer name, payment summary) + unit/e2e tests. Route: delegated (2+ non-trivial files).
- [x] T2 Web: QR landing `web/src/app/(open)/app/[slug]/page.tsx` listing bookings as cards linking to `pagar/[id]`. Route: delegated.
- [x] T3 Web admin: QR for `${origin}/app/${slug}` (download/print) near settings or PaymentLinkCard. Needs a QR lib. Route: delegated.
- [x] T4 Docs: api/docs + web/docs updates.
- [ ] T5 (optional, needs confirmation) Accept image proofs (screenshots).

## Evidence
(explorer handoff: payment page, proof upload, admin review already exist; missing = QR landing, public list, QR generation)

## Next step
T5 pending user decision (image proofs). Browser check of landing/QR print still pending. T4 done (docs only). T3 evidence: tsc/eslint/prettier clean, build OK, qrcode.react via pnpm, print/download not exercised in a browser. T2 evidence: tsc/eslint/prettier clean, next build OK, not exercised in a browser. T1 evidence: unit 4/4, e2e public-bookings + full suites green (254 unit, 191 e2e), tsc/eslint clean. Choice: CONFIRMED bookings only.
