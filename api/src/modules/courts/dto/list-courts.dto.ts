import { ApiPropertyOptional } from '@nestjs/swagger';
import { Sport } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { booleanString } from '../../../common/transforms/boolean-string';

export class ListCourtsDto {
  /** Obligatorio para jugadores (sin complejo propio); un admin lo omite y ve el suyo. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID(undefined, { message: 'complexId debe ser un UUID válido' })
  complexId?: string;

  @ApiPropertyOptional({ enum: Sport })
  @IsOptional()
  @IsEnum(Sport, { message: 'Deporte inválido' })
  sport?: Sport;

  @ApiPropertyOptional({ type: Boolean, description: "'true' | 'false'" })
  @IsOptional()
  @Transform(booleanString)
  @IsBoolean({ message: "indoor debe ser 'true' o 'false'" })
  indoor?: boolean;
}
