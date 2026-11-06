import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // En test el runner ya cargó .env.test con dotenv-cli; no pisamos nada.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
  ],
})
export class AppConfigModule {}
