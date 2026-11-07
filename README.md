# Paga la cancha

A reduced version of the sports-complex booking system that keeps **only the bookings module**:

- Bookings list (filters by date, court, status and customer)
- Create a booking (manual / counter booking)
- Booking detail with its payments (register, void) and the **public payment link**
- Payments management: ledger and payment-proof review (approve / reject)

Supporting pieces kept to make that work: auth (register / login / logout / me), complex profile and bank data,
courts, customers, file storage (payment proofs and complex logo) and users.

Everything else from the original product (tournaments, classes, products, stats, dashboard, agenda, recurring
bookings, WhatsApp, superadmin, settings pages) was removed.

## Structure

```
api/    NestJS 11 + Prisma 6 + PostgreSQL 16 REST API
web/    Next.js 16 (App Router) + React 19 + Tailwind 4 admin panel and public payment page
odd/    Task tracking for the initial extraction
```

### API modules

`auth`, `users`, `complex`, `courts`, `customers`, `storage`, `admin-bookings`, `admin-courts`, `admin-customers`,
`admin-complex` (profile, bank data, logo), `admin-payments` (payments + payment proofs + ledger) and `public`
(public complex profile and the payment link / payment proof upload).

Data model (`api/prisma/schema.prisma`): `Complex`, `Court`, `User`, `Customer`, `Booking`, `Payment`, `PaymentProof`.
There is a single `init` migration; it ends with hand-written SQL for what Prisma cannot express (partial unique
index that prevents double bookings per court and start time, CHECK constraints, `btree_gist`).

## Setup

Requirements: Node 22+, pnpm 10, Docker.

```bash
# 1. Database (Postgres 16 on port 5441, databases turnito_simple and turnito_simple_test)
cd api
docker compose up -d

# 2. API
cp .env.example .env          # then set a real JWT_SECRET (32+ characters)
pnpm install
pnpm prisma migrate deploy
pnpm prisma db seed           # demo complexes, courts, customers and users
pnpm start:dev                # http://localhost:3001/api/v1

# 3. Web (in another terminal)
cd web
cp .env.example .env.local
pnpm install
pnpm dev                      # http://localhost:3000
```

Seed users (password `password123`): `admin@demo.com` (Complejo Demo) and `admin.sur@demo.com` (Complejo Sur).

### Environment

| App | Variable | Purpose |
| --- | --- | --- |
| api | `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN` | Required |
| api | `BOOKING_MAX_DAYS_AHEAD`, `TRUST_PROXY` | Booking window and proxy trust |
| api | `STORAGE_PROVIDER` (`stub` or `supabase`) and the `SUPABASE_*` variables | Payment proof and logo storage |
| web | `NEXT_PUBLIC_API_URL` | API base URL |
| web | `NEXT_PUBLIC_APP_NAME` | Product name on login / sign-up (default `Paga la cancha`) |

### Tests and checks

```bash
cd api
pnpm test        # unit tests
pnpm test:e2e    # needs the database; applies migrations to turnito_simple_test
pnpm lint && pnpm build

cd web
pnpm typecheck && pnpm lint && pnpm build
```

## Web routes

| Route | Purpose |
| --- | --- |
| `/login`, `/register` | Authentication (register creates a complex and its first admin) |
| `/admin` | Redirects to `/admin/bookings` |
| `/admin/bookings` | Bookings list, with **Nueva reserva** to create one |
| `/admin/bookings/[id]` | Booking detail, payments, payment link, cancel / confirm / start / finish |
| `/admin/payments` | Payments ledger and payment-proof review |
| `/admin/customers`, `/admin/customers/[id]`, `/admin/customers/new` | Customers (needed by the booking picker) |
| `/admin/courts`, `/admin/courts/[id]`, `/admin/courts/new` | Courts (needed by the booking form) |
| `/admin/settings` | Complex data (name, address) and bank details (holder, CBU/CVU, alias) used by the payment link |
| `/app/[slug]/pagar/[id]` | Public payment page: bank data and payment proof upload |

## API routes (prefix `/api/v1`)

- Auth: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- Bookings: `POST/GET /admin/bookings`, `GET /admin/bookings/:id`, `PATCH /admin/bookings/:id/{cancel,confirm,start,finish}`
- Payments: `/admin/bookings/:id/payments`, `/admin/payments` (ledger), `/admin/bookings/:id/payment-proofs` (list, file, approve, reject)
- Settings: `PATCH /admin/complex` (ADMIN only; name, address, bank details)
- Courts / customers / complex: `/admin/courts`, `/admin/customers`, `/admin/complex`, `/complex`, `/courts`
- Public: `GET /public/c/:slug/complex`, `GET /public/c/:slug/bookings/:id/payment`,
  `POST /public/c/:slug/bookings/:id/payment-proof`
- Health: `GET /health`

## Notes

- Feature docs inherited from the original project live in `api/docs` and `web/docs` (Spanish). They are kept only
  for the bookings and payments areas.
- Booking creation from the panel is a dialog on the bookings list (court, day, start time, optional customer, price,
  note). The original product created bookings from the agenda grid, which is not part of this project.
