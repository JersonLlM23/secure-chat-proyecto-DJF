import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CreateUserRoleDto } from './dto/create-user-role.dto.js';
import { UpdateUserRoleDto } from './dto/update-user-role.dto.js';
import { UserRolesService } from './user-roles.service.js';
import { Roles } from '../auth/decorators/roles/roles.decorator.js';

const UUID_V4 = new ParseUUIDPipe({ version: '4' });

@ApiTags('user-roles')
@ApiBearerAuth()
@Controller('user-roles')
export class UserRolesController {
  constructor(private readonly userRolesService: UserRolesService) {}

  @Post()
  @Roles('ADMIN')
  @Throttle({
    default: {
      limit: 20,
      ttl: 60_000,
    },
  })
  @ApiOperation({ summary: 'Asignar un rol a un usuario' })
  @ApiResponse({ status: 201, description: 'Asignación creada' })
  @ApiResponse({ status: 409, description: 'Asignación duplicada' })
  create(
    @Body()
    dto: CreateUserRoleDto,
  ) {
    return this.userRolesService.create(dto);
  }

  @Get('user/:userId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar asignaciones de un usuario' })
  findByUser(
    @Param('userId', UUID_V4)
    userId: string,
  ) {
    return this.userRolesService.findByUser(userId);
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Consultar una asignación por su id' })
  findOne(
    @Param('id', UUID_V4)
    id: string,
  ) {
    return this.userRolesService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Activar o desactivar una asignación' })
  updateStatus(
    @Param('id', UUID_V4)
    id: string,

    @Body()
    dto: UpdateUserRoleDto,
  ) {
    return this.userRolesService.updateStatus(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una asignación por su id' })
  async removeById(
    @Param('id', UUID_V4)
    id: string,
  ): Promise<void> {
    await this.userRolesService.removeById(id);
  }

  /*
   * Ruta heredada: elimina por la pareja (userId, roleId).
   * Se conserva por compatibilidad con clientes existentes.
   */
  @Delete(':userId/:roleId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una asignación por usuario y rol' })
  async remove(
    @Param('userId', UUID_V4)
    userId: string,

    @Param('roleId', UUID_V4)
    roleId: string,
  ): Promise<void> {
    await this.userRolesService.remove(userId, roleId);
  }
}
