import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'username o email',
    example: 'jperez',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MinLength(4)
  @MaxLength(150)
  identifier!: string;

  @ApiProperty({ example: 'ClaveSegura2026!' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
