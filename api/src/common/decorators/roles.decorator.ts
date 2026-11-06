import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Restringe un handler o controller a los roles indicados (RolesGuard). Se usa a nivel de clase en /admin/*. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
