import { EventEmitter } from 'node:events';
import { jest } from '@jest/globals';
import { createEnvironment } from '../src/config/env.js';
import {
  developmentHttpLogging,
  formatHttpLog,
  supportsLogColor,
} from '../src/core/logger/http-logging.js';
import {
  createDatabaseLoggingOptions,
  describeStatement,
} from '../src/core/logger/database-logging.js';
test('HTTP : route déclarée, statut et durée, sans URL, valeurs, cookies ou patient', () => {
  const emit = jest.fn();
  const response = new EventEmitter();
  response.statusCode = 200;
  const request = {
    method: 'PATCH',
    route: { path: '/api/v1/patients/:id' },
    originalUrl: '/api/v1/patients/private-id?search=patient@example.invalid',
    params: { id: 'private-id' },
    body: { firstName: 'Fictif', password: 'not-a-real-password' },
    headers: { cookie: 'private-cookie' },
  };
  const next = jest.fn();
  developmentHttpLogging(emit)(request, response, next);
  expect(next).toHaveBeenCalledTimes(1);
  response.emit('finish');
  const log = emit.mock.calls[0][0];
  expect(log).toContain('PATCH');
  expect(log).toContain('/api/v1/patients/:id');
  expect(log).toContain('200 OK');
  expect(log).toMatch(/\d+\.\d ms$/);
  expect(log).not.toMatch(/private|Fictif|password|example/);
});
test('route inconnue : aucun chemin contrôlé par le client ; panne de logs sans effet HTTP', () => {
  const response = new EventEmitter();
  response.statusCode = 404;
  const emit = jest.fn();
  developmentHttpLogging(emit)(
    { method: 'GET', originalUrl: '/patient-confidentiel' },
    response,
    () => {},
  );
  response.emit('finish');
  expect(emit.mock.calls[0][0]).toContain('[route inconnue]');
  expect(emit.mock.calls[0][0]).not.toContain('patient-confidentiel');
  const failed = new EventEmitter();
  failed.statusCode = 403;
  developmentHttpLogging(() => {
    throw new Error('Panne');
  })({ method: 'POST' }, failed, () => {});
  expect(() => failed.emit('finish')).not.toThrow();
});
test('SQL : valeurs, commentaires et paramètres après point-virgule masqués', () => {
  const result = describeStatement(
    "Executing (private-transaction): SELECT id FROM Patients WHERE email = 'patient@example.invalid' AND version = 123 AND archived = FALSE /* private-comment */; parameters: ['private-binding']",
  );
  expect(result.operation).toBe('SELECT');
  expect(result.statement).toContain('email = ?');
  expect(result.statement).not.toMatch(/patient@|123|FALSE|private/);
});
test.each(["SELECT 'unterminated-secret", 'SELECT @@unknown', 'x'.repeat(65537), null])(
  'SQL non reconnu masqué entièrement : %p',
  (sql) => {
    expect(describeStatement(sql)).toEqual({ operation: 'UNKNOWN', statement: '[REDACTED]' });
  },
);
test('SQL activable seulement en développement et sans paramètres bruts', () => {
  const emit = jest.fn();
  for (const mode of ['test', 'production'])
    expect(createDatabaseLoggingOptions({ mode, database: { logging: true } }, emit).logging).toBe(
      false,
    );
  expect(
    createDatabaseLoggingOptions({ mode: 'development', database: { logging: false } }, emit)
      .logging,
  ).toBe(false);
  const options = createDatabaseLoggingOptions(
    { mode: 'development', database: { logging: true } },
    emit,
  );
  expect(options.benchmark).toBe(true);
  expect(options.logQueryParameters).toBe(false);
  options.logging("INSERT INTO Patients (firstName) VALUES ('Fictif')", 12);
  expect(JSON.parse(emit.mock.calls[0][0])).toMatchObject({ operation: 'INSERT', durationMs: 12 });
  expect(emit.mock.calls[0][0]).not.toContain('Fictif');
  expect(() =>
    createDatabaseLoggingOptions({ mode: 'development', database: { logging: true } }, () => {
      throw new Error();
    }).logging('COMMIT'),
  ).not.toThrow();
});
test('configuration : traces HTTP par défaut en développement, SQL explicites, aucune trace en production', () => {
  const dev = createEnvironment({
    NODE_ENV: 'development',
    JWT_SECRET: 'development-tests-only-random-secret-at-least-32-bytes',
    DATABASE_LOGGING: 'true',
  });
  expect(dev.httpLogging).toBe(true);
  expect(dev.database.logging).toBe(true);
  expect(createEnvironment({ NODE_ENV: 'test', DATABASE_LOGGING: 'true' }).database.logging).toBe(
    false,
  );
  const production = createEnvironment({
    NODE_ENV: 'production',
    JWT_SECRET: 'production-tests-only-random-secret-at-least-32-bytes',
    DATABASE_PASSWORD: 'test-only-not-a-real-password',
    DATABASE_LOGGING: 'true',
    HTTP_LOGGING: 'true',
    APP_PUBLIC_URL: 'https://osteopilot.org',
    CORS_ORIGINS: 'https://osteopilot.org',
  });
  expect(production.httpLogging).toBe(false);
  expect(production.database.logging).toBe(false);
  expect(() => createEnvironment({ NODE_ENV: 'test', DATABASE_LOGGING: 'yes' })).toThrow();
});

test('HTTP : colonnes alignées et couleurs réservées aux terminaux compatibles', () => {
  const record = { method: 'GET', route: '/api/v1/health', status: 200, durationMs: 12.34 };
  const options = { time: new Date('2026-10-29T12:34:56Z') };
  const plain = formatHttpLog(record, options);
  const error = formatHttpLog({ ...record, method: 'DELETE', status: 500 }, options);
  expect(plain.indexOf('/api/')).toBe(error.indexOf('/api/'));
  expect(plain.indexOf('200')).toBe(error.indexOf('500'));
  expect(plain).toMatch(/12\.3 ms$/);
  expect(plain).not.toContain('\x1b');
  for (const [status, code] of [
    [200, 32],
    [302, 36],
    [401, 33],
    [500, 31],
  ]) {
    const colored = formatHttpLog({ ...record, status }, { ...options, color: true });
    expect(colored).toContain('\x1b[' + code + 'm' + status);
    expect(colored.replace(/\x1b\[\d+m/g, '')).toBe(formatHttpLog({ ...record, status }, options));
  }
  expect(supportsLogColor({ isTTY: true }, {})).toBe(true);
  expect(supportsLogColor({ isTTY: false }, {})).toBe(false);
  expect(supportsLogColor({ isTTY: true }, { NO_COLOR: '' })).toBe(false);
  expect(supportsLogColor({ isTTY: true }, { TERM: 'dumb' })).toBe(false);
});
