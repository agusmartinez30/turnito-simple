import { NotificationType } from '@prisma/client';
import request from 'supertest';
import {
  createBooking,
  createCustomer,
  getComplex,
  getCourtByName,
} from '../factories';
import {
  as,
  createTestApp,
  loginAs,
  prisma,
  resetDatabase,
  Session,
  TestContext,
} from '../setup';

const PDF = Buffer.from('%PDF-1.7\n%%EOF\n');

interface NotificationBody {
  id: string;
  type: string;
  bookingId: string;
  payerName: string;
  declaredAmount: number;
  readAt: string | null;
  booking: {
    courtName: string;
    customerName: string | null;
    price: number;
    paidAmount: number;
    balance: number;
  };
}

/** Admin notification center (docs: payment notifications). */
describe('Admin notifications (e2e)', () => {
  let ctx: TestContext;
  let adminDemo: Session;
  let adminSur: Session;
  let player: Session;
  let demoId: string;
  let surId: string;
  let demoBookingId: string;
  let surBookingId: string;
  let ipSeq = 0;

  /** Creates a notification straight in the DB; `minutesAgo` controls the ordering. */
  const notify = (
    complexId: string,
    bookingId: string,
    payerName: string,
    minutesAgo = 0,
  ) =>
    prisma.notification.create({
      data: {
        complexId,
        bookingId,
        type: NotificationType.PROOF_SUBMITTED,
        payerName,
        declaredAmount: 4000,
        createdAt: new Date(Date.now() - minutesAgo * 60_000),
      },
    });

  const upload = (bookingId: string) =>
    request(ctx.app.getHttpServer())
      .post(
        `${ctx.prefix}/public/c/complejo-demo/bookings/${bookingId}/payment-proof`,
      )
      .set('X-Forwarded-For', `10.40.0.${(ipSeq++ % 250) + 1}`)
      .field('payerName', 'Marta Ruiz')
      .field('amount', '2500')
      .attach('file', PDF, {
        filename: 'comprobante.pdf',
        contentType: 'application/pdf',
      });

  beforeAll(async () => {
    await resetDatabase();
    ctx = await createTestApp();
    [adminDemo, adminSur, player] = await Promise.all([
      loginAs(ctx, 'admin@demo.com'),
      loginAs(ctx, 'admin.sur@demo.com'),
      loginAs(ctx, 'ana@demo.com'),
    ]);
    const demo = await getComplex();
    const sur = await getComplex('complejo-sur');
    demoId = demo.id;
    surId = sur.id;
    const customer = await createCustomer({
      complexId: demoId,
      firstName: 'Lucía',
      lastName: 'Paz',
    });
    const demoCourt = await getCourtByName('Pádel 1');
    demoBookingId = (
      await createBooking({
        courtId: demoCourt.id,
        customerId: customer.id,
        startsAt: new Date(Date.UTC(2033, 0, 1, 9, 0, 0)),
        price: 10000,
      })
    ).id;
    const surCourt = await prisma.court.findFirstOrThrow({
      where: { complexId: surId },
    });
    const surCustomer = await createCustomer({ complexId: surId });
    surBookingId = (
      await createBooking({
        courtId: surCourt.id,
        customerId: surCustomer.id,
        startsAt: new Date(Date.UTC(2033, 0, 1, 10, 0, 0)),
        price: 10000,
      })
    ).id;
  });

  afterEach(async () => {
    await prisma.notification.deleteMany();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lists the latest notifications newest first with a booking summary', async () => {
    await notify(demoId, demoBookingId, 'Vieja', 10);
    await notify(demoId, demoBookingId, 'Nueva', 1);

    const res = await as(ctx, adminDemo).get('/admin/notifications');

    expect(res.status).toBe(200);
    const data = res.body.data as NotificationBody[];
    expect(data.map((n) => n.payerName)).toEqual(['Nueva', 'Vieja']);
    expect(data[0]).toMatchObject({
      type: 'PROOF_SUBMITTED',
      bookingId: demoBookingId,
      declaredAmount: 4000,
      readAt: null,
      booking: {
        courtName: 'Pádel 1',
        customerName: 'Lucía Paz',
        price: 10000,
        paidAmount: 0,
        balance: 10000,
      },
    });
  });

  it('caps the list at 30 entries', async () => {
    await prisma.notification.createMany({
      data: Array.from({ length: 32 }, (_, i) => ({
        complexId: demoId,
        bookingId: demoBookingId,
        type: NotificationType.PROOF_SUBMITTED,
        payerName: `P${i}`,
        declaredAmount: 100,
        createdAt: new Date(Date.now() - i * 1000),
      })),
    });
    const res = await as(ctx, adminDemo).get('/admin/notifications');
    expect((res.body.data as unknown[]).length).toBe(30);
    expect((res.body.data as NotificationBody[])[0].payerName).toBe('P0');
  });

  it('counts unread notifications and drops the count when one is read', async () => {
    const first = await notify(demoId, demoBookingId, 'A');
    await notify(demoId, demoBookingId, 'B');
    expect(
      (await as(ctx, adminDemo).get('/admin/notifications/unread-count')).body
        .data,
    ).toEqual({ count: 2 });

    const read = await as(ctx, adminDemo).post(
      `/admin/notifications/${first.id}/read`,
    );
    expect(read.status).toBe(200);
    expect(read.body.data.readAt).not.toBeNull();
    expect(
      (await as(ctx, adminDemo).get('/admin/notifications/unread-count')).body
        .data,
    ).toEqual({ count: 1 });
  });

  it('marking a notification read twice keeps the first readAt', async () => {
    const n = await notify(demoId, demoBookingId, 'A');
    const a = await as(ctx, adminDemo).post(
      `/admin/notifications/${n.id}/read`,
    );
    const b = await as(ctx, adminDemo).post(
      `/admin/notifications/${n.id}/read`,
    );
    expect(b.status).toBe(200);
    expect(b.body.data.readAt).toBe(a.body.data.readAt);
  });

  it('marks every unread notification of the complex as read', async () => {
    await notify(demoId, demoBookingId, 'A');
    await notify(demoId, demoBookingId, 'B');
    const res = await as(ctx, adminDemo).post('/admin/notifications/read-all');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ updated: 2 });
    expect(
      (await as(ctx, adminDemo).get('/admin/notifications/unread-count')).body
        .data,
    ).toEqual({ count: 0 });
  });

  describe('tenant isolation', () => {
    it('never shows or counts notifications of another complex', async () => {
      await notify(demoId, demoBookingId, 'Demo');
      await notify(surId, surBookingId, 'Sur');

      const demo = await as(ctx, adminDemo).get('/admin/notifications');
      const sur = await as(ctx, adminSur).get('/admin/notifications');
      expect(
        (demo.body.data as NotificationBody[]).map((n) => n.payerName),
      ).toEqual(['Demo']);
      expect(
        (sur.body.data as NotificationBody[]).map((n) => n.payerName),
      ).toEqual(['Sur']);
      expect(
        (await as(ctx, adminSur).get('/admin/notifications/unread-count')).body
          .data,
      ).toEqual({ count: 1 });
    });

    it('404s reading a notification of another complex and leaves it unread', async () => {
      const foreign = await notify(surId, surBookingId, 'Sur');
      const res = await as(ctx, adminDemo).post(
        `/admin/notifications/${foreign.id}/read`,
      );
      expect(res.status).toBe(404);
      expect(
        (
          await prisma.notification.findUniqueOrThrow({
            where: { id: foreign.id },
          })
        ).readAt,
      ).toBeNull();
    });

    it('read-all only touches the own complex', async () => {
      await notify(demoId, demoBookingId, 'Demo');
      const foreign = await notify(surId, surBookingId, 'Sur');
      await as(ctx, adminDemo).post('/admin/notifications/read-all');
      expect(
        (
          await prisma.notification.findUniqueOrThrow({
            where: { id: foreign.id },
          })
        ).readAt,
      ).toBeNull();
    });
  });

  describe('access control', () => {
    it('rejects anonymous callers and non-admins', async () => {
      const anon = await request(ctx.app.getHttpServer()).get(
        `${ctx.prefix}/admin/notifications`,
      );
      expect(anon.status).toBe(401);
      for (const path of ['', '/unread-count']) {
        expect(
          (await as(ctx, player).get(`/admin/notifications${path}`)).status,
        ).toBe(403);
      }
      expect(
        (await as(ctx, player).post('/admin/notifications/read-all')).status,
      ).toBe(403);
    });

    it('rejects a malformed id', async () => {
      const res = await as(ctx, adminDemo).post(
        '/admin/notifications/nope/read',
      );
      expect(res.status).toBe(400);
    });
  });

  describe('proof submission', () => {
    it('creates an unread PROOF_SUBMITTED notification for the complex', async () => {
      const res = await upload(demoBookingId);
      expect(res.status).toBe(201);

      const rows = await prisma.notification.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        complexId: demoId,
        bookingId: demoBookingId,
        type: NotificationType.PROOF_SUBMITTED,
        payerName: 'Marta Ruiz',
        declaredAmount: 2500,
        readAt: null,
      });
      const proof = await prisma.paymentProof.findFirstOrThrow({
        where: { bookingId: demoBookingId },
        orderBy: { createdAt: 'desc' },
      });
      expect(rows[0].proofId).toBe(proof.id);

      const list = await as(ctx, adminDemo).get('/admin/notifications');
      expect((list.body.data as NotificationBody[])[0].payerName).toBe(
        'Marta Ruiz',
      );
      expect(
        (await as(ctx, adminSur).get('/admin/notifications/unread-count')).body
          .data,
      ).toEqual({ count: 0 });
    });

    it('creates no notification when the upload is rejected', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(
          `${ctx.prefix}/public/c/complejo-demo/bookings/${demoBookingId}/payment-proof`,
        )
        .set('X-Forwarded-For', `10.40.1.${(ipSeq++ % 250) + 1}`)
        .field('payerName', 'Marta Ruiz')
        .field('amount', '999999')
        .attach('file', PDF, {
          filename: 'comprobante.pdf',
          contentType: 'application/pdf',
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await prisma.notification.count()).toBe(0);
    });
  });
});
