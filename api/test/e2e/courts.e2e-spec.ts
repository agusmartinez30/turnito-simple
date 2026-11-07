import request from 'supertest';
import { SEED_COMPLEX } from '../../prisma/seed';
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
  resetDatabase,
  TestContext,
} from '../setup';

/** Checklist E2E de docs/03-courts.md. Clock fijo en TEST_NOW = 2026-09-12 15:00 -03:00. */
describe('Complex & Courts (e2e)', () => {
  let ctx: TestContext;
  let token: string;
  let adminToken: string;
  let customerId: string;
  let demoId: string;
  let surId: string;
  const url = (path: string) => `${ctx.prefix}${path}`;
  const get = (path: string) =>
    request(ctx.app.getHttpServer())
      .get(url(path))
      .set('Authorization', `Bearer ${token}`);
  /** Listado de canchas del jugador: siempre con el complejo explícito (docs/15-multi-complex.md). */
  const courts = (qs = '') =>
    get(`/courts?complexId=${demoId}${qs ? `&${qs}` : ''}`);

  const TODAY = '2026-09-12';
  const TOMORROW = '2026-09-13';

  beforeAll(async () => {
    await resetDatabase();
    ctx = await createTestApp();
    const login = await request(ctx.app.getHttpServer())
      .post(url('/auth/login'))
      .send({ email: 'ana@demo.com', password: 'password123' });
    token = login.body.data.accessToken as string;
    const adminLogin = await request(ctx.app.getHttpServer())
      .post(url('/auth/login'))
      .send({ email: 'admin@demo.com', password: 'password123' });
    adminToken = adminLogin.body.data.accessToken as string;
    customerId = (await createCustomer({ complexId: (await getComplex()).id }))
      .id;
    demoId = (await getComplex()).id;
    surId = (await getComplex('complejo-sur')).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('GET /complex', () => {
    it('como admin → 200 con su complejo (slug, timezone, cancellationWindowHours)', async () => {
      const admin = await loginAs(ctx, 'admin@demo.com');
      const res = await as(ctx, admin).get('/complex');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        id: demoId,
        slug: SEED_COMPLEX.slug,
        name: SEED_COMPLEX.name,
        address: SEED_COMPLEX.address,
        timezone: SEED_COMPLEX.timezone,
        cancellationWindowHours: SEED_COMPLEX.cancellationWindowHours,
        autoConfirmPublicRequests: false,
        bankCbu: null,
        bankAlias: null,
        bankHolderName: null,
        instagramUrl: null,
        facebookUrl: null,
        tiktokUrl: null,
        youtubeUrl: null,
        contactWhatsapp: null,
        logoUrl: null,
      });
      const sur = await loginAs(ctx, 'admin.sur@demo.com');
      expect((await as(ctx, sur).get('/complex')).body.data.slug).toBe(
        'complejo-sur',
      );
    });

    it('como jugador → 403 (no tiene complejo; usa /public/c/:slug/complex)', async () => {
      const res = await get('/complex');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('sin token → 401', async () => {
      const res = await request(ctx.app.getHttpServer()).get(url('/complex'));
      expect(res.status).toBe(401);
    });
  });

  describe('GET /courts', () => {
    it('→ 7 canchas activas ordenadas por sortOrder, sin "Cancha vieja" y con la forma del contrato', async () => {
      const res = await courts();
      expect(res.status).toBe(200);
      const names = res.body.data.map((c: { name: string }) => c.name);
      expect(names).toEqual([
        'Pádel 1',
        'Pádel 2',
        'Pádel 3',
        'Fútbol 5 A',
        'Fútbol 5 B',
        'Fútbol 7',
        'Tenis 1',
      ]);
      expect(res.body.data[0]).toEqual({
        id: expect.any(String),
        complexId: expect.any(String),
        name: 'Pádel 1',
        sport: 'PADEL',
        surface: 'cemento',
        isIndoor: true,
        slotDurationMinutes: 90,
        openTime: '08:00',
        closeTime: '23:00',
        pricePerSlot: 12000,
        isActive: true,
      });
      expect(res.body.data[0]).not.toHaveProperty('sortOrder');
      expect(res.body.data[0]).not.toHaveProperty('createdAt');
      expect(res.body.data[0]).not.toHaveProperty('imageUrl'); // null → omitido
    });

    it('filtros: sport=PADEL → 3; sport=PADEL&indoor=true → 2; indoor=false → 4', async () => {
      expect((await courts('sport=PADEL')).body.data).toHaveLength(3);
      expect((await courts('sport=PADEL&indoor=true')).body.data).toHaveLength(
        2,
      );
      expect((await courts('indoor=false')).body.data).toHaveLength(4);
    });

    it('sport=HOCKEY → 400; indoor=maybe → 400', async () => {
      const bad = await courts('sport=HOCKEY');
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('VALIDATION_ERROR');
      expect(bad.body.error.details).toHaveProperty('sport');

      const maybe = await courts('indoor=maybe');
      expect(maybe.status).toBe(400);
      expect(maybe.body.error.details).toHaveProperty('indoor');
    });

    it('complejo: jugador sin complexId → 400; complexId de Sur → solo sus canchas; admin sin complexId → las suyas', async () => {
      const missing = await get('/courts');
      expect(missing.status).toBe(400);
      expect(missing.body.error.details).toEqual({
        complexId: ['Indicá el complejo'],
      });

      const sur = await get(`/courts?complexId=${surId}`);
      expect(sur.body.data.map((c: { name: string }) => c.name)).toEqual([
        'Pádel Sur 1',
        'Fútbol 5 Sur',
      ]);

      const admin = await loginAs(ctx, 'admin@demo.com');
      const own = await as(ctx, admin).get('/courts');
      expect(own.status).toBe(200);
      expect(own.body.data).toHaveLength(7);

      const notUuid = await get('/courts?complexId=nope');
      expect(notUuid.status).toBe(400);
      expect(notUuid.body.error.details).toHaveProperty('complexId');
    });
  });

  describe('GET /courts/:id', () => {
    it('cancha activa → 200', async () => {
      const court = await getCourtByName('Fútbol 7');
      const res = await get(`/courts/${court.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: court.id,
        name: 'Fútbol 7',
        sport: 'FOOTBALL_7',
      });
    });

    it('"Cancha vieja" (inactiva) → 404; UUID inexistente → 404; "abc" → 400', async () => {
      const old = await getCourtByName('Cancha vieja');
      const inactive = await get(`/courts/${old.id}`);
      expect(inactive.status).toBe(404);
      expect(inactive.body).toEqual({
        error: { code: 'NOT_FOUND', message: 'Cancha no encontrada.' },
      });

      const missing = await get('/courts/99999999-9999-4999-8999-999999999999');
      expect(missing.status).toBe(404);

      const invalid = await get('/courts/abc');
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
      expect(invalid.body.error.details).toHaveProperty('id');
    });
  });

  describe('GET /courts/:id/availability', () => {
    let padel1Id: string;

    beforeAll(async () => {
      padel1Id = (await getCourtByName('Pádel 1')).id;
    });

    it('date=hoy → 200, 10 slots, los anteriores a la hora actual son PAST', async () => {
      const res = await get(`/courts/${padel1Id}/availability?date=${TODAY}`);
      expect(res.status).toBe(200);
      expect(res.body.data.date).toBe(TODAY);
      expect(res.body.data.timezone).toBe(SEED_COMPLEX.timezone);

      const slots = res.body.data.slots as {
        startsAt: string;
        endsAt: string;
        status: string;
      }[];
      expect(slots).toHaveLength(10);
      // now = 15:00 → 08:00, 09:30, 11:00, 12:30, 14:00 son PAST; 15:30 en adelante AVAILABLE.
      expect(slots.map((s) => s.status)).toEqual([
        ...Array<string>(5).fill('PAST'),
        ...Array<string>(5).fill('AVAILABLE'),
      ]);
      expect(slots[0].startsAt).toBe(`${TODAY}T08:00:00-03:00`);
      expect(slots[9].endsAt).toBe(`${TODAY}T23:00:00-03:00`);
    });

    it('reservar mañana 17:00 desde el panel → ese slot BOOKED y el resto AVAILABLE; cancelar → vuelve a AVAILABLE', async () => {
      const created = await request(ctx.app.getHttpServer())
        .post(url('/admin/bookings'))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          courtId: padel1Id,
          startsAt: `${TOMORROW}T17:00:00-03:00`,
          customerId,
        });
      expect(created.status).toBe(201);

      const booked = await get(
        `/courts/${padel1Id}/availability?date=${TOMORROW}`,
      );
      expect(booked.status).toBe(200);
      const statuses = Object.fromEntries(
        (booked.body.data.slots as { startsAt: string; status: string }[]).map(
          (s) => [s.startsAt, s.status],
        ),
      );
      expect(statuses[`${TOMORROW}T17:00:00-03:00`]).toBe('BOOKED');
      expect(
        Object.values(statuses).filter((s) => s === 'BOOKED'),
      ).toHaveLength(1);
      expect(
        Object.values(statuses).filter((s) => s === 'AVAILABLE'),
      ).toHaveLength(9);

      const cancelled = await request(ctx.app.getHttpServer())
        .patch(url(`/admin/bookings/${created.body.data.id}/cancel`))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(cancelled.status).toBe(200);

      const freed = await get(
        `/courts/${padel1Id}/availability?date=${TOMORROW}`,
      );
      expect(
        (freed.body.data.slots as { status: string }[]).every(
          (s) => s.status === 'AVAILABLE',
        ),
      ).toBe(true);
    });

    it('una reserva en otra cancha al mismo horario no afecta', async () => {
      const padel2 = await getCourtByName('Pádel 2');
      await createBooking({
        courtId: padel2.id,
        customerId,
        startsAt: new Date(`${TOMORROW}T20:00:00-03:00`),
      });
      const res = await get(
        `/courts/${padel1Id}/availability?date=${TOMORROW}`,
      );
      expect(
        (res.body.data.slots as { status: string }[]).every(
          (s) => s.status === 'AVAILABLE',
        ),
      ).toBe(true);
    });

    it('sin date → 400; date=2026-1-5 → 400; date=2026-02-30 → 400', async () => {
      const missing = await get(`/courts/${padel1Id}/availability`);
      expect(missing.status).toBe(400);
      expect(missing.body.error.details).toHaveProperty('date');

      const malformed = await get(
        `/courts/${padel1Id}/availability?date=2026-1-5`,
      );
      expect(malformed.status).toBe(400);
      expect(malformed.body.error.details.date).toEqual([
        'La fecha debe tener formato YYYY-MM-DD',
      ]);

      const unreal = await get(
        `/courts/${padel1Id}/availability?date=2026-02-30`,
      );
      expect(unreal.status).toBe(400);
      expect(unreal.body.error.details.date).toEqual(['La fecha no es válida']);
    });

    it('fuera de rango: ayer → 400; hoy+7 → 400; hoy+6 → 200', async () => {
      const yesterday = await get(
        `/courts/${padel1Id}/availability?date=2026-09-11`,
      );
      expect(yesterday.status).toBe(400);
      expect(yesterday.body.error.details.date).toEqual([
        'Solo se puede consultar disponibilidad hasta 7 días adelante',
      ]);

      expect(
        (await get(`/courts/${padel1Id}/availability?date=2026-09-19`)).status,
      ).toBe(400);
      expect(
        (await get(`/courts/${padel1Id}/availability?date=2026-09-18`)).status,
      ).toBe(200);
    });

    it('cancha inactiva → 404', async () => {
      const old = await getCourtByName('Cancha vieja');
      const res = await get(`/courts/${old.id}/availability?date=${TOMORROW}`);
      expect(res.status).toBe(404);
    });

    it('todos los startsAt/endsAt terminan en -03:00, nunca en Z', async () => {
      const res = await get(
        `/courts/${padel1Id}/availability?date=${TOMORROW}`,
      );
      for (const slot of res.body.data.slots as {
        startsAt: string;
        endsAt: string;
      }[]) {
        expect(slot.startsAt).toMatch(/-03:00$/);
        expect(slot.endsAt).toMatch(/-03:00$/);
      }
    });
  });
});
