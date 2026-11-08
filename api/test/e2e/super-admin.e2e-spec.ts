import { BookingStatus, PaymentProofStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { setRole } from '../../scripts/set-role';
import {
  as,
  createTestApp,
  loginAs,
  prisma,
  resetDatabase,
  Session,
  TestContext,
} from '../setup';
import {
  createBooking,
  createCustomer,
  createPaymentProof,
  createUser,
  getComplex,
  getCourtByName,
} from '../factories';

/** Platform panel for SUPER_ADMIN (docs/26-super-admin.md). TEST_NOW = 2026-09-12 15:00 Buenos Aires. */
describe('Super admin (e2e)', () => {
  let ctx: TestContext;
  let superAdmin: Session;
  let admin: Session;
  let adminSur: Session;
  let demoId: string;
  let surId: string;

  const at = (iso: string) => new Date(iso);

  beforeAll(async () => {
    await resetDatabase();
    ctx = await createTestApp();
    [superAdmin, admin, adminSur] = await Promise.all([
      loginAs(ctx, 'superadmin@demo.com'),
      loginAs(ctx, 'admin@demo.com'),
      loginAs(ctx, 'admin.sur@demo.com'),
    ]);
    demoId = (await getComplex()).id;
    surId = (await getComplex('complejo-sur')).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('access', () => {
    it('GET /auth/me returns role SUPER_ADMIN without complex', async () => {
      const res = await as(ctx, superAdmin).get('/auth/me');
      expect(res.body.data).toMatchObject({
        role: 'SUPER_ADMIN',
        complexId: null,
      });
    });

    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(ctx.app.getHttpServer()).get(
        `${ctx.prefix}/super-admin/complexes`,
      );
      expect(res.status).toBe(401);
    });

    it('rejects an ADMIN with 403 FORBIDDEN on both endpoints', async () => {
      const list = await as(ctx, admin).get('/super-admin/complexes');
      expect(list.status).toBe(403);
      expect(list.body.error.code).toBe('FORBIDDEN');

      const patch = await as(ctx, admin).patch(
        `/super-admin/complexes/${demoId}/suspension`,
        { suspended: true },
      );
      expect(patch.status).toBe(403);
      expect(patch.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects a SUPER_ADMIN on the complex-scoped admin routes', async () => {
      const res = await as(ctx, superAdmin).get('/admin/courts');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /super-admin/complexes', () => {
    beforeAll(async () => {
      const court1 = await getCourtByName('Pádel 1');
      const court2 = await getCourtByName('Pádel 2');
      const customer = await createCustomer({ complexId: demoId });
      const mk = (courtId: string, iso: string, status?: BookingStatus) =>
        createBooking({
          courtId,
          customerId: customer.id,
          startsAt: at(iso),
          status,
        });

      const first = await mk(court1.id, '2026-09-05T10:00:00-03:00');
      const second = await mk(court2.id, '2026-09-20T18:00:00-03:00');
      const cancelled = await mk(
        court1.id,
        '2026-09-06T10:00:00-03:00',
        BookingStatus.CANCELLED,
      );
      const august = await mk(court1.id, '2026-08-31T20:00:00-03:00');
      // Boundary: 00:30 local on October 1st is outside September in Buenos Aires.
      await mk(court2.id, '2026-10-01T00:30:00-03:00');

      await createPaymentProof({
        bookingId: first.id,
        status: PaymentProofStatus.APPROVED,
      });
      await createPaymentProof({
        bookingId: first.id,
        status: PaymentProofStatus.REJECTED,
      });
      await createPaymentProof({
        bookingId: second.id,
        status: PaymentProofStatus.PENDING,
      });
      // Proofs of cancelled / out-of-month bookings do not count.
      await createPaymentProof({
        bookingId: cancelled.id,
        status: PaymentProofStatus.APPROVED,
      });
      await createPaymentProof({
        bookingId: august.id,
        status: PaymentProofStatus.APPROVED,
      });
    });

    it('lists every complex with the month stats and ratios', async () => {
      const res = await as(ctx, superAdmin).get(
        '/super-admin/complexes?month=2026-09',
      );
      expect(res.status).toBe(200);

      const byId = Object.fromEntries(
        (res.body.data as Array<{ id: string; createdAt: string }>).map((c) => [
          c.id,
          c,
        ]),
      );
      expect(Object.keys(byId)).toEqual(
        expect.arrayContaining([demoId, surId]),
      );
      expect(byId[demoId]).toMatchObject({
        slug: 'complejo-demo',
        name: 'Complejo Demo',
        suspendedAt: null,
        month: '2026-09',
        bookingsCount: 2,
        proofsCount: 3,
        approvedProofsCount: 1,
        proofsPerBooking: 1.5,
        approvedProofsPerBooking: 0.5,
      });
      expect(byId[demoId].createdAt).toEqual(expect.any(String));
      expect(byId[surId]).toMatchObject({
        bookingsCount: 0,
        proofsCount: 0,
        approvedProofsCount: 0,
        proofsPerBooking: null,
        approvedProofsPerBooking: null,
      });
    });

    it('defaults to the current month (September 2026 in TEST_NOW)', async () => {
      const res = await as(ctx, superAdmin).get('/super-admin/complexes');
      const demo = (res.body.data as Array<{ id: string }>).find(
        (c) => c.id === demoId,
      );
      expect(demo).toMatchObject({ month: '2026-09', bookingsCount: 2 });
    });

    it('another month only counts its own bookings', async () => {
      const res = await as(ctx, superAdmin).get(
        '/super-admin/complexes?month=2026-08',
      );
      const demo = (res.body.data as Array<{ id: string }>).find(
        (c) => c.id === demoId,
      );
      expect(demo).toMatchObject({
        bookingsCount: 1,
        proofsCount: 1,
        approvedProofsCount: 1,
      });
    });

    it.each(['2026-13', '2026-9', 'septiembre', '2026-09-01'])(
      'rejects month=%s with 400 VALIDATION_ERROR',
      async (month) => {
        const res = await as(ctx, superAdmin).get(
          `/super-admin/complexes?month=${month}`,
        );
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      },
    );
  });

  describe('PATCH /super-admin/complexes/:id/suspension', () => {
    const suspend = (id: string, suspended: unknown) =>
      as(ctx, superAdmin).patch(`/super-admin/complexes/${id}/suspension`, {
        suspended,
      });

    afterAll(async () => {
      await suspend(surId, false);
    });

    it('suspending blocks its admin and the public endpoints; activating restores them', async () => {
      // Active baseline.
      expect((await as(ctx, adminSur).get('/admin/courts')).status).toBe(200);
      const publicGet = () =>
        request(ctx.app.getHttpServer()).get(
          `${ctx.prefix}/public/c/complejo-sur/complex`,
        );
      expect((await publicGet()).status).toBe(200);

      const suspended = await suspend(surId, true);
      expect(suspended.status).toBe(200);
      expect(suspended.body.data).toMatchObject({
        id: surId,
        slug: 'complejo-sur',
        suspendedAt: expect.any(String),
      });

      const adminRes = await as(ctx, adminSur).get('/admin/courts');
      expect(adminRes.status).toBe(403);
      expect(adminRes.body.error.code).toBe('COMPLEX_SUSPENDED');

      for (const path of [
        '/public/c/complejo-sur/complex',
        '/public/c/complejo-sur/bookings',
        '/public/c/complejo-sur/bookings/99999999-9999-4999-8999-999999999999/payment',
      ]) {
        const res = await request(ctx.app.getHttpServer()).get(
          `${ctx.prefix}${path}`,
        );
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('COMPLEX_SUSPENDED');
      }

      // Other complexes are untouched.
      expect((await as(ctx, admin).get('/admin/courts')).status).toBe(200);
      const demoPublic = await request(ctx.app.getHttpServer()).get(
        `${ctx.prefix}/public/c/complejo-demo/complex`,
      );
      expect(demoPublic.status).toBe(200);

      // The admin can still log in (the UI shows the notice).
      await loginAs(ctx, 'admin.sur@demo.com');

      const activated = await suspend(surId, false);
      expect(activated.status).toBe(200);
      expect(activated.body.data.suspendedAt).toBeNull();
      expect((await as(ctx, adminSur).get('/admin/courts')).status).toBe(200);
      expect((await publicGet()).status).toBe(200);
    });

    it('suspending twice keeps the first date', async () => {
      const first = await suspend(surId, true);
      const second = await suspend(surId, true);
      expect(second.body.data.suspendedAt).toBe(first.body.data.suspendedAt);
    });

    it('unknown complex → 404 NOT_FOUND', async () => {
      const res = await suspend('99999999-9999-4999-8999-999999999999', true);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('invalid body → 400 VALIDATION_ERROR', async () => {
      const res = await suspend(surId, 'yes');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('malformed id → 400 VALIDATION_ERROR', async () => {
      const res = await suspend('not-a-uuid', true);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('bootstrap', () => {
    it('setRole SUPER_ADMIN clears the complex and the DB forbids a SUPER_ADMIN with complex', async () => {
      const user = await createUser({ complexId: surId });
      const spare = await createUser({ complexId: surId }); // so Sur keeps an admin

      await setRole(prisma, user.email, UserRole.SUPER_ADMIN);
      const promoted = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(promoted).toMatchObject({ role: 'SUPER_ADMIN', complexId: null });

      await expect(
        prisma.user.update({
          where: { id: spare.id },
          data: { role: UserRole.SUPER_ADMIN },
        }),
      ).rejects.toThrow(/users_super_admin_no_complex_chk/);

      // Idempotent, and demotable back to PLAYER.
      await setRole(prisma, user.email, UserRole.SUPER_ADMIN);
      await setRole(prisma, user.email, UserRole.PLAYER);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role,
      ).toBe('PLAYER');
    });
  });
});
