import { Module } from '@nestjs/common';
import { ComplexController } from './complex.controller';
import { ComplexService } from './complex.service';

/** Lo importan CourtsModule y BookingsModule: ambos necesitan timezone y cancellationWindowHours. */
@Module({
  controllers: [ComplexController],
  providers: [ComplexService],
  exports: [ComplexService],
})
export class ComplexModule {}
