import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStegoAnalysis1760000000000 implements MigrationInterface {
  name = 'CreateStegoAnalysis1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "stego_analysis_status_enum" AS ENUM (
        'sin_indicios',
        'sospechoso',
        'no_concluyente',
        'error'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "stego_analysis_action_enum" AS ENUM (
        'aceptado',
        'cuarentena',
        'rechazo',
        'advertencia'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "stego_analysis" (
        "id" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "filename" character varying(255) NOT NULL,
        "sha256" character varying(64) NOT NULL,
        "technique" character varying(100) NOT NULL,
        "status" "stego_analysis_status_enum" NOT NULL,
        "indicators" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "action" "stego_analysis_action_enum" NOT NULL,
        "limitations" text NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stego_analysis_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_stego_analysis_user_id"
      ON "stego_analysis" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_stego_analysis_sha256"
      ON "stego_analysis" ("sha256")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_stego_analysis_created_at"
      ON "stego_analysis" ("createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stego_analysis_created_at"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stego_analysis_sha256"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stego_analysis_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stego_analysis"`);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "stego_analysis_action_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "stego_analysis_status_enum"`,
    );
  }
}
