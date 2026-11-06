import { AddressInfo } from 'node:net';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { StubStorageProvider } from '../../src/modules/storage/providers/stub.provider';
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

interface PaymentChanged {
  complexId: string;
  bookingId: string;
  kind: string;
}

const EVENT = 'payment.changed';
const PDF = Buffer.from('%PDF-1.7\n%%EOF\n');

/** Socket.IO admin channel (realtime-payment-events). Needs a real listening port. */
describe('Realtime payment events (e2e)', () => {
  let ctx: TestContext;
  let baseUrl: string;
  let adminDemo: Session;
  let adminSur: Session;
  let player: Session;
  let demoId: string;
  let courtId: string;
  let customerId: string;
  let seq = 0;
  let ipSeq = 0;
  const sockets: Socket[] = [];

  const newBooking = () => {
    seq += 1;
    return createBooking({
      courtId,
      customerId,
      startsAt: new Date(Date.UTC(2032, 0, 1, 10 + seq, 0, 0)),
      price: 10000,
    });
  };

  /** Resolves with the connected socket, or rejects with the handshake error. */
  const connect = (auth: Record<string, unknown>): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const socket = io(`${baseUrl}/admin`, {
        auth,
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => reject(err));
    });

  const collect = (socket: Socket): PaymentChanged[] => {
    const received: PaymentChanged[] = [];
    socket.on(EVENT, (payload: PaymentChanged) => received.push(payload));
    return received;
  };

  const waitFor = async (received: unknown[], count = 1): Promise<void> => {
    const deadline = Date.now() + 3000;
    while (received.length < count && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
  };

  const settle = () => new Promise((r) => setTimeout(r, 200));

  const upload = (bookingId: string, amount: string) =>
    request(ctx.app.getHttpServer())
      .post(
        `${ctx.prefix}/public/c/complejo-demo/bookings/${bookingId}/payment-proof`,
      )
      .set('X-Forwarded-For', `10.30.0.${(ipSeq++ % 250) + 1}`)
      .field('payerName', 'Juan Perez')
      .field('amount', amount)
      .attach('file', PDF, {
        filename: 'comprobante.pdf',
        contentType: 'application/pdf',
      });

  const pendingProof = async (bookingId: string) => {
    const fileKey = `payment-proofs/${bookingId}/rt${seq}.pdf`;
    await ctx.app.get(StubStorageProvider).uploadPrivate({
      key: fileKey,
      body: PDF,
      contentType: 'application/pdf',
      bucket: 'paymentProofs',
    });
    return prisma.paymentProof.create({
      data: {
        bookingId,
        fileKey,
        payerName: 'Juan Perez',
        declaredAmount: 4000,
      },
    });
  };

  beforeAll(async () => {
    await resetDatabase();
    ctx = await createTestApp();
    await ctx.app.listen(0);
    const { port } = ctx.app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    [adminDemo, adminSur, player] = await Promise.all([
      loginAs(ctx, 'admin@demo.com'),
      loginAs(ctx, 'admin.sur@demo.com'),
      loginAs(ctx, 'ana@demo.com'),
    ]);
    demoId = (await getComplex()).id;
    courtId = (await getCourtByName('Pádel 1')).id;
    customerId = (await createCustomer({ complexId: demoId })).id;
  });

  afterEach(() => {
    for (const s of sockets.splice(0)) s.close();
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('handshake', () => {
    it('rejects a socket without token', async () => {
      await expect(connect({})).rejects.toThrow('unauthorized');
    });

    it('rejects an invalid token', async () => {
      await expect(connect({ token: 'garbage' })).rejects.toThrow(
        'unauthorized',
      );
    });

    it('rejects a non-admin user', async () => {
      await expect(connect({ token: player.token })).rejects.toThrow(
        'unauthorized',
      );
    });

    it('accepts an admin', async () => {
      const socket = await connect({ token: adminDemo.token });
      expect(socket.connected).toBe(true);
    });
  });

  describe('payment.changed', () => {
    it('reaches admins of the same complex only, with ids and kind only', async () => {
      const a = await connect({ token: adminDemo.token });
      const b = await connect({ token: adminSur.token });
      const receivedA = collect(a);
      const receivedB = collect(b);
      const booking = await newBooking();

      const res = await upload(booking.id, '4000');
      expect(res.status).toBe(201);

      await waitFor(receivedA);
      await settle();
      expect(receivedA).toEqual([
        { complexId: demoId, bookingId: booking.id, kind: 'proof_submitted' },
      ]);
      expect(Object.keys(receivedA[0]).sort()).toEqual([
        'bookingId',
        'complexId',
        'kind',
      ]);
      expect(receivedB).toEqual([]);
    });

    it('does not emit when the upload is rejected', async () => {
      const a = await connect({ token: adminDemo.token });
      const received = collect(a);
      const booking = await newBooking();

      const res = await upload(booking.id, '999999');

      expect(res.status).toBeGreaterThanOrEqual(400);
      await settle();
      expect(received).toEqual([]);
    });

    it('emits proof_approved on approve', async () => {
      const a = await connect({ token: adminDemo.token });
      const received = collect(a);
      const booking = await newBooking();
      const proof = await pendingProof(booking.id);

      const res = await as(ctx, adminDemo).post(
        `/admin/bookings/${booking.id}/payment-proofs/${proof.id}/approve`,
        {},
      );
      expect(res.status).toBe(200);

      await waitFor(received);
      expect(received).toEqual([
        { complexId: demoId, bookingId: booking.id, kind: 'proof_approved' },
      ]);
    });

    it('emits proof_rejected on reject', async () => {
      const a = await connect({ token: adminDemo.token });
      const received = collect(a);
      const booking = await newBooking();
      const proof = await pendingProof(booking.id);

      const res = await as(ctx, adminDemo).post(
        `/admin/bookings/${booking.id}/payment-proofs/${proof.id}/reject`,
        { reason: 'Ilegible' },
      );
      expect(res.status).toBe(200);

      await waitFor(received);
      expect(received).toEqual([
        { complexId: demoId, bookingId: booking.id, kind: 'proof_rejected' },
      ]);
    });

    it('emits payment_registered and payment_voided', async () => {
      const a = await connect({ token: adminDemo.token });
      const received = collect(a);
      const booking = await newBooking();

      const registered = await as(ctx, adminDemo).post(
        `/admin/bookings/${booking.id}/payments`,
        { amount: 2000, method: 'CASH' },
      );
      expect(registered.status).toBe(201);
      const paymentId = registered.body.data.payments[0].id as string;

      const voided = await as(ctx, adminDemo).patch(
        `/admin/bookings/${booking.id}/payments/${paymentId}/void`,
        {},
      );
      expect(voided.status).toBe(200);

      await waitFor(received, 2);
      expect(received.map((e) => e.kind)).toEqual([
        'payment_registered',
        'payment_voided',
      ]);
    });
  });
});
