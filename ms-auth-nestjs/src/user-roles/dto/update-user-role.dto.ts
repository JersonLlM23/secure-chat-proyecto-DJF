import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/*
 * Activación/desactivación de una asignación existente sin eliminarla.
 */
export class UpdateUserRoleDto {
  @ApiProperty({ description: 'true activa, false desactiva la asignación' })
  @IsBoolean()
  estado!: boolean;
}
