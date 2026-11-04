import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AuthorizationCheckDto {
  /*
   * JWT del usuario final. Es la única fuente de identidad: nunca se
   * acepta un userId enviado libremente por STEGO.
   */
  @ApiProperty({ description: 'JWT del usuario final (RS256)' })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  subject_token!: string;

  @ApiProperty({ example: 'steganography.analyze' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  action!: string;

  @ApiPropertyOptional({ nullable: true, example: null })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  resource_id?: string | null;
}
