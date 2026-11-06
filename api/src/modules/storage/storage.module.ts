import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../config/env.schema';
import { StubStorageProvider } from './providers/stub.provider';
import {
  IStorageProvider,
  STORAGE_PROVIDER_TOKEN,
} from './providers/storage-provider.interface';
import { SupabaseStorageProvider } from './providers/supabase.provider';

/**
 * Elige el proveedor por `STORAGE_PROVIDER` (docs/18-storage.md). El default es `stub`, así que
 * un deploy que todavía no configuró el bucket **arranca igual** y solo avisa: que el default
 * tumbe un servicio en producción sería peor que un logo que no se ve.
 */
function provideStorageProvider(
  config: ConfigService<Env, true>,
  stub: StubStorageProvider,
  supabase: SupabaseStorageProvider,
): IStorageProvider {
  const provider = config.get('STORAGE_PROVIDER', { infer: true });
  if (
    provider === 'stub' &&
    config.get('NODE_ENV', { infer: true }) === 'production'
  ) {
    new Logger('StorageModule').warn(
      'STORAGE_PROVIDER=stub en producción: los logos que se suban no se van a poder ver.',
    );
  }
  return provider === 'supabase' ? supabase : stub;
}

@Module({
  providers: [
    StubStorageProvider,
    SupabaseStorageProvider,
    {
      provide: STORAGE_PROVIDER_TOKEN,
      useFactory: provideStorageProvider,
      inject: [ConfigService, StubStorageProvider, SupabaseStorageProvider],
    },
  ],
  exports: [STORAGE_PROVIDER_TOKEN, StubStorageProvider],
})
export class StorageModule {}
