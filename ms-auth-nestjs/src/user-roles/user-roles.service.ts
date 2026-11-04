import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { QueryFailedError, Repository } from 'typeorm';

import { RolesService } from '../roles/roles.service.js';

import { UsersService } from '../users/users.service.js';

import { CreateUserRoleDto } from './dto/create-user-role.dto.js';

import { UpdateUserRoleDto } from './dto/update-user-role.dto.js';

import { UserRole } from './entities/user-role.entity.js';

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  return (
    (
      error.driverError as {
        code?: string;
      }
    )?.code === '23505'
  );
}

@Injectable()
export class UserRolesService {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRolesRepository: Repository<UserRole>,

    private readonly usersService: UsersService,

    private readonly rolesService: RolesService,
  ) {}

  async create(dto: CreateUserRoleDto): Promise<UserRole> {
    const [userExists, roleExists] = await Promise.all([
      this.usersService.exists(dto.userId),

      this.rolesService.exists(dto.roleId),
    ]);

    if (!userExists) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (!roleExists) {
      throw new NotFoundException('Rol no encontrado');
    }

    const relation = this.userRolesRepository.create({
      userId: dto.userId,
      roleId: dto.roleId,
      estado: dto.estado ?? true,
    });

    try {
      const saved = await this.userRolesRepository.save(relation);
      return this.findOne(saved.id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('El usuario ya posee este rol');
      }

      throw error;
    }
  }

  async findByUser(userId: string): Promise<UserRole[]> {
    const exists = await this.usersService.exists(userId);

    if (!exists) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return this.userRolesRepository.find({
      where: {
        userId,
      },

      relations: {
        role: true,
      },

      order: {
        fechaAsignacion: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<UserRole> {
    const relation = await this.userRolesRepository.findOne({
      where: {
        id,
      },

      relations: {
        user: true,
        role: true,
      },
    });

    if (!relation) {
      throw new NotFoundException('La asignación usuario-rol no existe');
    }

    return relation;
  }

  async updateStatus(id: string, dto: UpdateUserRoleDto): Promise<UserRole> {
    const relation = await this.findOne(id);

    relation.estado = dto.estado;

    await this.userRolesRepository.save(relation);

    return this.findOne(id);
  }

  async removeById(id: string): Promise<void> {
    const result = await this.userRolesRepository.delete({ id });

    if (!result.affected) {
      throw new NotFoundException('La asignación usuario-rol no existe');
    }
  }

  async remove(userId: string, roleId: string): Promise<void> {
    const result = await this.userRolesRepository.delete({
      userId,
      roleId,
    });

    if (!result.affected) {
      throw new NotFoundException('La asignación usuario-rol no existe');
    }
  }
}
