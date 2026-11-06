import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Express } from 'express';
import { HttpExceptionFilter } from './common/errors/http-exception.filter';
import { createValidationPipe } from './common/errors/validation.pipe';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { Env } from './config/env.schema';

export const API_PREFIX = 'api/v1';

/**
 * Configuración HTTP compartida entre `main.ts` y `test/setup.ts` para que los e2e
 * ejerciten exactamente los mismos pipes, filtros, interceptores y prefijo que producción.
 */
export function setupApp(app: INestApplication): INestApplication {
  const config = app.get(ConfigService<Env, true>);
  const reflector = app.get(Reflector);

  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });
  if (config.get('TRUST_PROXY', { infer: true })) {
    // Detrás de un reverse proxy: req.ip = X-Forwarded-For (rate limit por IP real).
    const express = app.getHttpAdapter().getInstance() as Express;
    express.set('trust proxy', 1);
  }
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(reflector));
  app.enableShutdownHooks();

  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Turnito Simple API')
        .setDescription('API REST del sistema de complejo deportivo (MVP)')
        .setVersion('1')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  return app;
}
