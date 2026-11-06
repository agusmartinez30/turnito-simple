import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

export class VoidPaymentDto {
  @ApiPropertyOptional({ maxLength: 280, example: 'Se cargó dos veces' })
  @Transform(trim)
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString({ message: 'El motivo debe ser texto' })
  @MaxLength(280, { message: 'El motivo no puede superar 280 caracteres' })
  reason?: string;
}
