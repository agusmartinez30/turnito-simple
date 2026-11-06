import { Module } from '@nestjs/common';
import { ComplexModule } from '../complex/complex.module';
import { AvailabilityService } from './availability.service';
import { CourtsController } from './courts.controller';
import { CourtsService } from './courts.service';

@Module({
  imports: [ComplexModule],
  controllers: [CourtsController],
  providers: [CourtsService, AvailabilityService],
  exports: [CourtsService, AvailabilityService],
})
export class CourtsModule {}
