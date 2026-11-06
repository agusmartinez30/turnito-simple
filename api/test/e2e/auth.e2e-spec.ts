import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { createUser } from '../factories';
import { createTestApp, prisma, resetDatabase, TestContext } from '../setup';

/** Checklist E2E de docs/02-auth.md y del registro de complejo (docs/15-multi-complex.md). */
describe('Auth (e2e)', () => {
  let ctx: TestContext;
  let url: (path: string) => string;

  beforeAll(async () => {
    await resetDatabase();
    ctx = await createTestApp();
    url = (path) => `${ctx.prefix}${path}`;
  });

  afterAll(async () => {
    await ctx.close();
  });

  const validBody = {
    complexName: '  Club Río ',
    complexAddress: 'Av. Costanera 1500, Rosario',
    timezone: 'America/Argentina/Cordoba',
    name: '  Carla Test ',
    email: 'Carla@Test.com',
    phone: '+5491100000099',
    password: 'supersecret1',
  };

  describe('POST /auth/register (alta de complejo)', () => {
    it('con body válido → 201, crea el complejo con slug y su admin; token con complexId', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(url('/auth/register'))
        .send(validBody);

      expect(res.status).toBe(201);
      const complex = await prisma.complex.findUniqueOrThrow({
        where: { slug: 'club-rio' },
      });
      expect(complex).toMatchObject({
        name: 'Club Río',
        address: 'Av. Costanera 1500, Rosario',
        timezone: 'America/Argentina/Cordoba',
        cancellationWindowHours: 24,
      });
      expect(res.body.data.user).toEqual({
        id: expect.any(String),
        name: 'Carla Test',
        email: 'carla@test.com',
        phone: '+5491100000099',
        role: 'ADMIN',
        complexId: complex.id,
      });
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
      expect(res.body.data.expiresAt).toMatch(/Z$/);

      const payload = ctx.app.get(JwtService).verify<{
        sub: string;
        email: string;
        role: string;
        complexId: string;
      }>(res.body.data.accessToken);
      expect(payload).toMatchObject({
        sub: res.body.data.user.id,
        email: 'carla@test.com',
        role: 'ADMIN',
        complexId: complex.id,
      });

      const stored = await prisma.user.findUnique({
        where: { email: 'carla@test.com' },
      });
      expect(stored?.passwordHash).not.toBe(validBody.password);
      expect(stored?.complexId).toBe(complex.id);
    });

    it('otro complejo con el mismo nombre → slug con sufijo -2', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(url('/auth/register'))
        .send({ ...validBody, email: 'otro@test.com' });

      expect(res.status).toBe(201);
      const complex = await prisma.complex.findUniqueOrThrow({
        where: { id: res.body.data.user.complexId },
      });
      expect(complex.slug).toBe('club-rio-2');
    });

    it('timezone inválida → 400 con details.timezone', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(url('/auth/register'))
        .send({
          ...validBody,
          email: 'tz@test.com',
          timezone: 'Marte/Olympus',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.details.timezone).toEqual([
        'La zona horaria no es válida',
      ]);
      expect(
        await prisma.user.findUnique({ where: { email: 'tz@test.com' } }),
      ).toBeNull();
    });

    it('email en mayúsculas se guarda en minúsculas; volver a registrarlo → 409', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(url('/auth/register'))
        .send({ ...validBody, email: 'carla@test.com' });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'Ya existe una cuenta con este email.',
        },
      });
    });

    it("con phone: '' → 201 y user.phone ausente", async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(url('/auth/register'))
        .send({ ...validBody, email: 'sinphone@test.com', phone: '' });

      expect(res.status).toBe(201);
      expect(res.body.data.user).not.toHaveProperty('phone');
    });

    it('con password de 7 chars → 400 con details.password', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(url('/auth/register'))
        .send({ ...validBody, email: 'short@test.com', password: '1234567' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.password).toEqual([expect.any(String)]);
    });

    it("con campo extra (role: 'ADMIN') → 400 (forbidNonWhitelisted)", async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(url('/auth/register'))
        .send({ ...validBody, email: 'admin@test.com', role: 'ADMIN' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toHaveProperty('role');
    });
  });

  describe('POST /auth/login', () => {
    it('correcto → 200 con token y user', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email: 'ana@demo.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.data.user).toEqual({
        id: expect.any(String),
        name: 'Ana Jugadora',
        email: 'ana@demo.com',
        phone: '+5491100000001',
        role: 'PLAYER',
        complexId: null,
      });
      expect(typeof res.body.data.accessToken).toBe('string');
    });

    it('email inexistente y password incorrecta → 401 INVALID_CREDENTIALS con el mismo body', async () => {
      const [noUser, badPass] = await Promise.all([
        request(ctx.app.getHttpServer())
          .post(url('/auth/login'))
          .send({ email: 'nadie@demo.com', password: 'password123' }),
        request(ctx.app.getHttpServer())
          .post(url('/auth/login'))
          .send({ email: 'ana@demo.com', password: 'incorrecta' }),
      ]);

      expect(noUser.status).toBe(401);
      expect(badPass.status).toBe(401);
      expect(noUser.body).toEqual(badPass.body);
      expect(noUser.body).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email o contraseña incorrectos.',
        },
      });
    });
  });

  describe('GET /auth/me', () => {
    let token: string;
    let userId: string;

    beforeAll(async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email: 'bruno@demo.com', password: 'password123' });
      token = res.body.data.accessToken as string;
      userId = res.body.data.user.id as string;
    });

    it('sin header → 401 UNAUTHORIZED', async () => {
      const res = await request(ctx.app.getHttpServer()).get(url('/auth/me'));
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Tu sesión expiró. Volvé a ingresar.',
        },
      });
    });

    it('con token vencido → 401', async () => {
      const expired = ctx.app
        .get(JwtService)
        .sign({ sub: userId, email: 'bruno@demo.com' }, { expiresIn: '-10s' });
      const res = await request(ctx.app.getHttpServer())
        .get(url('/auth/me'))
        .set('Authorization', `Bearer ${expired}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('con token válido → 200 y datos actuales de la DB (no del payload)', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { name: 'Bruno Renombrado' },
      });

      const res = await request(ctx.app.getHttpServer())
        .get(url('/auth/me'))
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        id: userId,
        name: 'Bruno Renombrado',
        email: 'bruno@demo.com',
        role: 'PLAYER',
        complexId: null,
      });
    });

    it('con token de un usuario borrado → 401', async () => {
      const efimero = await createUser({ email: 'efimero@test.com' });
      const login = await request(ctx.app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email: efimero.email, password: efimero.password });
      await prisma.user.delete({ where: { id: efimero.id } });

      const res = await request(ctx.app.getHttpServer())
        .get(url('/auth/me'))
        .set('Authorization', `Bearer ${login.body.data.accessToken}`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('con token → 204 sin body; sin token → 401', async () => {
      const login = await request(ctx.app.getHttpServer())
        .post(url('/auth/login'))
        .send({ email: 'ana@demo.com', password: 'password123' });

      const ok = await request(ctx.app.getHttpServer())
        .post(url('/auth/logout'))
        .set('Authorization', `Bearer ${login.body.data.accessToken}`);
      expect(ok.status).toBe(204);
      expect(ok.text).toBe('');

      const noToken = await request(ctx.app.getHttpServer()).post(
        url('/auth/logout'),
      );
      expect(noToken.status).toBe(401);
    });
  });

  describe('envelope de error en endpoints protegidos', () => {
    it("'Bearer basura' → 401 con envelope correcto, sin stack trace", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(url('/auth/me'))
        .set('Authorization', 'Bearer basura');

      expect(res.status).toBe(401);
      expect(Object.keys(res.body)).toEqual(['error']);
      expect(Object.keys(res.body.error).sort()).toEqual(['code', 'message']);
      expect(JSON.stringify(res.body)).not.toMatch(/at .*\.(ts|js):\d+/);
    });
  });

  describe('GET /health', () => {
    it('es público, sin prefijo y sin envelope', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
