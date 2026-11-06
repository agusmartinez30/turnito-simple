import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ApprovePaymentProofDto {
  @ApiPropertyOptional({
    minimum: 1,
    example: 5000,
    description:
      "Defaults to the proof's declared amount (capped to the booking balance)",
  })
  @IsOptional()
  @IsInt({ message: 'El monto debe ser un número entero' })
  @Min(1, { message: 'El monto debe ser mayor a 0' })
  amount?: number;
}

export class RejectPaymentProofDto {
  @ApiProperty({ minLength: 1, maxLength: 300, example: 'Monto ilegible' })
  @Transform(trim)
  @IsString({ message: 'El motivo debe ser texto' })
  @IsNotEmpty({ message: 'Indicá el motivo del rechazo' })
  @MaxLength(300, { message: 'El motivo no puede superar 300 caracteres' })
  reason!: string;
}
