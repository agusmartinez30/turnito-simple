import { Module } from '@nestjs/common';
import { ComplexModule } from '../complex/complex.module';
import { CustomersModule } from '../customers/customers.module';
import { AdminCustomersController } from './admin-customers.controller';
import { AdminCustomersService } from './admin-customers.service';

@Module({
  imports: [ComplexModule, CustomersModule],
  controllers: [AdminCustomersController],
  providers: [AdminCustomersService],
})
export class AdminCustomersModule {}
