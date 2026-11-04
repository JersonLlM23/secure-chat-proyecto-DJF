import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: '1712345675' })
  @IsString()
  @Matches(/^[0-9]{10}$/, {
    message: 'La cédula debe contener exactamente 10 dígitos',
  })
  cedula: string;

  @ApiProperty({ example: 'Juan Carlos' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombres: string;

  @ApiProperty({ example: 'Pérez López' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  apellidos!: string;

  @ApiProperty({ example: '1990-05-15' })
  @IsDateString()
  fechaNacimiento!: string;

  @ApiProperty({ example: 'jperez' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MinLength(4)
  @MaxLength(50)
  @Matches(/^[a-z0-9._-]+$/)
  username!: string;

  @ApiProperty({ example: 'jperez@example.com' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(150)
  email!: string;

  @ApiProperty({ example: '0991000001' })
  @IsString()
  @Matches(/^[0-9]{10}$/, {
    message: 'El teléfono debe contener exactamente 10 dígitos',
  })
  telefono: string;

  @ApiProperty({ example: 'ClaveSegura2026!' })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
