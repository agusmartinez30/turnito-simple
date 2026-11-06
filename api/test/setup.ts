import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { seed } from '../prisma/seed';
import { AppModule } from '../src/app.module';
import { API_PREFIX, setupApp } from '../src/app.setup';
import { Clock, FixedClock } from '../src/shared/time/clock';

if (process.env.NODE_ENV !== 'test') {
  throw new Error(
    'Los e2e deben correr con NODE_ENV=test (pnpm test:e2e carga .env.test).',
  );
}
if (!process.env.DATABASE_URL?.includes('_test')) {
  throw new Error(
    `DATABASE_URL de e2e debe apuntar a una DB *_test, recibido: ${process.env.DATABASE_URL}`,
  );
}

/** Instante fijo para los e2e que dependen de la hora (docs/04-bookings.md). */
export const TEST_NOW = new Date('2026-09-12T15:00:00-03:00');

/** Cliente Prisma compartido por setup, factories y asserts directos contra la DB. */
export const prisma: PrismaClient = new PrismaClient();

/** Deja la DB exactamente en el estado del seed. */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE payment_proofs, payments, bookings, customers, users, courts, complexes RESTART IDENTITY CASCADE',
  );
  await seed(prisma, { includeUsers: true });
}

export interface TestContext {
  app: INestApplication;
  clock: FixedClock;
  /** Prefijo listo para concatenar: `${ctx.prefix}/auth/login`. */
  prefix: string;
  close(): Promise<void>;
}

/** Levanta la app con la misma configuración HTTP que main.ts y un Clock fijo. */
export async function createTestApp(
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<TestContext> {
  const clock = new FixedClock(TEST_NOW);
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock);
  if (customize) builder = customize(builder);

  const moduleRef = await builder.compile();
  const app = setupApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();

  return {
    app,
    clock,
    prefix: `/${API_PREFIX}`,
    close: async () => {
      await app.close();
    },
  };
}

export interface Session {
  token: string;
  id: string;
  email: string;
}

/** Login por API con la password del seed (o la indicada). */
export async function loginAs(
  ctx: TestContext,
  email: string,
  password = 'password123',
): Promise<Session> {
  const res = await request(ctx.app.getHttpServer())
    .post(`${ctx.prefix}/auth/login`)
    .send({ email, password });
  if (res.status !== 200) {
    throw new Error(
      `login ${email} falló: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return {
    token: res.body.data.accessToken as string,
    id: res.body.data.user.id as string,
    email,
  };
}

/** Atajos con Authorization ya seteado. */
export function as(ctx: TestContext, session: Session) {
  const auth = (r: request.Test) =>
    r.set('Authorization', `Bearer ${session.token}`);
  const url = (path: string) => `${ctx.prefix}${path}`;
  return {
    get: (path: string) =>
      auth(request(ctx.app.getHttpServer()).get(url(path))),
    post: (path: string, body?: object) =>
      auth(request(ctx.app.getHttpServer()).post(url(path))).send(body),
    patch: (path: string, body?: object) =>
      auth(request(ctx.app.getHttpServer()).patch(url(path))).send(body),
    put: (path: string, body?: object) =>
      auth(request(ctx.app.getHttpServer()).put(url(path))).send(body),
    delete: (path: string) =>
      auth(request(ctx.app.getHttpServer()).delete(url(path))),
    /** Multipart: `.send()` de `post` pelea con `.attach()`, así que va aparte. */
    upload: (
      path: string,
      field: string,
      file: Buffer,
      options: { filename: string; contentType?: string },
    ) =>
      auth(request(ctx.app.getHttpServer()).post(url(path))).attach(
        field,
        file,
        options,
      ),
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});
