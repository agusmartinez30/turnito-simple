import { createCustomer, getComplex, getCourtByName } from '../factories';
import {
  as,
  createTestApp,
  loginAs,
  resetDatabase,
  Session,
  TestContext,
} from '../setup';

/** Checklist E2E de docs/07-admin-courts.md. Clock fijo en 2026-09-12 15:00 -03:00. */
describe('Admin courts (e2e)', () => {
  let ctx: TestContext;
  let admin: Session;
  let ana: Session;
  let padel1: { id: string };
  let complexId: string;

  const newCourt = {
    name: 'Pádel 4',
    sport: 'PADEL',
    surface: 'cemento',
    isIndoor: true,
    openTime: '08:00',
    closeTime: '22:00',
    slotDurationMinutes: 90,
    pricePerSlot: 11000,
  };

  beforeAll(async () => {
    await resetDatabase();
    ctx = await createTestApp();
    [admin, ana] = await Promise.all([
      loginAs(ctx, 'admin@demo.com'),
      loginAs(ctx, 'ana@demo.com'),
    ]);
    padel1 = await getCourtByName('Pádel 1');
    complexId = (await getComplex()).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('GET /admin/courts', () => {
    it('→ 8 canchas incluida "Cancha vieja" inactiva, orden sortOrder, forma AdminCourt', async () => {
      const res = await as(ctx, admin).get('/admin/courts');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(8);
      const last = res.body.data[7];
      expect(last).toMatchObject({
        name: 'Cancha vieja',
        isActive: false,
        sortOrder: 99,
        futureBookingsCount: 0,
      });
      expect(res.body.data[0]).toEqual({
        id: padel1.id,
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
        sortOrder: 1,
        createdAt: expect.stringMatching(/-03:00$/),
        updatedAt: expect.stringMatching(/-03:00$/),
        futureBookingsCount: 0,
      });
    });

    it('GET /admin/courts/:id devuelve también inactivas; inexistente → 404; abc → 400', async () => {
      const old = await getCourtByName('Cancha vieja');
      const res = await as(ctx, admin).get(`/admin/courts/${old.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);
      expect(
        (
          await as(ctx, admin).get(
            '/admin/courts/99999999-9999-4999-8999-999999999999',
          )
        ).status,
      ).toBe(404);
      expect((await as(ctx, admin).get('/admin/courts/abc')).status).toBe(400);
    });
  });

  describe('POST /admin/courts', () => {
    let padel4Id: string;

    it('"Pádel 4" → 201 con sortOrder 100 (max 99 + 1); aparece en GET /courts de ana con 9 slots', async () => {
      const res = await as(ctx, admin).post('/admin/courts', newCourt);
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        ...newCourt,
        sortOrder: 100,
        isActive: true,
        futureBookingsCount: 0,
      });
      padel4Id = res.body.data.id as string;

      const list = await as(ctx, ana).get(`/courts?complexId=${complexId}`);
      expect(list.body.data.map((c: { name: string }) => c.name)).toContain(
        'Pádel 4',
      );
      const availability = await as(ctx, ana).get(
        `/courts/${padel4Id}/availability?date=2026-09-13`,
      );
      expect(availability.body.data.slots).toHaveLength(9);
      expect(availability.body.data.slots[8]).toMatchObject({
        startsAt: '2026-09-13T20:00:00-03:00',
        endsAt: '2026-09-13T21:30:00-03:00',
      });
    });

    it('nombre repetido → 409 COURT_NAME_ALREADY_EXISTS; en minúscula → 201 (case-sensitive)', async () => {
      const dup = await as(ctx, admin).post('/admin/courts', newCourt);
      expect(dup.status).toBe(409);
      expect(dup.body.error).toEqual({
        code: 'COURT_NAME_ALREADY_EXISTS',
        message: 'Ya existe una cancha con ese nombre.',
      });

      const lower = await as(ctx, admin).post('/admin/courts', {
        ...newCourt,
        name: 'pádel 4',
      });
      expect(lower.status).toBe(201);
      expect(lower.body.data.sortOrder).toBe(101);
    });

    it('validaciones: closeTime === openTime → 400; duración 10 → 400; sin turno completo → 400; ftp:// → 400; extra → 400', async () => {
      const close = await as(ctx, admin).post('/admin/courts', {
        ...newCourt,
        name: 'X1',
        closeTime: '08:00',
      });
      expect(close.status).toBe(400);
      expect(close.body.error.details).toEqual({
        closeTime: ['Debe ser distinta de la hora de apertura'],
      });

      const dur = await as(ctx, admin).post('/admin/courts', {
        ...newCourt,
        name: 'X2',
        slotDurationMinutes: 10,
      });
      expect(dur.status).toBe(400);
      expect(dur.body.error.details).toHaveProperty('slotDurationMinutes');

      const none = await as(ctx, admin).post('/admin/courts', {
        ...newCourt,
        name: 'X3',
        openTime: '10:00',
        closeTime: '10:30',
        slotDurationMinutes: 60,
      });
      expect(none.status).toBe(400);
      expect(none.body.error.details).toEqual({
        slotDurationMinutes: ['No entra ningún turno completo en ese horario'],
      });

      const ftp = await as(ctx, admin).post('/admin/courts', {
        ...newCourt,
        name: 'X4',
        imageUrl: 'ftp://x/y.jpg',
      });
      expect(ftp.status).toBe(400);
      expect(ftp.body.error.details).toHaveProperty('imageUrl');

      const extra = await as(ctx, admin).post('/admin/courts', {
        ...newCourt,
        name: 'X5',
        complexId: 'x',
      });
      expect(extra.status).toBe(400);
      expect(extra.body.error.details).toHaveProperty('complexId');

      expect(
        (await as(ctx, admin).get('/courts')).body.data.map(
          (c: { name: string }) => c.name,
        ),
      ).not.toEqual(expect.arrayContaining(['X1', 'X2', 'X3', 'X4', 'X5']));
    });
  });

  describe('PATCH /admin/courts/:id', () => {
    let anaBookingId: string;

    it('precio de Pádel 1 a 13000 → 200; una reserva previa conserva 12000, una nueva sale 13000', async () => {
      const customer = await createCustomer({ complexId });
      const before = await as(ctx, admin).post('/admin/bookings', {
        courtId: padel1.id,
        startsAt: '2026-09-13T17:00:00-03:00',
        customerId: customer.id,
      });
      expect(before.status).toBe(201);
      anaBookingId = before.body.data.id as string;

      const res = await as(ctx, admin).patch(`/admin/courts/${padel1.id}`, {
        pricePerSlot: 13000,
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        pricePerSlot: 13000,
        futureBookingsCount: 1,
      });

      expect(
        (await as(ctx, admin).get(`/admin/bookings/${anaBookingId}`)).body.data
          .price,
      ).toBe(12000);
      const after = await as(ctx, admin).post('/admin/bookings', {
        courtId: padel1.id,
        startsAt: '2026-09-14T17:00:00-03:00',
        customerId: customer.id,
      });
      expect(after.body.data.price).toBe(13000);
      await as(ctx, admin).patch(
        `/admin/bookings/${after.body.data.id}/cancel`,
        {},
      );
    });

    it('con reserva futura: openTime/slotDuration → 200; isActive:false → 409; name → 200; openTime igual → 200', async () => {
      const open = await as(ctx, admin).patch(`/admin/courts/${padel1.id}`, {
        openTime: '09:00',
      });
      expect(open.status).toBe(200);
      expect(open.body.data).toMatchObject({
        openTime: '09:00',
        futureBookingsCount: 1,
      });
      expect(
        (
          await as(ctx, admin).patch(`/admin/courts/${padel1.id}`, {
            slotDurationMinutes: 60,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await as(ctx, admin).patch(`/admin/courts/${padel1.id}`, {
            isActive: false,
          })
        ).status,
      ).toBe(409);

      const rename = await as(ctx, admin).patch(`/admin/courts/${padel1.id}`, {
        name: 'Pádel Uno',
      });
      expect(rename.status).toBe(200);
      expect(rename.body.data.name).toBe('Pádel Uno');
      await as(ctx, admin).patch(`/admin/courts/${padel1.id}`, {
        name: 'Pádel 1',
      });

      const same = await as(ctx, admin).patch(`/admin/courts/${padel1.id}`, {
        openTime: '08:00',
        sport: 'TENNIS',
      });
      expect(same.status).toBe(200);
      await as(ctx, admin).patch(`/admin/courts/${padel1.id}`, {
        sport: 'PADEL',
      });
    });

    it('cancelada la reserva: openTime 09:00 → 200 y la availability de mañana empieza 09:00', async () => {
      expect(
        (
          await as(ctx, admin).patch(
            `/admin/bookings/${anaBookingId}/cancel`,
            {},
          )
        ).status,
      ).toBe(200);
      const res = await as(ctx, admin).patch(`/admin/courts/${padel1.id}`, {
        openTime: '09:00',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.futureBookingsCount).toBe(0);
      const availability = await as(ctx, ana).get(
        `/courts/${padel1.id}/availability?date=2026-09-13`,
      );
      expect(availability.body.data.slots[0].startsAt).toBe(
        '2026-09-13T09:00:00-03:00',
      );
    });

    it('desactivar Tenis 1 → desaparece de /courts, /courts/:id 404, la reserva manual 404; reactivar la devuelve', async () => {
      const tenis = await getCourtByName('Tenis 1');
      const off = await as(ctx, admin).patch(`/admin/courts/${tenis.id}`, {
        isActive: false,
      });
      expect(off.status).toBe(200);
      expect(off.body.data.isActive).toBe(false);

      expect(
        (
          await as(ctx, ana).get(`/courts?complexId=${complexId}`)
        ).body.data.map((c: { name: string }) => c.name),
      ).not.toContain('Tenis 1');
      expect((await as(ctx, ana).get(`/courts/${tenis.id}`)).status).toBe(404);
      expect(
        (
          await as(ctx, admin).post('/admin/bookings', {
            courtId: tenis.id,
            startsAt: '2026-09-13T10:00:00-03:00',
            customerId: (await createCustomer({ complexId })).id,
          })
        ).status,
      ).toBe(404);
      expect(
        (await as(ctx, admin).get(`/admin/courts/${tenis.id}`)).body.data
          .isActive,
      ).toBe(false);

      const on = await as(ctx, admin).patch(`/admin/courts/${tenis.id}`, {
        isActive: true,
      });
      expect(on.status).toBe(200);
      expect(
        (
          await as(ctx, ana).get(`/courts?complexId=${complexId}`)
        ).body.data.map((c: { name: string }) => c.name),
      ).toContain('Tenis 1');
    });

    it('{} → 400; surface null → 200 sin surface; nombre repetido → 409; merge deja horario inválido → 400; inexistente → 404', async () => {
      const empty = await as(ctx, admin).patch(
        `/admin/courts/${padel1.id}`,
        {},
      );
      expect(empty.status).toBe(400);
      expect(empty.body.error.details).toEqual({ _: ['No hay cambios'] });

      const nulled = await as(ctx, admin).patch(`/admin/courts/${padel1.id}`, {
        surface: null,
      });
      expect(nulled.status).toBe(200);
      expect(nulled.body.data).not.toHaveProperty('surface');
      await as(ctx, admin).patch(`/admin/courts/${padel1.id}`, {
        surface: 'cemento',
      });

      const dup = await as(ctx, admin).patch(`/admin/courts/${padel1.id}`, {
        name: 'Pádel 2',
      });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('COURT_NAME_ALREADY_EXISTS');

      const bad = await as(ctx, admin).patch(`/admin/courts/${padel1.id}`, {
        closeTime: '09:00',
      }); // igual al openTime actual (09:00)
      expect(bad.status).toBe(400);
      expect(bad.body.error.details).toHaveProperty('closeTime');

      expect(
        (
          await as(ctx, admin).patch(
            '/admin/courts/99999999-9999-4999-8999-999999999999',
            { name: 'Fantasma' },
          )
        ).status,
      ).toBe(404);
    });
  });
});
