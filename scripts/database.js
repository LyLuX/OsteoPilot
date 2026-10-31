import { createEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/core/database/database.js';
import {
  inspectDatabase,
  migrate,
  checkSchema,
  undoMigration,
} from '../src/core/database/migrations.js';
let db;
try {
  const config = createEnvironment(process.env, { databaseOnly: true });
  db = createDatabase(config);
  await db.sequelize.authenticate();
  const command = process.argv[2];
  if (!['status', 'migrate', 'check', 'undo'].includes(command))
    throw new Error('Commande inconnue.');
  const state = await inspectDatabase(db);
  process.stdout.write(JSON.stringify(state, null, 2) + '\n');
  if (command === 'migrate') await migrate(db);
  if (command === 'check') await checkSchema(db);
  if (command === 'undo') {
    const options = process.argv.slice(3);
    if (options.length !== 1 || !options[0].startsWith('--confirm-database='))
      throw new Error('Retour arrière : fournir uniquement --confirm-database=nom_de_la_base.');
    const result = await undoMigration(db, {
      confirmDatabase: options[0].slice('--confirm-database='.length),
    });
    process.stdout.write(
      result.undone
        ? 'Migration annulée : ' + result.undone + '\n'
        : 'Aucune migration à annuler.\n',
    );
  }
  if (['migrate', 'check'].includes(command)) process.stdout.write('Contrôle du schéma réussi.\n');
} catch (error) {
  const known =
    error.message.includes('Schéma') ||
    error.message.startsWith('Retour arrière') ||
    error.message === 'Une migration est déjà en cours.' ||
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
