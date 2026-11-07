# admin-agenda

Objective: replace admin Reservas list with an Agenda (courts x time grid) with quick booking creation. Detail page /admin/bookings/[id] stays. No API changes.
Plan: C:\Users\Usuario\.claude\plans\ajuste-en-admin-quiero-rippling-kitten.md

## Tasks
- [x] T1 Agenda feature (web/src/features/admin-agenda) + route /admin/agenda + NewBookingDialog default props. Route: delegated (2+ non-trivial files). Commit 5a74574
- [x] T2 Nav/redirect switch to Agenda; remove bookings list (page, List, Table, Filters); keep shared helpers (moved to admin-bookings/lib/booking-status.ts); re-point links. Route: delegated (same writer). Commit d94dc60
- [x] T3 Docs + stale comments update. Route: delegated (same writer). Commit: see git log (docs(web): document admin agenda)

## Progress
Branch: feat/admin-agenda (unrelated uncommitted changes from feat/bw-minimal-theme are carried over; do NOT commit them)
Verification: pnpm -C web typecheck OK; pnpm -C web lint OK; pnpm -C web build OK (/admin/agenda route present, /admin/bookings list gone). rg for '/admin/bookings?' links in src: none.
Test exception: web has no unit-test runner (no test script/deps); pure helpers in admin-agenda/lib/grid.ts are covered only by typecheck/build.
Not run in a browser (no dev server): visual/interaction checks from the plan remain pending manual QA (cross-midnight court, mobile scroll, realtime refresh).
Realtime/NotificationBell only push to /admin/bookings/[id]; no list-route matching, no change needed. Realtime invalidates by adminBookingKeys.all so the agenda refreshes.
