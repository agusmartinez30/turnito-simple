# super-admin

Objective: SUPER_ADMIN role that lists/suspends all complexes and shows monthly stats (bookings, proofs, approved proofs per booking), reusing the /admin area with different screens.
Plan: C:\Users\Usuario\.claude\plans\quiero-crear-un-super-enumerated-mango.md
Branch: feat/super-admin
Delivery strategy: ask-on-risk (forecast ~600 changed lines: backend ~350, web ~250; two work units)

## Tasks
- [x] T1 API: migration (SUPER_ADMIN enum, Complex.suspendedAt, CHECK), super-admin module (list+stats, suspension), COMPLEX_SUSPENDED enforcement in RolesGuard + public endpoints, set-role/seed bootstrap, unit + e2e tests. Route: delegated writer (6+ non-trivial files).
- [ ] T2 Web: UserRole type/labels, AdminGate, role-based AdminShell nav, role-aware redirect, features/super-admin + /admin/complexes page, SUPER_ADMIN guard on complex routes. Route: delegated writer (6+ non-trivial files).

## Progress
Verification: pending
Mirror (Engram odd/super-admin/tasks): pending
