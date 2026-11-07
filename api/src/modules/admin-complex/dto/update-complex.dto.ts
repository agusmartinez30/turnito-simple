import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
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
import { normalizePhone } from '../../../shared/customers/phone';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const phone = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() !== ''
    ? normalizePhone(value)
    : value;

/** Trims strings and turns a blank one into `null`, so an empty field clears the value. */
const blankToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** `timezone` no está acá a propósito: forbidNonWhitelisted lo rechaza (docs/08-admin-complex.md). */
export class UpdateComplexDto {
  @ApiPropertyOptional({
    example: 'Complejo Norte',
    minLength: 2,
    maxLength: 80,
  })
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @Length(2, 80, { message: 'El nombre debe tener entre 2 y 80 caracteres' })
  name?: string;

  @ApiPropertyOptional({
    example: 'Av. Siempreviva 742',
    minLength: 2,
    maxLength: 160,
  })
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'La dirección debe ser texto' })
  @Length(2, 160, {
    message: 'La dirección debe tener entre 2 y 160 caracteres',
  })
  address?: string;

  @ApiPropertyOptional({ example: 24, minimum: 0, maximum: 168 })
  @IsOptional()
  @IsInt({ message: 'La ventana debe ser un número entero de horas' })
  @Min(0, { message: 'La ventana no puede ser negativa' })
  @Max(168, { message: 'La ventana no puede superar 168 horas (7 días)' })
  cancellationWindowHours?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean({ message: 'autoConfirmPublicRequests debe ser booleano' })
  autoConfirmPublicRequests?: boolean;

  @ApiPropertyOptional({
    example: 'https://www.instagram.com/complejo',
  })
  @Transform(trim)
  @IsOptional()
  @IsUrl(
    { require_protocol: true },
    { message: 'El link de Instagram debe ser una URL válida' },
  )
  instagramUrl?: string | null;

  @ApiPropertyOptional({
    example: 'https://www.facebook.com/complejo',
  })
  @Transform(trim)
  @IsOptional()
  @IsUrl(
    { require_protocol: true },
    { message: 'El link de Facebook debe ser una URL válida' },
  )
  facebookUrl?: string | null;

  @ApiPropertyOptional({
    example: 'https://www.tiktok.com/@complejo',
  })
  @Transform(trim)
  @IsOptional()
  @IsUrl(
    { require_protocol: true },
    { message: 'El link de TikTok debe ser una URL válida' },
  )
  tiktokUrl?: string | null;

  @ApiPropertyOptional({
    example: 'https://www.youtube.com/@complejo',
  })
  @Transform(trim)
  @IsOptional()
  @IsUrl(
    { require_protocol: true },
    { message: 'El link de YouTube debe ser una URL válida' },
  )
  youtubeUrl?: string | null;

  /** Canoniza a `+dígitos` como `customers.phone`; `null` lo borra. */
  @ApiPropertyOptional({ example: '+5493511111111', nullable: true })
  @Transform(phone)
  @IsOptional()
  @IsString({ message: 'El WhatsApp debe ser texto' })
  @Matches(/^\+\d{8,15}$/, {
    message: 'El WhatsApp debe tener entre 8 y 15 dígitos, con código de país',
  })
  contactWhatsapp?: string | null;

  /** CBU/CVU: exactly 22 digits. Blank or `null` clears it. */
  @ApiPropertyOptional({
    example: '0000003100012345678901',
    nullable: true,
  })
  @Transform(blankToNull)
  @IsOptional()
  @IsString({ message: 'El CBU/CVU debe ser texto' })
  @Matches(/^\d{22}$/, {
    message: 'El CBU/CVU debe tener exactamente 22 dígitos',
  })
  bankCbu?: string | null;

  /** Bank alias: 6-20 chars of letters, digits, dots and hyphens. Blank or `null` clears it. */
  @ApiPropertyOptional({ example: 'complejo.demo', nullable: true })
  @Transform(blankToNull)
  @IsOptional()
  @IsString({ message: 'El alias debe ser texto' })
  @Matches(/^[A-Za-z0-9.-]{6,20}$/, {
    message:
      'El alias debe tener entre 6 y 20 caracteres: letras, números, puntos o guiones',
  })
  bankAlias?: string | null;

  /** Account holder name, up to 100 chars. Blank or `null` clears it. */
  @ApiPropertyOptional({ example: 'Complejo Demo SRL', nullable: true })
  @Transform(blankToNull)
  @IsOptional()
  @IsString({ message: 'El titular debe ser texto' })
  @MaxLength(100, { message: 'El titular no puede superar 100 caracteres' })
  bankHolderName?: string | null;
}
