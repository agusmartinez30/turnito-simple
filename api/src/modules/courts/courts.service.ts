import { Injectable } from '@nestjs/common';
import { Court, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { ListCourtsDto } from './dto/list-courts.dto';

export const COURT_NOT_FOUND_MESSAGE = 'Cancha no encontrada.';

@Injectable()
export class CourtsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Solo activas del complejo, orden `sortOrder asc, name asc`. */
  list(
    complexId: string,
    query: Pick<ListCourtsDto, 'sport' | 'indoor'>,
  ): Promise<Court[]> {
    const where: Prisma.CourtWhereInput = { complexId, isActive: true };
    if (query.sport !== undefined) where.sport = query.sport;
    if (query.indoor !== undefined) where.isIndoor = query.indoor;

    return this.prisma.court.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * 404 tanto si no existe como si está inactiva: para el jugador es lo mismo. Con `complexId`,
   * también si pertenece a otro complejo (docs/15-multi-complex.md).
   */
  async findActiveOrThrow(id: string, complexId?: string): Promise<Court> {
    const court = await this.prisma.court.findFirst({
      where: { id, ...(complexId ? { complexId } : {}) },
    });
    if (!court || !court.isActive) {
      throw new AppException(ErrorCode.NOT_FOUND, COURT_NOT_FOUND_MESSAGE);
    }
    return court;
  }
}
