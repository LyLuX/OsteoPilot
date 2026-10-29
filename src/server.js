import { createEnvironment } from './config/env.js';
import { createDatabase } from './core/database/database.js';
import { checkSchema } from './core/database/migrations.js';
import { createApp } from './app.js';

let db;
try {
  const config = createEnvironment();
  createEnvironment(process.env, { databaseOnly: true });
  db = createDatabase(config);
  await db.sequelize.authenticate();
  await checkSchema(db);
  const server = createApp({ db, config }).listen(config.port, '127.0.0.1', () => {
    process.stdout.write('OsteoPilot : http://localhost:3008\n');
  });
  const stop = () =>
    server.close(async () => {
      await db.sequelize.close();
      process.exit(0);
    });
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
} catch (error) {
  process.stderr.write(
    error.message.startsWith('Schéma') ||
      error.message.includes('manquant') ||
      error.message.includes('JWT_SECRET')
      ? error.message + '\n'
      : 'Démarrage impossible : vérifier la configuration et MySQL.\n',
  );
  if (db) await db.sequelize.close();
  process.exitCode = 1;
}
