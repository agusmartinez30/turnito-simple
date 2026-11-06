import request from 'supertest';
import {
  createBooking,
  createPayment,
  createCustomer,
  getComplex,
  getCourtByName,
} from '../factories';
import {
  as,
  createTestApp,
  loginAs,
  resetDatabase,
  Session,
  TestContext,
} from '../setup';

const GHOST = '99999999-9999-4999-8999-999999999999';
const TOMORROW = '2026-09-13';

/** Checklist E2E de docs/15-multi-complex.md: cada complejo ve solo lo suyo. */
describe('Multi-complex (e2e)', () => {
  let ctx: TestContext;
  let adminDemo: Session;
  let adminSur: Session;
  let demo: { id: string };
  let sur: { id: string };
  let padel1: { id: string };
  let padelSur: { id: string };
  let demoCustomer: { id: string };
  let surCustomer: { id: string };

  const pub = (slug: string, path: string) =>
    request(ctx.app.getHttpServer()).get(
      `${ctx.prefix}/public/c/${slug}${path}`,
    );

  beforeAll(async () => {
    await resetDatabase();
    ctx = await createTestApp();
    [adminDemo, adminSur] = await Promise.all([
      loginAs(ctx, 'admin@demo.com'),
      loginAs(ctx, 'admin.sur@demo.com'),
    ]);
    [demo, sur, padel1, padelSur] = await Promise.all([
      getComplex('complejo-demo'),
      getComplex('complejo-sur'),
      getCourtByName('Pádel 1'),
      getCourtByName('Pádel Sur 1'),
    ]);
    [demoCustomer, surCustomer] = await Promise.all([
      createCustomer({ complexId: demo.id, firstName: 'Cliente Demo' }),
      createCustomer({ complexId: sur.id, firstName: 'Cliente Sur' }),
    ]);
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('registro', () => {
    it('crea el complejo con su admin; el admin nuevo ve su complejo vacío', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`${ctx.prefix}/auth/register`)
        .send({
          complexName: 'Club Río',
          complexAddress: 'Av. Costanera 1500',
          timezone: 'America/Argentina/Cordoba',
          name: 'Carla',
          email: 'carla@clubrio.com',
          password: 'password123',
        });
      expect(res.status).toBe(201);
      const session: Session = {
        token: res.body.data.accessToken as string,
        id: res.body.data.user.id as string,
        email: 'carla@clubrio.com',
      };

      const complex = await as(ctx, session).get('/complex');
      expect(complex.body.data).toMatchObject({
        slug: 'club-rio',
        name: 'Club Río',
        timezone: 'America/Argentina/Cordoba',
      });
      expect((await as(ctx, session).get('/admin/courts')).body.data).toEqual(
        [],
      );
      expect((await pub('club-rio', '/complex')).body.data.address).toBe(
        'Av. Costanera 1500',
      );
    });
  });

  describe('aislamiento del panel', () => {
    let bookingId: string;
    let paymentId: string;

    beforeAll(async () => {
      const booking = await createBooking({
        courtId: padel1.id,
        customerId: demoCustomer.id,
        startsAt: new Date(`${TOMORROW}T17:00:00-03:00`),
      });
      bookingId = booking.id;
      paymentId = (
        await createPayment({ bookingId, registeredById: adminDemo.id })
      ).id;
    });

    it('cada :id de Demo es 404 para el admin de Sur, con el mismo body que un id inexistente', async () => {
      const sameAs404 = async (
        real: () => request.Test,
        ghost: () => request.Test,
      ) => {
        const [r, g] = await Promise.all([real(), ghost()]);
        expect(r.status).toBe(404);
        expect(g.status).toBe(404);
        expect(r.body).toEqual(g.body);
      };
      const s = as(ctx, adminSur);

      await sameAs404(
        () => s.get(`/admin/courts/${padel1.id}`),
        () => s.get(`/admin/courts/${GHOST}`),
      );
      await sameAs404(
        () => s.patch(`/admin/courts/${padel1.id}`, { name: 'Robada' }),
        () => s.patch(`/admin/courts/${GHOST}`, { name: 'Robada' }),
      );
      await sameAs404(
        () => s.get(`/admin/bookings/${bookingId}`),
        () => s.get(`/admin/bookings/${GHOST}`),
      );
      for (const action of ['cancel', 'confirm', 'start', 'finish']) {
        await sameAs404(
          () => s.patch(`/admin/bookings/${bookingId}/${action}`, {}),
          () => s.patch(`/admin/bookings/${GHOST}/${action}`, {}),
        );
      }
      await sameAs404(
        () =>
          s.post(`/admin/bookings/${bookingId}/payments`, {
            amount: 100,
            method: 'CASH',
          }),
        () =>
          s.post(`/admin/bookings/${GHOST}/payments`, {
            amount: 100,
            method: 'CASH',
          }),
      );
      await sameAs404(
        () =>
          s.patch(
            `/admin/bookings/${bookingId}/payments/${paymentId}/void`,
            {},
          ),
        () =>
          s.patch(`/admin/bookings/${GHOST}/payments/${paymentId}/void`, {}),
      );

      // Crear sobre una cancha ajena tampoco.
      const create = await s.post('/admin/bookings', {
        courtId: padel1.id,
        startsAt: `${TOMORROW}T18:30:00-03:00`,
        customerId: surCustomer.id,
      });
      expect(create.status).toBe(404);

      // Y nada cambió en Demo.
      expect(
        (await as(ctx, adminDemo).get(`/admin/bookings/${bookingId}`)).body.data
          .status,
      ).toBe('CONFIRMED');
    });

    it('los listados de Sur no incluyen nada de Demo', async () => {
      const s = as(ctx, adminSur);
      expect((await s.get('/admin/bookings')).body.data).toEqual([]);
      expect(
        (await s.get(`/admin/payments?date=2026-09-12`)).body.data.payments,
      ).toEqual([]);
      expect(
        (await s.get('/admin/courts')).body.data.map(
          (c: { name: string }) => c.name,
        ),
      ).toEqual(['Pádel Sur 1', 'Fútbol 5 Sur']);

      // Demo sí ve lo suyo.
      const d = as(ctx, adminDemo);
      expect((await d.get('/admin/bookings')).body.data).toHaveLength(1);
    });

    it('PATCH /admin/complex de Sur no toca Demo', async () => {
      const res = await as(ctx, adminSur).patch('/admin/complex', {
        name: 'Complejo Sur Renovado',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.slug).toBe('complejo-sur');
      expect((await pub('complejo-demo', '/complex')).body.data.name).toBe(
        'Complejo Demo',
      );
      expect((await pub('complejo-sur', '/complex')).body.data.name).toBe(
        'Complejo Sur Renovado',
      );
    });
  });

  describe('público por slug', () => {
    it('slug inexistente → 404 en todas las rutas', async () => {
      const res = await pub('no-existe', '/complex');
      expect(res.status).toBe(404);
      expect(res.body.error).toEqual({
        code: 'NOT_FOUND',
        message: 'Complejo no encontrado.',
      });
    });
  });

  describe('clientes', () => {
    it('un cliente pertenece a su complejo: el otro admin no lo ve ni puede reservar con él', async () => {
      const ajeno = await as(ctx, adminSur).get(
        `/admin/customers/${demoCustomer.id}`,
      );
      expect(ajeno.status).toBe(404);
      expect(ajeno.body.error.message).toBe('Cliente no encontrado.');

      const reserva = await as(ctx, adminSur).post('/admin/bookings', {
        courtId: padelSur.id,
        startsAt: `${TOMORROW}T11:00:00-03:00`,
        customerId: demoCustomer.id,
      });
      expect(reserva.status).toBe(404);

      const propia = await as(ctx, adminSur).post('/admin/bookings', {
        courtId: padelSur.id,
        startsAt: `${TOMORROW}T11:00:00-03:00`,
        customerId: surCustomer.id,
      });
      expect(propia.status).toBe(201);
      expect(propia.body.data.court.name).toBe('Pádel Sur 1');

      const lista = await as(ctx, adminSur).get('/admin/customers');
      expect(
        (lista.body.data as Array<{ id: string }>).map((c) => c.id),
      ).not.toContain(demoCustomer.id);
    });
  });
});
