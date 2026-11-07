import request from 'supertest';
import { StubStorageProvider } from '../../src/modules/storage/providers/stub.provider';
import {
  as,
  createTestApp,
  loginAs,
  resetDatabase,
  Session,
  TestContext,
} from '../setup';

/** PNG de 1x1 real: el sniffer mira los bytes, no el nombre ni el Content-Type. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  'base64',
);
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
/** PNG válido pero por encima de MAX_LOGO_BYTES (2 MB). */
const TOO_BIG = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);

/** Checklist E2E de docs/08-admin-complex.md. Clock fijo en 2026-09-12 15:00 -03:00. */
describe('Admin complex (e2e)', () => {
  let ctx: TestContext;
  let admin: Session;
  let ana: Session;

  beforeAll(async () => {
    await resetDatabase();
    ctx = await createTestApp();
    [admin, ana] = await Promise.all([
      loginAs(ctx, 'admin@demo.com'),
      loginAs(ctx, 'ana@demo.com'),
    ]);
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** Sin token: es el mismo request que hace el navegador de un cliente en /app/[slug]. */
  const publicComplex = () =>
    request(ctx.app.getHttpServer()).get(
      `${ctx.prefix}/public/c/complejo-demo/complex`,
    );

  it('PATCH name → 200 y GET /complex (como admin) devuelve el nombre nuevo en la misma instancia (cache invalidado)', async () => {
    // Calienta el cache.
    expect((await as(ctx, admin).get('/complex')).body.data.name).toBe(
      'Complejo Demo',
    );

    const res = await as(ctx, admin).patch('/admin/complex', {
      name: '  Complejo Norte ',
      address: 'Calle Falsa 123',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      slug: 'complejo-demo',
      name: 'Complejo Norte',
      address: 'Calle Falsa 123',
      timezone: 'America/Argentina/Buenos_Aires',
      cancellationWindowHours: 24,
      autoConfirmPublicRequests: false,
      instagramUrl: null,
      facebookUrl: null,
      tiktokUrl: null,
      youtubeUrl: null,
      contactWhatsapp: null,
      logoUrl: null,
      bankCbu: null,
      bankAlias: null,
      bankHolderName: null,
    });
    expect((await as(ctx, admin).get('/complex')).body.data.name).toBe(
      'Complejo Norte',
    );
    // El otro complejo no se toca.
    expect(
      (await as(ctx, await loginAs(ctx, 'admin.sur@demo.com')).get('/complex'))
        .body.data.name,
    ).toBe('Complejo Sur');
  });

  it('cancellationWindowHours se guarda y se expone; hoy nadie la aplica (no hay flujo de jugador)', async () => {
    expect(
      (
        await as(ctx, admin).patch('/admin/complex', {
          cancellationWindowHours: 2,
        })
      ).status,
    ).toBe(200);
    expect(
      (await as(ctx, admin).get('/complex')).body.data.cancellationWindowHours,
    ).toBe(2);

    expect(
      (
        await as(ctx, admin).patch('/admin/complex', {
          cancellationWindowHours: 48,
        })
      ).status,
    ).toBe(200);
    expect(
      (await as(ctx, admin).get('/complex')).body.data.cancellationWindowHours,
    ).toBe(48);
    expect(
      (
        await as(ctx, admin).patch('/admin/complex', {
          cancellationWindowHours: 24,
        })
      ).status,
    ).toBe(200);
  });

  it('autoConfirmPublicRequests se guarda y se expone; default false', async () => {
    expect(
      (await as(ctx, admin).get('/complex')).body.data
        .autoConfirmPublicRequests,
    ).toBe(false);

    expect(
      (
        await as(ctx, admin).patch('/admin/complex', {
          autoConfirmPublicRequests: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (await as(ctx, admin).get('/complex')).body.data
        .autoConfirmPublicRequests,
    ).toBe(true);

    expect(
      (
        await as(ctx, admin).patch('/admin/complex', {
          autoConfirmPublicRequests: false,
        })
      ).status,
    ).toBe(200);
    expect(
      (await as(ctx, admin).get('/complex')).body.data
        .autoConfirmPublicRequests,
    ).toBe(false);
  });

  it('contactWhatsapp: se canoniza a +dígitos, se expone en el link público, inválido → 400 y null lo borra', async () => {
    const saved = await as(ctx, admin).patch('/admin/complex', {
      contactWhatsapp: '+54 9 351 111-1111',
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.contactWhatsapp).toBe('+5493511111111');
    expect((await publicComplex()).body.data.contactWhatsapp).toBe(
      '+5493511111111',
    );

    const bad = await as(ctx, admin).patch('/admin/complex', {
      contactWhatsapp: '123',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toHaveProperty('contactWhatsapp');

    const reset = await as(ctx, admin).patch('/admin/complex', {
      contactWhatsapp: null,
    });
    expect(reset.status).toBe(200);
    expect(reset.body.data.contactWhatsapp).toBeNull();
    expect((await publicComplex()).body.data.contactWhatsapp).toBeNull();
  });

  it('datos bancarios: se guardan, no salen en el link público, inválidos → 400 y null/vacío los borra', async () => {
    const saved = await as(ctx, admin).patch('/admin/complex', {
      bankCbu: '0000003100012345678901',
      bankAlias: ' complejo.demo ',
      bankHolderName: 'Complejo Demo SRL',
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({
      bankCbu: '0000003100012345678901',
      bankAlias: 'complejo.demo',
      bankHolderName: 'Complejo Demo SRL',
    });
    expect((await as(ctx, admin).get('/complex')).body.data.bankAlias).toBe(
      'complejo.demo',
    );
    const pub = (await publicComplex()).body.data;
    expect(pub).not.toHaveProperty('bankCbu');
    expect(pub).not.toHaveProperty('bankAlias');
    expect(pub).not.toHaveProperty('bankHolderName');

    for (const bad of [
      { bankCbu: '123' },
      { bankCbu: '00000031000123456789AB' },
      { bankAlias: 'abc' },
      { bankAlias: 'alias con espacios' },
      { bankHolderName: 'x'.repeat(101) },
    ]) {
      const res = await as(ctx, admin).patch('/admin/complex', bad);
      expect(res.status).toBe(400);
      expect(res.body.error.details).toHaveProperty(Object.keys(bad)[0]);
    }

    const cleared = await as(ctx, admin).patch('/admin/complex', {
      bankCbu: null,
      bankAlias: '',
      bankHolderName: '  ',
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data).toMatchObject({
      bankCbu: null,
      bankAlias: null,
      bankHolderName: null,
    });
  });

  it('timezone → 400 details.timezone; 200 h → 400; -1 → 400; {} → 400; name de 1 char → 400', async () => {
    const tz = await as(ctx, admin).patch('/admin/complex', {
      timezone: 'UTC',
    });
    expect(tz.status).toBe(400);
    expect(tz.body.error.details).toHaveProperty('timezone');

    expect(
      (
        await as(ctx, admin).patch('/admin/complex', {
          cancellationWindowHours: 200,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await as(ctx, admin).patch('/admin/complex', {
          cancellationWindowHours: -1,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await as(ctx, admin).patch('/admin/complex', {
          cancellationWindowHours: 1.5,
        })
      ).status,
    ).toBe(400);

    const empty = await as(ctx, admin).patch('/admin/complex', {});
    expect(empty.status).toBe(400);
    expect(empty.body.error.details).toEqual({ _: ['No hay cambios'] });

    expect(
      (await as(ctx, admin).patch('/admin/complex', { name: 'X' })).status,
    ).toBe(400);
    expect((await as(ctx, admin).get('/complex')).body.data.timezone).toBe(
      'America/Argentina/Buenos_Aires',
    );
  });

  describe('logo', () => {
    const storage = () => ctx.app.get(StubStorageProvider);
    const complexKeys = async () => {
      const id = (await as(ctx, admin).get('/complex')).body.data.id as string;
      return storage()
        .keys()
        .filter((k) => k.startsWith(`complexes/${id}/`));
    };

    afterEach(async () => {
      await as(ctx, admin).delete('/admin/complex/logo');
    });

    it('sube un PNG, lo expone en /complex y en el link público', async () => {
      const res = await as(ctx, admin).upload(
        '/admin/complex/logo',
        'logo',
        PNG,
        { filename: 'logo.png', contentType: 'image/png' },
      );
      expect(res.status).toBe(200);
      expect(res.body.data.logoUrl).toMatch(
        /\/complexes\/[0-9a-f-]{36}\/logo-[0-9a-f]{8}\.png$/,
      );

      const url = res.body.data.logoUrl as string;
      // Misma instancia: prueba que el cache del complejo se invalidó.
      expect((await as(ctx, admin).get('/complex')).body.data.logoUrl).toBe(
        url,
      );
      expect((await publicComplex()).body.data.logoUrl).toBe(url);
      // Y el complejo de al lado sigue sin logo.
      expect(
        (
          await as(ctx, await loginAs(ctx, 'admin.sur@demo.com')).get(
            '/complex',
          )
        ).body.data.logoUrl,
      ).toBeNull();
    });

    it('subir de nuevo da una URL distinta y deja un solo objeto', async () => {
      const first = await as(ctx, admin).upload(
        '/admin/complex/logo',
        'logo',
        PNG,
        { filename: 'logo.png', contentType: 'image/png' },
      );
      const second = await as(ctx, admin).upload(
        '/admin/complex/logo',
        'logo',
        PNG,
        { filename: 'logo.png', contentType: 'image/png' },
      );
      expect(second.status).toBe(200);
      expect(second.body.data.logoUrl).not.toBe(first.body.data.logoUrl);
      expect(await complexKeys()).toHaveLength(1);
    });

    it('DELETE lo borra del bucket y es idempotente', async () => {
      await as(ctx, admin).upload('/admin/complex/logo', 'logo', PNG, {
        filename: 'logo.png',
        contentType: 'image/png',
      });

      const removed = await as(ctx, admin).delete('/admin/complex/logo');
      expect(removed.status).toBe(200);
      expect(removed.body.data.logoUrl).toBeNull();
      expect(await complexKeys()).toHaveLength(0);
      expect((await publicComplex()).body.data.logoUrl).toBeNull();

      const again = await as(ctx, admin).delete('/admin/complex/logo');
      expect(again.status).toBe(200);
      expect(again.body.data.logoUrl).toBeNull();
    });

    it('el formato se decide por los bytes, no por el nombre ni el Content-Type', async () => {
      // Un GIF disfrazado de PNG: sin el sniffer esto sería un 200.
      const disguised = await as(ctx, admin).upload(
        '/admin/complex/logo',
        'logo',
        GIF,
        { filename: 'logo.png', contentType: 'image/png' },
      );
      expect(disguised.status).toBe(415);
      expect(disguised.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');

      const svg = await as(ctx, admin).upload(
        '/admin/complex/logo',
        'logo',
        SVG,
        { filename: 'logo.svg', contentType: 'image/svg+xml' },
      );
      expect(svg.status).toBe(415);

      expect(await complexKeys()).toHaveLength(0);
      expect(
        (await as(ctx, admin).get('/complex')).body.data.logoUrl,
      ).toBeNull();
    });

    it('sin archivo → 400 details.logo', async () => {
      const res = await as(ctx, admin).post('/admin/complex/logo');
      expect(res.status).toBe(400);
      expect(res.body.error.details).toHaveProperty('logo');
    });

    it('más de 2 MB → 413 FILE_TOO_LARGE, no un 500', async () => {
      const res = await as(ctx, admin).upload(
        '/admin/complex/logo',
        'logo',
        TOO_BIG,
        { filename: 'logo.png', contentType: 'image/png' },
      );
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('FILE_TOO_LARGE');
      expect(await complexKeys()).toHaveLength(0);
    });

    it('logoUrl no se puede setear por PATCH: la URL siempre la genera la API', async () => {
      const uploaded = await as(ctx, admin).upload(
        '/admin/complex/logo',
        'logo',
        PNG,
        { filename: 'logo.png', contentType: 'image/png' },
      );

      const res = await as(ctx, admin).patch('/admin/complex', {
        logoUrl: 'https://evil.example/x.png',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toHaveProperty('logoUrl');
      expect((await as(ctx, admin).get('/complex')).body.data.logoUrl).toBe(
        uploaded.body.data.logoUrl,
      );
    });

    it('ana → 403 en los dos endpoints; sin token → 401', async () => {
      expect(
        (
          await as(ctx, ana).upload('/admin/complex/logo', 'logo', PNG, {
            filename: 'logo.png',
            contentType: 'image/png',
          })
        ).status,
      ).toBe(403);
      expect((await as(ctx, ana).delete('/admin/complex/logo')).status).toBe(
        403,
      );
      expect(
        (
          await request(ctx.app.getHttpServer()).delete(
            `${ctx.prefix}/admin/complex/logo`,
          )
        ).status,
      ).toBe(401);
    });
  });

  it('ana → 403; sin token → 401', async () => {
    expect(
      (await as(ctx, ana).patch('/admin/complex', { name: 'Hackeado' })).status,
    ).toBe(403);
    expect((await as(ctx, admin).get('/complex')).body.data.name).toBe(
      'Complejo Norte',
    );
    // El otro complejo no se toca.
    expect(
      (await as(ctx, await loginAs(ctx, 'admin.sur@demo.com')).get('/complex'))
        .body.data.name,
    ).toBe('Complejo Sur');
  });
});
