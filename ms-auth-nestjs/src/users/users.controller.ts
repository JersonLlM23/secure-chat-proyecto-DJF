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
  Query,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';
import { CedulaPipe } from '../common/pipes/cedula/cedula.pipe.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto/pagination-query.dto.js';
import { Roles } from '../auth/decorators/roles/roles.decorator.js';

const UUID_V4 = new ParseUUIDPipe({ version: '4' });

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles('ADMIN')
  @Throttle({
    default: {
      limit: 10,
      ttl: 60_000,
    },
  })
  @ApiOperation({ summary: 'Crear un usuario (ADMIN)' })
  @ApiResponse({ status: 201, description: 'Usuario creado' })
  @ApiResponse({ status: 409, description: 'Conflicto de unicidad' })
  create(
    @Body()
    dto: CreateUserDto,
  ) {
    return this.usersService.create(dto);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar usuarios (ADMIN)' })
  findAll(
    @Query()
    pagination: PaginationQueryDto,
  ) {
    return this.usersService.findAll(pagination);
  }

  @Get('cedula/:cedula')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Buscar un usuario por cédula (ADMIN)' })
  findByCedula(
    @Param('cedula', CedulaPipe)
    cedula: string,
  ) {
    return this.usersService.findByCedula(cedula);
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Obtener un usuario por id (ADMIN)' })
  findOne(
    @Param('id', UUID_V4)
    id: string,
  ) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Actualizar un usuario (ADMIN)' })
  update(
    @Param('id', UUID_V4)
    id: string,

    @Body()
    dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar lógicamente un usuario (ADMIN)' })
  @ApiResponse({ status: 204, description: 'Usuario eliminado' })
  async remove(
    @Param('id', UUID_V4)
    id: string,
  ): Promise<void> {
    await this.usersService.remove(id);
  }
}
