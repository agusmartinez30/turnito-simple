import { createCustomer, getComplex, getCourtByName } from '../factories';
import {
  as,
  createTestApp,
  loginAs,
  resetDatabase,
  Session,
  TestContext,
} from '../setup';

/** Checklist E2E de docs/17-admin-customers.md. */
describe('Admin customers (e2e)', () => {
  let ctx: TestContext;
  let admin: Session;
  let complexId: string;
  let surComplexId: string;

  beforeAll(async () => {
    await resetDatabase();
    ctx = await createTestApp();
    [admin] = await Promise.all([loginAs(ctx, 'admin@demo.com')]);
    complexId = (await getComplex()).id;
    surComplexId = (await getComplex('complejo-sur')).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('POST /admin/customers', () => {
    it('crea con nombre solo, con nombre + apellido + teléfono y varios sin teléfono', async () => {
      const simple = await as(ctx, admin).post('/admin/customers', {
        firstName: 'María',
      });
      expect(simple.status).toBe(201);
      expect(simple.body.data).toMatchObject({
        name: 'María',
        firstName: 'María',
        isActive: true,
        source: 'ADMIN',
        bookingsCount: 0,
      });
      expect(simple.body.data).not.toHaveProperty('phone');

      const full = await as(ctx, admin).post('/admin/customers', {
        firstName: 'Pedro',
        lastName: 'Pérez',
        phone: '+54 9 11 0000 7001',
        note: 'Cliente de prueba',
      });
      expect(full.status).toBe(201);
      expect(full.body.data).toMatchObject({
        name: 'Pedro Pérez',
        firstName: 'Pedro',
        lastName: 'Pérez',
        phone: '+5491100007001',
        note: 'Cliente de prueba',
      });

      const withoutPhone = await as(ctx, admin).post('/admin/customers', {
        firstName: 'Sin',
      });
      expect(withoutPhone.status).toBe(201);
    });

    it('teléfono ya usado → 409 CUSTOMER_PHONE_ALREADY_EXISTS, también con otra escritura', async () => {
      const duplicate = await as(ctx, admin).post('/admin/customers', {
        firstName: 'Otro',
        phone: '+5491100007001',
      });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('CUSTOMER_PHONE_ALREADY_EXISTS');

      const formatted = await as(ctx, admin).post('/admin/customers', {
        firstName: 'Otro',
        phone: '549 11 0000-7001',
      });
      expect(formatted.status).toBe(409);
    });
  });

  describe('GET /admin/customers', () => {
    it('busca por nombre, apellido y teléfono; filtra por estado', async () => {
      const byName = await as(ctx, admin).get('/admin/customers?q=Pedro');
      expect(byName.status).toBe(200);
      expect(byName.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ firstName: 'Pedro' }),
        ]),
      );

      const byLastName = await as(ctx, admin).get('/admin/customers?q=Pérez');
      expect(byLastName.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ firstName: 'Pedro' }),
        ]),
      );

      const byPhone = await as(ctx, admin).get('/admin/customers?q=0007001');
      expect(byPhone.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ phone: '+5491100007001' }),
        ]),
      );

      const archived = await as(ctx, admin).get(
        '/admin/customers?status=archived',
      );
      expect(archived.status).toBe(200);
      expect(archived.body.data).toEqual([]);
    });
  });

  describe('GET /admin/customers/:id', () => {
    it('trae stats y el historial; un cliente de otro complejo es 404', async () => {
      const created = await createCustomer({
        complexId,
        firstName: 'Ficha',
        phone: '+5491100007002',
      });

      const res = await as(ctx, admin).get(`/admin/customers/${created.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: created.id,
        stats: {
          bookings: { confirmed: 0, pending: 0, cancelled: 0 },
          billed: 0,
          paid: 0,
          balance: 0,
        },
        bookings: [],
      });

      const other = await createCustomer({
        complexId: surComplexId,
        firstName: 'Delia',
        phone: '+5491100007003',
      });
      const ajeno = await as(ctx, admin).get(`/admin/customers/${other.id}`);
      expect(ajeno.status).toBe(404);
      expect(ajeno.body.error.message).toBe('Cliente no encontrado.');
    });
  });

  describe('PATCH /admin/customers/:id', () => {
    it('edita, archiva y restaura; body vacío → 400', async () => {
      const customer = await createCustomer({
        complexId,
        firstName: 'Editable',
        lastName: 'Apellido',
        phone: '+5491100007004',
      });

      const edited = await as(ctx, admin).patch(
        `/admin/customers/${customer.id}`,
        { lastName: null, note: 'Nueva nota' },
      );
      expect(edited.status).toBe(200);
      expect(edited.body.data).toMatchObject({
        name: 'Editable',
        note: 'Nueva nota',
        isActive: true,
      });
      expect(edited.body.data).not.toHaveProperty('lastName');

      const empty = await as(ctx, admin).patch(
        `/admin/customers/${customer.id}`,
        {},
      );
      expect(empty.status).toBe(400);
      expect(empty.body.error.details._).toEqual(['No hay cambios']);

      const archived = await as(ctx, admin).patch(
        `/admin/customers/${customer.id}`,
        { isActive: false },
      );
      expect(archived.body.data.isActive).toBe(false);

      const restored = await as(ctx, admin).patch(
        `/admin/customers/${customer.id}`,
        { isActive: true },
      );
      expect(restored.body.data.isActive).toBe(true);
    });
  });

  describe('reservar con clientes', () => {
    it('un cliente archivado no recibe turnos nuevos desde el panel', async () => {
      const court = await getCourtByName('Pádel 1');
      const customer = await createCustomer({
        complexId,
        firstName: 'Archivado',
        phone: '+5491100007005',
        isActive: false,
      });

      const res = await as(ctx, admin).post('/admin/bookings', {
        courtId: court.id,
        startsAt: '2026-09-13T17:00:00-03:00',
        customerId: customer.id,
      });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('CUSTOMER_ARCHIVED');
    });
  });
});
