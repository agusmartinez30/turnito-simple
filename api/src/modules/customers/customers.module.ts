import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';

/**
 * Service compartido: además de `/admin/customers` lo usan la reserva manual, el turno fijo
 * y el pedido público (docs/17-admin-customers.md). Sin controller propio, como `users`.
 */
@Module({
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
