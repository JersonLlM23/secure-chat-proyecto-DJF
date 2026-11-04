import 'dotenv/config';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DataSource } from 'typeorm';

import { Role } from '../roles/entities/role.entity.js';
import { UserRole } from '../user-roles/entities/user-role.entity.js';
import { User } from '../users/entities/user.entity.js';

function required(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Variable requerida no definida: ${key}`);
  }

  return value;
}

/*
 * Ruta calculada desde el archivo compilado, por lo que funciona igual
 * en local (dist/database) y dentro de Docker.
 */
const currentDirectory = dirname(fileURLToPath(import.meta.url));

export default new DataSource({
  type: 'postgres',

  host: required('DB_HOST'),

  port: Number(required('DB_PORT')),

  username: required('DB_USERNAME'),

  password: required('DB_PASSWORD'),

  database: required('DB_DATABASE'),

  entities: [User, Role, UserRole],

  migrations: [join(currentDirectory, 'migrations', '*.js')],

  synchronize: false,

  logging: ['error'],
});
