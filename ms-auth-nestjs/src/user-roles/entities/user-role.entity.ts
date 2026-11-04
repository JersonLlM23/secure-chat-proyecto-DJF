import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import type { Relation } from 'typeorm';

import { User } from '../../users/entities/user.entity.js';
import { Role } from '../../roles/entities/role.entity.js';

/*
 * Tabla intermedia N:M.
 *
 * Restricción de unicidad a nivel de base de datos en (user_id, role_id)
 * para impedir asignaciones duplicadas. `status` permite activar y
 * desactivar una asignación sin eliminarla.
 */
@Entity({
  name: 'user_roles',
})
@Index('UQ_user_roles_user_role', ['userId', 'roleId'], {
  unique: true,
})
@Index('IDX_user_roles_user', ['userId'])
@Index('IDX_user_roles_role', ['roleId'])
export class UserRole {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    name: 'user_id',
    type: 'uuid',
  })
  userId!: string;

  @Column({
    name: 'role_id',
    type: 'uuid',
  })
  roleId!: string;

  @ManyToOne(() => User, (user) => user.userRoles, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
  })
  user!: Relation<User>;

  @ManyToOne(() => Role, (role) => role.userRoles, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'role_id',
  })
  role!: Relation<Role>;

  @CreateDateColumn({
    name: 'assigned_at',
    type: 'timestamp',
  })
  fechaAsignacion!: Date;

  @Column({
    name: 'status',
    type: 'boolean',
    default: true,
  })
  estado!: boolean;

  @VersionColumn({
    name: 'version',
  })
  version!: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
  })
  fechaCreacion!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
  })
  fechaActualizacion!: Date;
}
