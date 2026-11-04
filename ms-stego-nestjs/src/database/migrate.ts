import dataSource from './data-source.js';

/*
 * Ejecuta las migraciones pendientes y termina.
 * Diseñado para ser invocado antes de iniciar la aplicación, tanto en
 * local como en el contenedor Docker.
 */
async function main(): Promise<void> {
  await dataSource.initialize();

  try {
    const executed = await dataSource.runMigrations({
      transaction: 'each',
    });

    if (executed.length === 0) {
      console.log('No hay migraciones pendientes.');
    } else {
      for (const migration of executed) {
        console.log(`Migración aplicada: ${migration.name}`);
      }
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Error ejecutando migraciones:', error);
  process.exitCode = 1;
});
