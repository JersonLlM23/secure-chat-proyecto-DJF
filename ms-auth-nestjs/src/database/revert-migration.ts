import dataSource from './data-source.js';

async function main(): Promise<void> {
  await dataSource.initialize();

  try {
    await dataSource.undoLastMigration({ transaction: 'each' });
    console.log('Última migración revertida.');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Error revirtiendo migración:', error);
  process.exitCode = 1;
});
