import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { API_PREFIX, setupApp } from './app.setup';
import { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: isProd, colors: !isProd }),
  });

  setupApp(app);

  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API escuchando en http://localhost:${port}/${API_PREFIX}`);
  if (!isProd) logger.log(`Swagger en http://localhost:${port}/docs`);
}

void bootstrap();
