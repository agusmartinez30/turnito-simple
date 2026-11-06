import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ListAdminBookingsDto {
  @ApiPropertyOptional({
    example: '2026-09-13',
    description: 'Día local del complejo. Anula from/to.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener formato YYYY-MM-DD',
  })
  date?: string;

  @ApiPropertyOptional({ description: 'ISO-8601 → endsAt > from' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'from debe ser una fecha ISO-8601' })
  from?: string;

  @ApiPropertyOptional({ description: 'ISO-8601 → startsAt < to' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'to debe ser una fecha ISO-8601' })
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID(undefined, { message: 'courtId debe ser un UUID válido' })
  courtId?: string;

  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus, { message: 'Estado inválido' })
  status?: BookingStatus;

  @ApiPropertyOptional({
    minLength: 2,
    description: 'Busca en nombre / email / teléfono del cliente',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'La búsqueda debe tener al menos 2 caracteres' })
  q?: string;

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    description: "Default: 'asc' con date/from, 'desc' si no",
  })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: "order debe ser 'asc' o 'desc'" })
  order?: 'asc' | 'desc';

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Min(1, { message: 'limit debe ser al menos 1' })
  @Max(200, { message: 'limit no puede superar 200' })
  limit: number = 100;
}
