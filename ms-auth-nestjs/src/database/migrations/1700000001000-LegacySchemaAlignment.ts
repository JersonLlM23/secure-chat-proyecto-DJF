import { MigrationInterface, QueryRunner } from 'typeorm';

/*
 * Alinea el esquema heredado (creado con synchronize:true y nombres en
 * español) con el esquema final:
 *
 * - users/roles: estado -> status, fecha_creacion -> created_at,
 *   fecha_actualizacion -> updated_at, fecha_eliminacion -> deleted_at.
 * - user_roles: agrega id (PK), assigned_at y created_at; mantiene una
 *   restricción UNIQUE (user_id, role_id) a nivel de base de datos.
 * - Roles del proyecto: ADMIN, ANALYST, USER. Las asignaciones heredadas
 *   OPERADOR -> ANALYST y CLIENTE -> USER se migran sin perder datos.
 *
 * Toda la operación es idempotente: puede ejecutarse sobre una base ya
 * alineada sin efectos adicionales.
 */
export class LegacySchemaAlignment1700000001000 implements MigrationInterface {
  name = 'LegacySchemaAlignment1700000001000';

  transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.alignAuditColumns(queryRunner, 'users');
    await this.alignAuditColumns(queryRunner, 'roles');

    await this.renameIfExists(
      queryRunner,
      'user_roles',
      'estado',
      'status',
    );
    await this.renameIfExists(
      queryRunner,
      'user_roles',
      'fecha_asignacion',
      'assigned_at',
    );
    await this.renameIfExists(
      queryRunner,
      'user_roles',
      'fecha_actualizacion',
      'updated_at',
    );

    await this.addColumnIfMissing(
      queryRunner,
      'user_roles',
      'id',
      'uuid DEFAULT gen_random_uuid()',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'user_roles',
      'assigned_at',
      'TIMESTAMP NOT NULL DEFAULT now()',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'user_roles',
      'status',
      'boolean NOT NULL DEFAULT true',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'user_roles',
      'version',
      'integer NOT NULL DEFAULT 1',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'user_roles',
      'created_at',
      'TIMESTAMP NOT NULL DEFAULT now()',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'user_roles',
      'updated_at',
      'TIMESTAMP NOT NULL DEFAULT now()',
    );

    await queryRunner.query(
      'UPDATE "user_roles" SET "version" = 1 WHERE "version" IS NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "user_roles" ALTER COLUMN "version" SET DEFAULT 1',
    );

    await this.ensureUserRolesIdPrimaryKey(queryRunner);

    /*
     * Índices y restricciones.
     */
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_roles_user_role"
      ON "user_roles" ("user_id", "role_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_roles_user"
      ON "user_roles" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_roles_role"
      ON "user_roles" ("role_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_cedula" ON "users" ("cedula")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_username" ON "users" ("username")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_email" ON "users" ("email")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_telefono" ON "users" ("telefono")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_roles_rol" ON "roles" ("rol")
    `);

    if (!(await this.constraintExists(queryRunner, 'users', 'CHK_users_cedula'))) {
      await queryRunner.query(`
        ALTER TABLE "users" ADD CONSTRAINT "CHK_users_cedula"
        CHECK ("cedula" ~ '^[0-9]{10}$')
      `);
    }

    if (
      !(await this.constraintExists(queryRunner, 'users', 'CHK_users_telefono'))
    ) {
      await queryRunner.query(`
        ALTER TABLE "users" ADD CONSTRAINT "CHK_users_telefono"
        CHECK ("telefono" ~ '^[0-9]{10}$')
      `);
    }

    /*
     * Roles del proyecto. Se insertan de forma condicional para no
     * duplicar si ya existen con distinta capitalización.
     */
    for (const role of ['ADMIN', 'ANALYST', 'USER']) {
      await queryRunner.query(
        `
          INSERT INTO "roles" ("rol", "status", "version")
          SELECT $1::varchar, true, 1
          WHERE NOT EXISTS (
            SELECT 1 FROM "roles" WHERE upper("rol") = $1::varchar
          )
        `,
        [role],
      );
    }

    /*
     * Migración de asignaciones heredadas.
     */
    await queryRunner.query(`
      INSERT INTO "user_roles" ("user_id", "role_id", "status", "version")
      SELECT ur."user_id", target."id", true, 1
      FROM "user_roles" ur
      JOIN "roles" legacy ON legacy."id" = ur."role_id"
      JOIN "roles" target ON upper(target."rol") = 'ANALYST'
      WHERE upper(legacy."rol") = 'OPERADOR'
      ON CONFLICT ("user_id", "role_id") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "user_roles" ("user_id", "role_id", "status", "version")
      SELECT ur."user_id", target."id", true, 1
      FROM "user_roles" ur
      JOIN "roles" legacy ON legacy."id" = ur."role_id"
      JOIN "roles" target ON upper(target."rol") = 'USER'
      WHERE upper(legacy."rol") = 'CLIENTE'
      ON CONFLICT ("user_id", "role_id") DO NOTHING
    `);

    /*
     * Los roles heredados se conservan por trazabilidad pero quedan
     * inactivos: no vuelven a conceder permisos.
     */
    await queryRunner.query(`
      UPDATE "roles" SET "status" = false
      WHERE upper("rol") IN ('OPERADOR', 'CLIENTE')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_user_roles_user_role"',
    );

    const primaryKey = await this.primaryKeyColumns(queryRunner, 'user_roles');

    if (primaryKey.length > 0) {
      const name = await this.primaryKeyName(queryRunner, 'user_roles');
      if (name) {
        await queryRunner.query(
          `ALTER TABLE "user_roles" DROP CONSTRAINT "${name}"`,
        );
      }
    }

    await queryRunner.query(`
      ALTER TABLE "user_roles"
      ADD CONSTRAINT "PK_user_roles_legacy" PRIMARY KEY ("user_id", "role_id")
    `);

    await queryRunner.query('ALTER TABLE "user_roles" DROP COLUMN IF EXISTS "id"');

    await this.renameIfExists(queryRunner, 'user_roles', 'status', 'estado');
    await this.renameIfExists(
      queryRunner,
      'user_roles',
      'assigned_at',
      'fecha_asignacion',
    );
    await this.renameIfExists(
      queryRunner,
      'user_roles',
      'updated_at',
      'fecha_actualizacion',
    );
    await queryRunner.query(
      'ALTER TABLE "user_roles" DROP COLUMN IF EXISTS "created_at"',
    );

    await this.revertAuditColumns(queryRunner, 'roles');
    await this.revertAuditColumns(queryRunner, 'users');
  }

