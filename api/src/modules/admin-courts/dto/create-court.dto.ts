import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Sport } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

/** "HH:mm" 24 h. Mismo regex que `LOCAL_TIME_RE` en shared/time/tz.ts. */
export const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateCourtDto {
  @ApiProperty({ example: 'Pádel 4', minLength: 2, maxLength: 40 })
  @Transform(trim)
  @IsString({ message: 'El nombre debe ser texto' })
  @Length(2, 40, { message: 'El nombre debe tener entre 2 y 40 caracteres' })
  name!: string;

  @ApiProperty({ enum: Sport })
  @IsEnum(Sport, { message: 'Deporte inválido' })
  sport!: Sport;

  @ApiPropertyOptional({ example: 'césped sintético', maxLength: 40 })
  @Transform(trim)
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString({ message: 'La superficie debe ser texto' })
  @MaxLength(40, { message: 'La superficie no puede superar 40 caracteres' })
  surface?: string;

  @ApiProperty({ example: false })
  @IsBoolean({ message: 'isIndoor debe ser true o false' })
  isIndoor!: boolean;

  @ApiProperty({ example: 90, minimum: 15, maximum: 240 })
  @IsInt({ message: 'La duración debe ser un número entero de minutos' })
  @Min(15, { message: 'La duración mínima es 15 minutos' })
  @Max(240, { message: 'La duración máxima es 240 minutos' })
  slotDurationMinutes!: number;

  @ApiProperty({ example: '08:00', pattern: LOCAL_TIME_PATTERN.source })
  @Matches(LOCAL_TIME_PATTERN, {
    message: 'La hora de apertura debe tener formato HH:mm',
  })
  openTime!: string;

  @ApiProperty({ example: '23:00', pattern: LOCAL_TIME_PATTERN.source })
  @Matches(LOCAL_TIME_PATTERN, {
    message: 'La hora de cierre debe tener formato HH:mm',
  })
  closeTime!: string;

  @ApiProperty({ example: 12000, minimum: 0 })
  @IsInt({ message: 'El precio debe ser un número entero' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  pricePerSlot!: number;

  @ApiPropertyOptional({ example: 'https://example.com/padel.jpg' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'La imagen debe ser una URL http(s) válida' },
  )
  @MaxLength(500, { message: 'La URL no puede superar 500 caracteres' })
  imageUrl?: string;

  @ApiPropertyOptional({ example: 1, minimum: 0, default: 0 })
  @IsOptional()
  @IsInt({ message: 'El orden debe ser un número entero' })
  @Min(0, { message: 'El orden no puede ser negativo' })
  sortOrder?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser true o false' })
  isActive?: boolean;
}
