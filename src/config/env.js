import 'dotenv/config';

export function createEnvironment(source = process.env, { databaseOnly = false } = {}) {
  const errors = [];
  const mode = source.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(mode)) errors.push('NODE_ENV invalide.');
  const production = mode === 'production';
  const integer = (key, fallback, max) => {
    const value = Number(source[key] || fallback);
    if (!Number.isInteger(value) || value < 1 || value > max) errors.push(key + ' invalide.');
    return value;
  };
  const boolean = (key, fallback) => {
    const value = source[key];
    if (value === undefined || value === '') return fallback;
    if (!['true', 'false'].includes(value)) errors.push(key + ' doit valoir true ou false.');
    return value === 'true';
  };
  const databaseLogging = boolean('DATABASE_LOGGING', false);
  const httpLogging = boolean('HTTP_LOGGING', true);
  const origin = (value) => {
    try {
      const url = new URL(value);
      if (
        url.origin !== value ||
        (production && url.protocol !== 'https:') ||
        !['http:', 'https:'].includes(url.protocol)
      )
        throw new Error();
      return value;
    } catch {
      errors.push('Origine HTTP(S) invalide.');
      return '';
    }
  };
  const publicUrl = origin(source.APP_PUBLIC_URL || 'http://localhost:5174');
  const corsOrigins = (source.CORS_ORIGINS || publicUrl).split(',').map((s) => origin(s.trim()));
  const secret =
    source.JWT_SECRET || (mode === 'test' ? 'isolated-tests-only-key-at-least-32-bytes' : '');
  if (!databaseOnly && (Buffer.byteLength(secret) < 32 || /replace|changeme/i.test(secret))) {
    errors.push('JWT_SECRET doit contenir au moins 32 octets aléatoires.');
  }
  if (source.PUBLIC_REGISTRATION_ENABLED === 'true' || source.MAIL_ENABLED === 'true') {
    errors.push('Inscription publique et emails non disponibles : conserver false.');
  }
  const trusted = source.TRUSTED_PROXIES || 'false';
  if (['true', '*', 'all'].includes(trusted))
    errors.push('Lister explicitement les proxys fiables.');
  const name = source.DATABASE_NAME || 'osteopilot';
  if (mode !== 'test' && name !== 'osteopilot')
    errors.push('La base applicative doit être osteopilot.');
  if (mode === 'test' && !/^osteopilot_test_[a-f0-9]{16}$/.test(name) && databaseOnly) {
    errors.push('Base de test isolée obligatoire.');
  }
  if (databaseOnly && !source.DATABASE_USER)
    errors.push('DATABASE_USER manquant : configurer .env.');
  if (production && !source.DATABASE_PASSWORD)
    errors.push('DATABASE_PASSWORD obligatoire en production.');
  const config = {
    mode,
    production,
    secret,
    publicUrl,
    corsOrigins,
    port: integer('PORT', 3008, 65535),
    trustedProxies: trusted === 'false' ? false : trusted.split(',').map((s) => s.trim()),
    apiLimit: integer('RATE_LIMIT_API_MAX', 500, 10000),
    httpLogging: mode === 'development' && httpLogging,
    loginLimit: integer('RATE_LIMIT_LOGIN_MAX', 10, 100),
    database: {
      host: source.DATABASE_HOST || '127.0.0.1',
      port: integer('DATABASE_PORT', 3306, 65535),
      name,
      logging: mode === 'development' && databaseLogging,
      user: source.DATABASE_USER || '',
      password: source.DATABASE_PASSWORD || '',
    },
  };
  if (config.port !== 3008) errors.push('PORT doit valoir 3008.');
  if (errors.length) throw new Error(errors.join('\n'));
  return config;
}