  private async alignAuditColumns(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<void> {
    await this.renameIfExists(queryRunner, table, 'estado', 'status');
    await this.renameIfExists(
      queryRunner,
      table,
      'fecha_creacion',
      'created_at',
    );
    await this.renameIfExists(
      queryRunner,
      table,
      'fecha_actualizacion',
      'updated_at',
    );
    await this.renameIfExists(
      queryRunner,
      table,
      'fecha_eliminacion',
      'deleted_at',
    );

    await this.addColumnIfMissing(
      queryRunner,
      table,
      'status',
      'boolean NOT NULL DEFAULT true',
    );
    await this.addColumnIfMissing(
      queryRunner,
      table,
      'created_at',
      'TIMESTAMP NOT NULL DEFAULT now()',
    );
    await this.addColumnIfMissing(
      queryRunner,
      table,
      'updated_at',
      'TIMESTAMP NOT NULL DEFAULT now()',
    );
    await this.addColumnIfMissing(
      queryRunner,
      table,
      'deleted_at',
      'TIMESTAMP NULL',
    );
    await this.addColumnIfMissing(
      queryRunner,
      table,
      'version',
      'integer NOT NULL DEFAULT 1',
    );

    await queryRunner.query(
      `UPDATE "${table}" SET "version" = 1 WHERE "version" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${table}" ALTER COLUMN "version" SET DEFAULT 1`,
    );
  }

  private async revertAuditColumns(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<void> {
    await this.renameIfExists(queryRunner, table, 'status', 'estado');
    await this.renameIfExists(queryRunner, table, 'created_at', 'fecha_creacion');
    await this.renameIfExists(
      queryRunner,
      table,
      'updated_at',
      'fecha_actualizacion',
    );
    await this.renameIfExists(queryRunner, table, 'deleted_at', 'fecha_eliminacion');
  }

  private async renameIfExists(
    queryRunner: QueryRunner,
    table: string,
    from: string,
    to: string,
  ): Promise<void> {
    const hasFrom = await this.columnExists(queryRunner, table, from);
    const hasTo = await this.columnExists(queryRunner, table, to);

    if (hasFrom && !hasTo) {
      await queryRunner.query(
        `ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}"`,
      );
    }
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    definition: string,
  ): Promise<void> {
    const exists = await this.columnExists(queryRunner, table, column);

    if (!exists) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`,
      );
    }
  }

  private async columnExists(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows: unknown[] = await queryRunner.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      `,
      [table, column],
    );

    return rows.length > 0;
  }

  private async constraintExists(
    queryRunner: QueryRunner,
    table: string,
    constraint: string,
  ): Promise<boolean> {
    const rows: unknown[] = await queryRunner.query(
      `
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = $1 AND con.conname = $2
      `,
      [table, constraint],
    );

    return rows.length > 0;
  }

  private async primaryKeyName(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<string | null> {
    const rows: { conname: string }[] = await queryRunner.query(
      `
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = $1 AND con.contype = 'p'
      `,
      [table],
    );

    return rows[0]?.conname ?? null;
  }

  private async primaryKeyColumns(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<string[]> {
    const rows: { attname: string }[] = await queryRunner.query(
      `
        SELECT a.attname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_attribute a
          ON a.attrelid = con.conrelid
         AND a.attnum = ANY (con.conkey)
        WHERE rel.relname = $1 AND con.contype = 'p'
      `,
      [table],
    );

    return rows.map((row) => row.attname);
  }

  private async ensureUserRolesIdPrimaryKey(
    queryRunner: QueryRunner,
  ): Promise<void> {
    /*
     * Rellenar los id de filas heredadas antes de imponer NOT NULL / PK.
     */
    await queryRunner.query(`
      UPDATE "user_roles" SET "id" = gen_random_uuid() WHERE "id" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "user_roles" ALTER COLUMN "id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "user_roles" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()
    `);

    const columns = await this.primaryKeyColumns(queryRunner, 'user_roles');

    const alreadyPrimaryOnId =
      columns.length === 1 && columns[0] === 'id';

    if (alreadyPrimaryOnId) {
      return;
    }

    const currentName = await this.primaryKeyName(queryRunner, 'user_roles');

    if (currentName) {
      await queryRunner.query(
        `ALTER TABLE "user_roles" DROP CONSTRAINT "${currentName}"`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE "user_roles"
      ADD CONSTRAINT "PK_user_roles" PRIMARY KEY ("id")
    `);
  }
}
