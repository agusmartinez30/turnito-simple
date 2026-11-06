import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CreateCourtDto } from './create-court.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Todos los campos opcionales; los que vienen se validan igual que en create.
 * `surface` e `imageUrl` aceptan `null` para borrar el valor ('' también se trata como null).
 */
export class UpdateCourtDto extends PartialType(
  OmitType(CreateCourtDto, ['surface', 'imageUrl'] as const),
) {
  @ApiPropertyOptional({ maxLength: 40, nullable: true })
  @Transform(trim)
  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString({ message: 'La superficie debe ser texto' })
  @MaxLength(40, { message: 'La superficie no puede superar 40 caracteres' })
  surface?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'La imagen debe ser una URL http(s) válida' },
  )
  @MaxLength(500, { message: 'La URL no puede superar 500 caracteres' })
  imageUrl?: string | null;
}
