import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'ANALYST' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value, //Admin - ADMIN - admin
  )
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/)
  rol!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
