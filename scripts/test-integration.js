import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { createEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/core/database/database.js';
import { migrate, checkSchema } from '../src/core/database/migrations.js';
const databaseName = 'osteopilot_test_' + randomBytes(8).toString('hex');
let connection;
let db;
let created = false;
let cleaned = false;
let passed = false;
let failure = '';
try {
  if (!process.env.DATABASE_USER) throw new Error('DATABASE_USER manquant.');
  if (!/^osteopilot_test_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Isolation invalide.');
  connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST || '127.0.0.1',
    port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD || '',
    connectTimeout: 5000,
  });
  // Seul ce nom aléatoire interne est admis pour les opérations de création/nettoyage.
  await connection.query(
    'CREATE DATABASE `' + databaseName + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  );
  created = true;
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_NAME: databaseName,
    JWT_SECRET: randomBytes(48).toString('hex'),
    TEST_DATABASE_ISOLATED: databaseName,
    PORT: '3008',
    PUBLIC_REGISTRATION_ENABLED: 'false',
    MAIL_ENABLED: 'false',
  };
  db = createDatabase(createEnvironment(env, { databaseOnly: true }));
  await migrate(db);
  await checkSchema(db);
  // Deuxième passage : aucune recréation ni écrasement des références.
  const before = await db.models.Permissions.count();
  await migrate(db);
  if ((await db.models.Permissions.count()) !== before)
    throw new Error('Migration non idempotente.');
  await db.sequelize.close();
  db = null;
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--experimental-vm-modules',
        'node_modules/jest/bin/jest.js',
        '--config',
        'jest.integration.config.js',
        '--runInBand',
      ],
      { cwd: process.cwd(), env, stdio: 'inherit', shell: false },
    );
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0) throw new Error('Tests MySQL en échec.');
  passed = true;
} catch (error) {
  failure =
    error.original?.code ||
    error.code ||
    (error.status || error.message.includes('manquant')
      ? error.message
      : 'Validation MySQL en échec.');
  process.stderr.write(failure + '\n');
  process.exitCode = 1;
} finally {
  if (db) await db.sequelize.close();
  if (created && connection) {
    try {
      if (!/^osteopilot_test_[a-f0-9]{16}$/.test(databaseName) || databaseName === 'osteopilot')
        throw new Error('Isolation perdue.');
      await connection.query('DROP DATABASE `' + databaseName + '`');
      cleaned = true;
      process.stdout.write('Base de test éphémère supprimée ; osteopilot préservée.\n');
    } catch {
      passed = false;
      failure = 'Nettoyage MySQL impossible.';
      process.stderr.write(failure + '\n');
      process.exitCode = 1;
    }
  }
  if (connection) await connection.end();
  await mkdir('coverage/security', { recursive: true });
  await writeFile(
    'coverage/security/mysql.json',
    JSON.stringify(
      {
        passed,
        failure,
        database: databaseName,
        cleaned,
        sha: process.env.GITHUB_SHA || null,
      },
      null,
      2,
    ),
  );
}
