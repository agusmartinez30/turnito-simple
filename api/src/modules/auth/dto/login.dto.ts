import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ana@demo.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El email no es válido' })
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsString({ message: 'La contraseña debe ser texto' })
  @MinLength(1, { message: 'Ingresá tu contraseña' })
  password!: string;
}
