import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClockModule } from './common/clock/clock.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HealthController } from './common/health/health.controller';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { AppConfigModule } from './config/config.module';
import { AdminBookingsModule } from './modules/admin-bookings/admin-bookings.module';
import { AdminComplexModule } from './modules/admin-complex/admin-complex.module';
import { AdminCustomersModule } from './modules/admin-customers/admin-customers.module';
import { AdminCourtsModule } from './modules/admin-courts/admin-courts.module';
import { AdminPaymentsModule } from './modules/admin-payments/admin-payments.module';
import { AuthModule } from './modules/auth/auth.module';
import { ComplexModule } from './modules/complex/complex.module';
import { CourtsModule } from './modules/courts/courts.module';
import { CustomersModule } from './modules/customers/customers.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PublicModule } from './modules/public/public.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { BookingCoreModule } from './shared/bookings/booking-core.module';

@Module({
  imports: [
    AppConfigModule,
    // Rate limit for the public payment endpoints (ThrottlerGuard is not global).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    PrismaModule,
    ClockModule,
    BookingCoreModule,
    UsersModule,
    AuthModule,
    ComplexModule,
    CourtsModule,
    CustomersModule,
    AdminBookingsModule,
    AdminCourtsModule,
    AdminComplexModule,
    AdminCustomersModule,
    AdminPaymentsModule,
    NotificationsModule,
    PublicModule,
    RealtimeModule,
    SuperAdminModule,
  ],
  controllers: [HealthController],
  // Order matters: JwtAuthGuard resolves `req.user`; RolesGuard reads it.
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
