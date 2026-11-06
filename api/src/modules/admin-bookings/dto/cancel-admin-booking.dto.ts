import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

export class CancelAdminBookingDto {
  @ApiPropertyOptional({
    maxLength: 280,
    example: 'El cliente avisó por teléfono',
  })
  @Transform(trim)
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString({ message: 'El motivo debe ser texto' })
  @MaxLength(280, { message: 'El motivo no puede superar 280 caracteres' })
  reason?: string;
}
