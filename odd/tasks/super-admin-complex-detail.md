# super-admin-complex-detail

**Objective:** Super admin screen with a complex's detail: revenue per booking ("turno"), split by receipt-approved transfers (core app goal) vs cash.

**Scope:** `GET /super-admin/complexes/:id/revenue?month=YYYY-MM` + web page `/admin/complexes/[id]` linked from the complexes table.

**Definitions:** TRANSFER payment (non-voided, originates from approved proof) = "comprobantes"; CASH payment (non-voided) = "efectivo". Bookings: non-cancelled, startsAt within the month in the complex timezone.

## Tasks
- [x] T1 API: service method + controller route + DTO + unit spec (route: delegated writer; trigger: 2+ non-trivial files)
- [x] T2 Web: api/hook/types + detail page + link from table (route: delegated writer)

## Evidence
- T1: RED observed (4 failing revenueFor tests), then GREEN. api `npx jest src/modules/super-admin`: 14 passed; api `npx tsc --noEmit`: clean.
- T2: web `npx tsc --noEmit`: clean; `npx eslint` on touched paths: clean. Not committed.
