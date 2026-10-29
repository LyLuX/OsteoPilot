import { createEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/core/database/database.js';
import { inspectDatabase, migrate, checkSchema } from '../src/core/database/migrations.js';
let db;
try {
  const config = createEnvironment(process.env, { databaseOnly: true });
  db = createDatabase(config);
  await db.sequelize.authenticate();
  const command = process.argv[2];
  if (!['status', 'migrate', 'check'].includes(command)) throw new Error('Commande inconnue.');
  const state = await inspectDatabase(db);
  process.stdout.write(JSON.stringify(state, null, 2) + '\n');
  if (command === 'migrate') await migrate(db);
  if (command === 'check') await checkSchema(db);
  if (command !== 'status') process.stdout.write('Contrôle du schéma réussi.\n');
} catch (error) {
  const known =
    error.message.includes('Schéma') ||
    error.message.includes('manquant') ||
    error.message.includes('Base de test');
  process.stderr.write(
    known
      ? error.message + '\n'
      : 'MySQL inaccessible ou configuration invalide. Aucun identifiant affiché.\n',
  );
  process.exitCode = 1;
} finally {
  if (db) await db.sequelize.close();
}
