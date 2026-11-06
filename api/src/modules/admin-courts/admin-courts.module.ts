import { Module } from '@nestjs/common';
import { ComplexModule } from '../complex/complex.module';
import { AdminCourtsController } from './admin-courts.controller';
import { AdminCourtsService } from './admin-courts.service';

@Module({
  imports: [ComplexModule],
  controllers: [AdminCourtsController],
  providers: [AdminCourtsService],
})
export class AdminCourtsModule {}
