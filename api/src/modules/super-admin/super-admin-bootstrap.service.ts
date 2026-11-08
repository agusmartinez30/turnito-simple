import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ensureSuperAdmin } from './ensure-super-admin';

/**
 * Creates the platform operator on boot from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD, for hosts
 * without a shell (Railway). Never blocks startup: a failure is logged and the app keeps booting.
 */
@Injectable()
export class SuperAdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuperAdminBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const result = await ensureSuperAdmin(this.prisma);
      if (result === 'created') this.logger.log('Super admin created');
    } catch (err) {
      this.logger.error(
        `Super admin bootstrap failed: ${(err as Error).message}`,
      );
    }
  }
}
