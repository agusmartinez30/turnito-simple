import { Module } from '@nestjs/common';
import { ComplexModule } from '../complex/complex.module';
import { CourtsModule } from '../courts/courts.module';
import { CustomersModule } from '../customers/customers.module';
import { AdminBookingsController } from './admin-bookings.controller';
import { AdminBookingsService } from './admin-bookings.service';

@Module({
  imports: [CourtsModule, ComplexModule, CustomersModule],
  controllers: [AdminBookingsController],
  providers: [AdminBookingsService],
})
export class AdminBookingsModule {}
