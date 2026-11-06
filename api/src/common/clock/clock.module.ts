import { Global, Module } from '@nestjs/common';
import { Clock, SystemClock } from '../../shared/time/clock';

/** Provee `Clock` en toda la app. Los tests lo sobreescriben con `overrideProvider(Clock)`. */
@Global()
@Module({
  providers: [{ provide: Clock, useClass: SystemClock }],
  exports: [Clock],
})
export class ClockModule {}
