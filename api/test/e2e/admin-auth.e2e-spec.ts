import { UserRole } from '@prisma/client';
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

/** Autorización de /admin/* (docs/05-admin-overview.md). */
describe('Admin auth (e2e)', () => {
  let ctx: TestContext;
  let ana: Session;
  let admin: Session;

  beforeAll(async () => {
    await resetDatabase();
    ctx = await createTestApp();
    [ana, admin] = await Promise.all([
      loginAs(ctx, 'ana@demo.com'),
      loginAs(ctx, 'admin@demo.com'),
    ]);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('GET /auth/me devuelve role: PLAYER para ana y ADMIN para admin', async () => {
    expect((await as(ctx, ana).get('/auth/me')).body.data.role).toBe('PLAYER');
    expect((await as(ctx, admin).get('/auth/me')).body.data.role).toBe('ADMIN');
  });

  // Siempre 3 elementos: con 2, it.each pasaría `done` como tercer argumento.
  const adminEndpoints: Array<[string, string, object | undefined]> = [
    ['post', '/admin/bookings', {}],
    ['get', '/admin/bookings', undefined],
    ['get', '/admin/bookings/99999999-9999-4999-8999-999999999999', undefined],
    [
      'patch',
      '/admin/bookings/99999999-9999-4999-8999-999999999999/cancel',
      {},
    ],
    ['get', '/admin/customers', undefined],
    ['post', '/admin/customers', {}],
    ['get', '/admin/customers/99999999-9999-4999-8999-999999999999', undefined],
    ['patch', '/admin/customers/99999999-9999-4999-8999-999999999999', {}],
    ['get', '/admin/courts', undefined],
    ['get', '/admin/courts/99999999-9999-4999-8999-999999999999', undefined],
    ['post', '/admin/courts', {}],
    ['patch', '/admin/courts/99999999-9999-4999-8999-999999999999', {}],
    ['patch', '/admin/complex', {}],
  ];

  it.each(adminEndpoints)(
    '%s %s → 403 FORBIDDEN para PLAYER (antes que cualquier validación)',
    async (method, path, body) => {
      const client = as(ctx, ana) as unknown as Record<
        string,
        (p: string, b?: object) => request.Test
      >;
      const res = await client[method](path, body);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: {
          code: 'FORBIDDEN',
          message: 'No tenés permisos para acceder a esta sección.',
        },
      });
    },
  );

  it.each(adminEndpoints)('%s %s → 401 sin token', async (method, path) => {
    const req = request(ctx.app.getHttpServer()) as unknown as Record<
      string,
      (p: string) => request.Test
    >;
    const res = await req[method](`${ctx.prefix}${path}`);
    expect(res.status).toBe(401);
  });

  it('el rol se lee de la DB: degradar al admin con el token vivo → 403 inmediato; promover → vuelve a entrar', async () => {
    // Necesita otro admin para que setRole permita degradar.
    await setRole(prisma, 'bruno@demo.com', UserRole.ADMIN, 'complejo-demo');
    await setRole(prisma, 'admin@demo.com', UserRole.PLAYER);
    expect((await as(ctx, admin).get('/admin/courts')).status).toBe(403);

    await setRole(prisma, 'admin@demo.com', UserRole.ADMIN, 'complejo-demo');
    expect((await as(ctx, admin).get('/admin/courts')).status).toBe(200);
    await setRole(prisma, 'bruno@demo.com', UserRole.PLAYER);
  });

  it('un jugador promovido entra al panel con su token actual (sin re-login)', async () => {
    await setRole(prisma, 'ana@demo.com', UserRole.ADMIN, 'complejo-sur');
    // RolesGuard refresca complexId de la DB: ve las canchas de Sur con su token viejo.
    const courts = await as(ctx, ana).get('/admin/courts');
    expect(courts.status).toBe(200);
    expect(courts.body.data.map((c: { name: string }) => c.name)).toEqual([
      'Pádel Sur 1',
      'Fútbol 5 Sur',
    ]);
    await setRole(prisma, 'ana@demo.com', UserRole.PLAYER);
    expect((await as(ctx, ana).get('/admin/courts')).status).toBe(403);
    expect((await as(ctx, ana).get('/auth/me')).body.data.complexId).toBeNull();
  });

  it('setRole: email o slug inexistente falla; ADMIN sin slug falla; degradar al último admin del complejo falla; promover a un admin es idempotente', async () => {
    await expect(
      setRole(prisma, 'nadie@demo.com', UserRole.ADMIN, 'complejo-demo'),
    ).rejects.toThrow(/No existe/);
    await expect(
      setRole(prisma, 'bruno@demo.com', UserRole.ADMIN, 'no-existe'),
    ).rejects.toThrow(/No existe un complejo/);
    await expect(
      setRole(prisma, 'bruno@demo.com', UserRole.ADMIN),
    ).rejects.toThrow(/slug/);
    // admin.sur es admin de otro complejo: no cuenta para Demo.
    await expect(
      setRole(prisma, 'admin@demo.com', UserRole.PLAYER),
    ).rejects.toThrow(/único administrador/);
    await expect(
      setRole(prisma, 'ADMIN@demo.com ', UserRole.ADMIN, 'complejo-demo'),
    ).resolves.toBeUndefined();
  });

  it('el flujo de jugador ya no existe: /bookings responde 404', async () => {
    const court = await prisma.court.findFirstOrThrow({
      where: { name: 'Pádel 1' },
    });
    const res = await as(ctx, admin).post('/bookings', {
      courtId: court.id,
      startsAt: '2026-09-13T17:00:00-03:00',
    });
    expect(res.status).toBe(404);
  });
});
