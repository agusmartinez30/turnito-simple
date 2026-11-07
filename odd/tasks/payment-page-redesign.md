# payment-page-redesign

## Objective
Redesign the public "Pagar tu turno" screen (UI/UX only): clearer hierarchy, mobile-first, same visual identity.

## Scope
- `web/src/features/public-payment/**` (view, schemas, new sub-components)
- `web/docs/23-public-payment-page.md`
- No API/contract/business-logic changes. No auto split per player, no auto-fill amount, remove "Usar el saldo completo".

## Tasks
- [x] T1 Summary card (court, date/time icons, status badge, totals right-aligned, "Saldo pendiente del turno" highlight)
- [x] T2 Bank data card (icon, description, highlighted alias, per-field copy + "Copiado", no mobile overflow)
- [x] T3 Form card (payer name, players 1-50 optional, amount with "$" + non-blocking over-balance warning, upload zone, full-width submit, states)
- [x] T4 Docs update + checks (typecheck, lint, tests)

## Route
Delegated direct: one writer (file ~550 lines + 2+ non-trivial files; preparation reading).

## Progress / evidence
- Implemented by writer: new `BookingSummaryCard`, `BankTransferCard`, `PaymentForm`, `ProofUploadField`; `PublicPaymentView` slimmed (552 -> ~190 lines); `schemas.ts`: `buildProofFormSchema()` no longer takes `max` (over-balance is a soft warning via `isAmountOverBalance`), fixed unescaped dot in file-extension regex.
- Test-first exception: web has no test runner (no vitest/jest), so no RED/GREEN evidence; UI/pure logic verified via typecheck + lint only.
- `pnpm typecheck`: clean. `npx eslint src/features/public-payment`: clean.
- Not exercised in a browser. Docs `web/docs/23-public-payment-page.md` updated.
- Next: parent commits.
