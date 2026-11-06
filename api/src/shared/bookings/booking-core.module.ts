import { Global, Module } from '@nestjs/common';
import { BookingCore } from './booking-core';

/** Reglas de reserva compartidas por BookingsModule (jugador) y AdminBookingsModule. */
@Global()
@Module({
  providers: [BookingCore],
  exports: [BookingCore],
})
export class BookingCoreModule {}
