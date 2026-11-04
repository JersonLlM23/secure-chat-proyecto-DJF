import { MigrationInterface, QueryRunner } from 'typeorm';

interface ColumnDefaultRow {
  column_default: string | null;
}

/*
 * La entidad declara el id con @PrimaryGeneratedColumn('uuid'), por lo que
 * TypeORM omite la columna y espera que PostgreSQL genere el valor. La
 * migracion inicial creo "id" sin DEFAULT, lo que producia:
 *
 *   null value in column "id" of relation "stego_analysis"
 *   violates not-null constraint
 *
 * Esta migracion agrega el DEFAULT sin recrear la tabla ni tocar filas.
 * gen_random_uuid() es nativo en PostgreSQL 13+ (la imagen usa 18).
 */
export class StegoAnalysisIdDefault1760000001000
  implements MigrationInterface
{
  name = 'StegoAnalysisIdDefault1760000001000';

  transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: ColumnDefaultRow[] = await queryRunner.query(`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'stego_analysis'
        AND column_name = 'id'
    `);

    if (rows.length === 0) {
      throw new Error(
        'No existe public.stego_analysis.id; la migracion inicial no se aplico',
      );
    }

    const currentDefault = rows[0].column_default;

    if (
      currentDefault === 'gen_random_uuid()' ||
      /^uuid_generate_v\d+\(\)$/.test(currentDefault ?? '')
    ) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "stego_analysis"
      ALTER COLUMN "id" SET DEFAULT gen_random_uuid()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stego_analysis"
      ALTER COLUMN "id" DROP DEFAULT
    `);
  }
}
