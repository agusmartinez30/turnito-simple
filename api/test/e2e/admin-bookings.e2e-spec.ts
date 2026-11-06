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
  TEST_NOW,
  TestContext,
} from '../setup';

/**
 * Checklist E2E de docs/06-admin-bookings.md. Clock fijo en TEST_NOW = 2026-09-12 15:00 -03:00.
 * Pádel 1/2 (08:00–23:00, 90 min): slots 17:00 y 18:30. Pádel 3 (09:00–22:00, 90 min): 16:30, 18:00, 19:30.
 * Tenis 1 (08:00–21:00, 60 min).
 */
describe('Admin agenda & bookings (e2e)', () => {
  let ctx: TestContext;
  let admin: Session;
  let ana: Session;
  let padel1: { id: string };
  let padel2: { id: string };
  let padel3: { id: string };
  let tenis: { id: string };
  let anaCustomer: { id: string };
  let brunoCustomer: { id: string };
  let carlosCustomer: { id: string };
  let otroCustomer: { id: string };

  const TOMORROW = '2026-09-13';
  const t17 = `${TOMORROW}T17:00:00-03:00`;

  let anaBookingId: string;
  let brunoBookingId: string;
  let carlosBookingId: string;

  beforeAll(async () => {
    await resetDatabase();
    ctx = await createTestApp();
    [admin, ana] = await Promise.all([
      loginAs(ctx, 'admin@demo.com'),
      loginAs(ctx, 'ana@demo.com'),
    ]);
    [padel1, padel2, padel3, tenis] = await Promise.all([
      getCourtByName('Pádel 1'),
      getCourtByName('Pádel 2'),
      getCourtByName('Pádel 3'),
      getCourtByName('Tenis 1'),
    ]);
    const complexId = (await getComplex()).id;
    [anaCustomer, brunoCustomer, carlosCustomer, otroCustomer] =
      await Promise.all([
        createCustomer({
          complexId,
          firstName: 'Ana',
          lastName: 'Jugadora',
          phone: '+5491100009001',
        }),
        createCustomer({
          complexId,
          firstName: 'Bruno',
          lastName: 'Jugador',
          phone: null,
        }),
        createCustomer({
          complexId,
          firstName: 'Carlos',
          lastName: 'Pérez',
          phone: '+5491100000077',
        }),
        createCustomer({ complexId, firstName: 'Otro', phone: null }),
      ]);
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** Active booking occupying `courtId` at `startsAt` on `date`, read through the list endpoint. */
  const agendaSlot = async (
    courtId: string,
    startsAt: string,
    date = TOMORROW,
  ) => {
    const res = await as(ctx, admin).get(
      `/admin/bookings?date=${date}&order=asc`,
    );
    expect(res.status).toBe(200);
    const booking = (
      res.body.data as Array<{
        id: string;
        status: string;
        courtId: string;
        startsAt: string;
        customer: Record<string, unknown> | null;
        source: string;
        price: number;
        note?: string;
        payment: Record<string, unknown>;
      }>
    ).find(
      (b) =>
        b.courtId === courtId &&
        b.startsAt === startsAt &&
        b.status !== 'CANCELLED',
    );
    return { status: booking ? 'BOOKED' : 'AVAILABLE', booking };
  };

  describe('POST /admin/bookings', () => {
    it('reserva del panel (Pádel 1 17:00) aparece en el listado con el cliente completo', async () => {
      const created = await as(ctx, admin).post('/admin/bookings', {
        courtId: padel1.id,
        startsAt: t17,
        customerId: anaCustomer.id,
      });
      expect(created.status).toBe(201);
      anaBookingId = created.body.data.id as string;

      const slot = await agendaSlot(padel1.id, t17);
      expect(slot?.status).toBe('BOOKED');
      expect(slot?.booking).toMatchObject({
        id: anaBookingId,
        status: 'CONFIRMED',
        customer: {
          id: anaCustomer.id,
          name: 'Ana Jugadora',
          firstName: 'Ana',
          lastName: 'Jugadora',
          phone: '+5491100009001',
          isActive: true,
        },
        price: 12000,
        source: 'ADMIN',
        payment: { paidAmount: 0, balance: 12000, status: 'UNPAID' },
      });
    });

    it('otro cliente en Pádel 2 → 201 con source ADMIN, createdBy y nota', async () => {
      const res = await as(ctx, admin).post('/admin/bookings', {
        courtId: padel2.id,
        startsAt: t17,
        customerId: brunoCustomer.id,
        note: 'Paga al llegar',
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({
        id: expect.any(String),
        courtId: padel2.id,
        status: 'CONFIRMED',
        price: 12000,
        startsAt: t17,
        endsAt: `${TOMORROW}T18:30:00-03:00`,
        createdAt: expect.stringMatching(/-03:00$/),
        court: {
          id: padel2.id,
          name: 'Pádel 2',
          sport: 'PADEL',
          isIndoor: true,
        },
        customer: {
          id: brunoCustomer.id,
          name: 'Bruno Jugador',
          firstName: 'Bruno',
          lastName: 'Jugador',
          isActive: true,
        },
        source: 'ADMIN',
        note: 'Paga al llegar',
        createdBy: { id: admin.id, name: 'Admin Demo' },
        payment: { paidAmount: 0, balance: 12000, status: 'UNPAID' },
      });
      brunoBookingId = res.body.data.id as string;
    });

    it('cliente de mostrador (Carlos en Tenis 1 10:00) con precio 8000 → 201', async () => {
      const res = await as(ctx, admin).post('/admin/bookings', {
        courtId: tenis.id,
        startsAt: `${TOMORROW}T10:00:00-03:00`,
        customerId: carlosCustomer.id,
        price: 8000,
        note: 'Trae 4 personas',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.customer).toEqual({
        id: carlosCustomer.id,
        name: 'Carlos Pérez',
        firstName: 'Carlos',
        lastName: 'Pérez',
        phone: '+5491100000077',
        isActive: true,
      });
      expect(res.body.data.price).toBe(8000);
      carlosBookingId = res.body.data.id as string;

      const slot = await agendaSlot(tenis.id, `${TOMORROW}T10:00:00-03:00`);
      expect(slot?.booking).toMatchObject({
        customer: { name: 'Carlos Pérez' },
        price: 8000,
        source: 'ADMIN',
        note: 'Trae 4 personas',
      });
    });

    it('el mismo cliente puede alquilar dos canchas superpuestas; el slot ya tomado → 409', async () => {
      // Sin exclusion sobre customer_id: un grupo alquila dos canchas a la misma hora.
      const overlap = await as(ctx, admin).post('/admin/bookings', {
        courtId: padel3.id,
        startsAt: `${TOMORROW}T18:00:00-03:00`,
        customerId: anaCustomer.id,
      });
      expect(overlap.status).toBe(201);

      const taken = await as(ctx, admin).post('/admin/bookings', {
        courtId: padel1.id,
        startsAt: t17,
        customerId: otroCustomer.id,
      });
      expect(taken.status).toBe(409);
      expect(taken.body.error.code).toBe('SLOT_UNAVAILABLE');
    });

    it('sin ventana de días para el panel: 2026-11-15 → 201', async () => {
      const far = await as(ctx, admin).post('/admin/bookings', {
        courtId: padel1.id,
        startsAt: '2026-11-15T17:00:00-03:00',
        customerId: otroCustomer.id,
      });
      expect(far.status).toBe(201);
    });

    it('turno de mostrador sin cliente → 201 con customer null y source ADMIN', async () => {
      const startsAt = `${TOMORROW}T16:30:00-03:00`;
      const res = await as(ctx, admin).post('/admin/bookings', {
        courtId: padel3.id,
        startsAt,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.customer).toBeNull();
      expect(res.body.data.source).toBe('ADMIN');

      const slot = await agendaSlot(padel3.id, startsAt);
      expect(slot?.booking?.customer).toBeNull();
    });

    it('validaciones: pasado → 422; 18:15 → 400; cliente inexistente → 404; archivado → 422; cancha inactiva → 404', async () => {
      const past = await as(ctx, admin).post('/admin/bookings', {
        courtId: padel1.id,
        startsAt: '2026-09-12T14:00:00-03:00',
        customerId: otroCustomer.id,
      });
      expect(past.status).toBe(422);
      expect(past.body.error.code).toBe('BOOKING_IN_PAST');

      const misaligned = await as(ctx, admin).post('/admin/bookings', {
        courtId: padel1.id,
        startsAt: `${TOMORROW}T18:15:00-03:00`,
        customerId: otroCustomer.id,
      });
      expect(misaligned.status).toBe(400);
      expect(misaligned.body.error.details).toHaveProperty('startsAt');

      const ghost = await as(ctx, admin).post('/admin/bookings', {
        courtId: padel3.id,
        startsAt: t17,
        customerId: '99999999-9999-4999-8999-999999999999',
      });
      expect(ghost.status).toBe(404);
      expect(ghost.body.error.message).toBe('Cliente no encontrado.');

      const archivedCustomer = await createCustomer({
        complexId: (await getComplex()).id,
        firstName: 'Archivado',
        isActive: false,
      });
      const archived = await as(ctx, admin).post('/admin/bookings', {
        courtId: padel3.id,
        startsAt: t17,
        customerId: archivedCustomer.id,
      });
      expect(archived.status).toBe(422);
      expect(archived.body.error.code).toBe('CUSTOMER_ARCHIVED');

      const old = await getCourtByName('Cancha vieja');
      expect(
        (
          await as(ctx, admin).post('/admin/bookings', {
            courtId: old.id,
            startsAt: t17,
            customerId: otroCustomer.id,
          })
        ).status,
      ).toBe(404);

      const negative = await as(ctx, admin).post('/admin/bookings', {
        courtId: padel3.id,
        startsAt: t17,
        customerId: otroCustomer.id,
        price: -1,
      });
      expect(negative.status).toBe(400);
      expect(negative.body.error.details).toHaveProperty('price');
    });

    it('carrera de dos altas del panel por el mismo slot libre, x5 → siempre un 201 y un 409', async () => {
      const futbol = await getCourtByName('Fútbol 7');
      for (let round = 0; round < 5; round++) {
        const startsAt = `2026-09-1${4 + round}T12:00:00-03:00`;
        const [a, p] = await Promise.all([
          as(ctx, admin).post('/admin/bookings', {
            courtId: futbol.id,
            startsAt,
            customerId: otroCustomer.id,
          }),
          as(ctx, admin).post('/admin/bookings', {
            courtId: futbol.id,
            startsAt,
            customerId: carlosCustomer.id,
          }),
        ]);
        expect([a.status, p.status].sort()).toEqual([201, 409]);
        const confirmed = await prisma.booking.count({
          where: {
            courtId: futbol.id,
            startsAt: new Date(startsAt),
            status: 'CONFIRMED',
          },
        });
        expect(confirmed).toBe(1);
      }
    });
  });

  describe('GET /admin/bookings', () => {
    it('?date=mañana → todas las de mañana en orden asc con court/customer/source', async () => {
      const res = await as(ctx, admin).get(`/admin/bookings?date=${TOMORROW}`);
      expect(res.status).toBe(200);
      const starts = res.body.data.map((b: { startsAt: string }) => b.startsAt);
      expect(starts).toEqual([...starts].sort());
      expect(starts[0]).toBe(`${TOMORROW}T10:00:00-03:00`);
      expect(
        res.body.data.every((b: { startsAt: string }) =>
          b.startsAt.startsWith(TOMORROW),
        ),
      ).toBe(true);
      expect(res.body.data.map((b: { id: string }) => b.id)).toEqual(
        expect.arrayContaining([anaBookingId, brunoBookingId, carlosBookingId]),
      );
      expect(
        res.body.data.find((b: { id: string }) => b.id === anaBookingId),
      ).toMatchObject({
        court: { name: 'Pádel 1' },
        customer: { id: anaCustomer.id },
        source: 'ADMIN',
      });
    });

    it('?q= busca por cliente con y sin cuenta; q corto → 400', async () => {
      const carlos = await as(ctx, admin).get('/admin/bookings?q=carlos');
      expect(carlos.body.data.map((b: { id: string }) => b.id)).toContain(
        carlosBookingId,
      );

      // Ya no hay email: se busca por apellido.
      const byLastName = await as(ctx, admin).get('/admin/bookings?q=JUGADORA');
      expect(byLastName.body.data.map((b: { id: string }) => b.id)).toContain(
        anaBookingId,
      );

      const byPhone = await as(ctx, admin).get('/admin/bookings?q=0000077');
      expect(byPhone.body.data.map((b: { id: string }) => b.id)).toContain(
        carlosBookingId,
      );

      expect((await as(ctx, admin).get('/admin/bookings?q=a')).status).toBe(
        400,
      );
    });

    it('?courtId&status filtran; sin filtros → desc; ?from → asc; limit acota', async () => {
      const byCourt = await as(ctx, admin).get(
        `/admin/bookings?courtId=${padel1.id}&status=CONFIRMED`,
      );
      expect(
        byCourt.body.data.every(
          (b: { courtId: string; status: string }) =>
            b.courtId === padel1.id && b.status === 'CONFIRMED',
        ),
      ).toBe(true);
      expect(byCourt.body.data.length).toBeGreaterThanOrEqual(2); // ana mañana + "Lejano" en noviembre

      const all = await as(ctx, admin).get('/admin/bookings');
      const starts = all.body.data.map((b: { startsAt: string }) => b.startsAt);
      expect(starts).toEqual([...starts].sort().reverse());

      const from = await as(ctx, admin).get(
        '/admin/bookings?from=2026-09-12T15:00:00-03:00&limit=2',
      );
      expect(from.body.data).toHaveLength(2);
      expect(from.body.data[0].startsAt <= from.body.data[1].startsAt).toBe(
        true,
      );

      expect(
        (await as(ctx, admin).get('/admin/bookings?limit=201')).status,
      ).toBe(400);
      expect(
        (await as(ctx, admin).get('/admin/bookings?order=up')).status,
      ).toBe(400);
    });
  });

  describe('GET /admin/bookings/:id', () => {
    it('propia o ajena → 200 (el admin ve todo); inexistente → 404; abc → 400', async () => {
      const res = await as(ctx, admin).get(`/admin/bookings/${anaBookingId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.customer.id).toBe(anaCustomer.id);
      expect(
        (
          await as(ctx, admin).get(
            '/admin/bookings/99999999-9999-4999-8999-999999999999',
          )
        ).status,
      ).toBe(404);
      expect((await as(ctx, admin).get('/admin/bookings/abc')).status).toBe(
        400,
      );
    });
  });

  describe('PATCH /admin/bookings/:id/cancel', () => {
    it('cancela la de Carlos con motivo → cancelledBy ADMIN; el slot queda libre; repetir → 422', async () => {
      const res = await as(ctx, admin).patch(
        `/admin/bookings/${carlosBookingId}/cancel`,
        { reason: 'Llamó para cancelar' },
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        status: 'CANCELLED',
        cancelledAt: '2026-09-12T15:00:00-03:00',
        cancelledBy: 'ADMIN',
        cancellationReason: 'Llamó para cancelar',
      });

      const slot = await agendaSlot(tenis.id, `${TOMORROW}T10:00:00-03:00`);
      expect(slot?.status).toBe('AVAILABLE');
      expect(slot?.booking).toBeUndefined();

      const again = await as(ctx, admin).patch(
        `/admin/bookings/${carlosBookingId}/cancel`,
        {},
      );
      expect(again.status).toBe(422);
      expect(again.body.error.code).toBe('BOOKING_ALREADY_CANCELLED');
    });

    it('cancela dentro de la ventana (el admin no la tiene) con motivo', async () => {
      ctx.clock.set(new Date('2026-09-13T16:30:00-03:00')); // 30 min antes del turno
      const res = await as(ctx, admin).patch(
        `/admin/bookings/${anaBookingId}/cancel`,
        { reason: 'Se rompió una luz' },
      );
      expect(res.status).toBe(200);
      ctx.clock.set(TEST_NOW);

      const detail = await as(ctx, admin).get(
        `/admin/bookings/${anaBookingId}`,
      );
      expect(detail.body.data).toMatchObject({
        status: 'CANCELLED',
        cancelledBy: 'ADMIN',
        cancellationReason: 'Se rompió una luz',
      });
    });

    it('turno ya terminado → 422 BOOKING_ALREADY_FINISHED; el listado de ayer lo muestra con el cliente', async () => {
      const customer = await createCustomer({
        complexId: (await getComplex()).id,
        firstName: 'Ayer',
        lastName: 'Jugó',
      });
      const yesterday = await createBooking({
        courtId: padel3.id,
        customerId: customer.id,
        startsAt: new Date('2026-09-11T18:00:00-03:00'),
      });

      const res = await as(ctx, admin).patch(
        `/admin/bookings/${yesterday.id}/cancel`,
        {},
      );
      expect(res.status).toBe(422);
      expect(res.body.error).toEqual({
        code: 'BOOKING_ALREADY_FINISHED',
        message: 'Ese turno ya terminó.',
      });

      const slot = await agendaSlot(
        padel3.id,
        '2026-09-11T18:00:00-03:00',
        '2026-09-11',
      );
      expect(slot?.booking?.customer).toMatchObject({ name: 'Ayer Jugó' });
    });

    it('turno en curso (empezó hace 30 min) → se puede cancelar', async () => {
      const customer = await createCustomer({
        complexId: (await getComplex()).id,
      });
      const running = await createBooking({
        courtId: padel3.id,
        customerId: customer.id,
        startsAt: new Date('2026-09-12T14:30:00-03:00'),
      }); // 14:30–16:00: en curso a las 15:00
      const res = await as(ctx, admin).patch(
        `/admin/bookings/${running.id}/cancel`,
        { reason: 'Lluvia' },
      );
      expect(res.status).toBe(200);
    });

    it('reason de 281 chars → 400; inexistente → 404', async () => {
      expect(
        (
          await as(ctx, admin).patch(
            `/admin/bookings/${brunoBookingId}/cancel`,
            { reason: 'x'.repeat(281) },
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await as(ctx, admin).patch(
            '/admin/bookings/99999999-9999-4999-8999-999999999999/cancel',
            {},
          )
        ).status,
      ).toBe(404);
    });
  });

  describe('PATCH /admin/bookings/:id/start', () => {
    it('confirmada de hoy → 200 con startedAt/startedBy; el detalle lo trae; repetir → 422', async () => {
      const customer = await createCustomer({
        complexId: (await getComplex()).id,
        firstName: 'Hoy',
        lastName: 'Juega',
      });
      const today = await createBooking({
        courtId: padel3.id,
        customerId: customer.id,
        startsAt: new Date('2026-09-12T16:30:00-03:00'),
      });

      const res = await as(ctx, admin).patch(
        `/admin/bookings/${today.id}/start`,
        {},
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: today.id,
        status: 'CONFIRMED',
        startedAt: '2026-09-12T15:00:00-03:00',
        startedBy: { id: admin.id, name: 'Admin Demo' },
      });

      const detail = await as(ctx, admin).get(`/admin/bookings/${today.id}`);
      expect(detail.body.data.startedAt).toBe('2026-09-12T15:00:00-03:00');

      const again = await as(ctx, admin).patch(
        `/admin/bookings/${today.id}/start`,
        {},
      );
      expect(again.status).toBe(422);
      expect(again.body.error).toEqual({
        code: 'BOOKING_ALREADY_STARTED',
        message: 'Ese turno ya fue iniciado.',
      });
    });

    it('de mañana → 422 BOOKING_NOT_TODAY; pendiente → 422 BOOKING_NOT_CONFIRMED; ana → 403; inexistente → 404', async () => {
      const customer = await createCustomer({
        complexId: (await getComplex()).id,
      });
      const tomorrowBooking = await createBooking({
        courtId: padel3.id,
        customerId: customer.id,
        startsAt: new Date('2026-09-14T19:30:00-03:00'),
      });
      const tomorrow = await as(ctx, admin).patch(
        `/admin/bookings/${tomorrowBooking.id}/start`,
        {},
      );
      expect(tomorrow.status).toBe(422);
      expect(tomorrow.body.error.code).toBe('BOOKING_NOT_TODAY');

      const pendingCustomer = await createCustomer({
        complexId: (await getComplex()).id,
        firstName: 'Pendiente',
        lastName: 'Hoy',
        phone: '+5491100000099',
      });
      const pending = await prisma.booking.create({
        data: {
          courtId: tenis.id,
          customerId: pendingCustomer.id,
          startsAt: new Date('2026-09-12T19:00:00-03:00'),
          endsAt: new Date('2026-09-12T20:00:00-03:00'),
          status: 'PENDING',
          source: 'PUBLIC',
          price: 8000,
          expiresAt: new Date('2026-09-12T18:00:00-03:00'),
        },
      });
      const notConfirmed = await as(ctx, admin).patch(
        `/admin/bookings/${pending.id}/start`,
        {},
      );
      expect(notConfirmed.status).toBe(422);
      expect(notConfirmed.body.error.code).toBe('BOOKING_NOT_CONFIRMED');

      expect(
        (await as(ctx, ana).patch(`/admin/bookings/${pending.id}/start`, {}))
          .status,
      ).toBe(403);
      expect(
        (
          await as(ctx, admin).patch(
            '/admin/bookings/99999999-9999-4999-8999-999999999999/start',
            {},
          )
        ).status,
      ).toBe(404);
    });
  });

  describe('PATCH /admin/bookings/:id/finish', () => {
    it('iniciada → 200 con finishedAt/finishedBy; repetir → 422; sin iniciar → 422 BOOKING_NOT_STARTED', async () => {
      const customer = await createCustomer({
        complexId: (await getComplex()).id,
        firstName: 'Termina',
        lastName: 'Hoy',
      });
      const today = await createBooking({
        courtId: padel1.id,
        customerId: customer.id,
        startsAt: new Date('2026-09-12T20:00:00-03:00'),
      });

      const notStarted = await as(ctx, admin).patch(
        `/admin/bookings/${today.id}/finish`,
        {},
      );
      expect(notStarted.status).toBe(422);
      expect(notStarted.body.error).toEqual({
        code: 'BOOKING_NOT_STARTED',
        message: 'Ese turno todavía no fue iniciado.',
      });

      expect(
        (await as(ctx, admin).patch(`/admin/bookings/${today.id}/start`, {}))
          .status,
      ).toBe(200);
      const res = await as(ctx, admin).patch(
        `/admin/bookings/${today.id}/finish`,
        {},
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: today.id,
        status: 'CONFIRMED',
        startedAt: '2026-09-12T15:00:00-03:00',
        finishedAt: '2026-09-12T15:00:00-03:00',
        finishedBy: { id: admin.id, name: 'Admin Demo' },
      });

      const again = await as(ctx, admin).patch(
        `/admin/bookings/${today.id}/finish`,
        {},
      );
      expect(again.status).toBe(422);
      expect(again.body.error.code).toBe('BOOKING_ALREADY_FINISHED');

      expect(
        (await as(ctx, ana).patch(`/admin/bookings/${today.id}/finish`, {}))
          .status,
      ).toBe(403);
    });
  });
});
