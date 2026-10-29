import request from 'supertest';
import { jest } from '@jest/globals';
import { createApp } from '../src/app.js';
import { createEnvironment } from '../src/config/env.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import jwt from 'jsonwebtoken';
import { version } from '../src/config/version.js';
const config = createEnvironment({ NODE_ENV: 'test' });
const auth = {
  authenticate: jest.fn(async () => {
    const e = new Error('Veuillez vous connecter.');
    e.status = 401;
    throw e;
  }),
  permit: jest.fn(),
  csrf: jest.fn(),
};
const app = createApp({
  config,
  services: { auth, patients: {}, administration: {}, payments: {} },
});
test('health minimal et en-têtes', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.data.version).toBe(version);
  expect(res.headers['x-powered-by']).toBeUndefined();
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers['x-content-type-options']).toBe('nosniff');
});
test.each(['/patients', '/users', '/roles', '/permissions', '/history', '/settings'])(
  'route %s protégée',
  async (path) => {
    expect((await request(app).get('/api/v1' + path)).status).toBe(401);
  },
);
test('login protège origine et champs inconnus avant service', async () => {
  expect((await request(app).post('/api/v1/auth/login').send({})).status).toBe(403);
  const response = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', config.publicUrl)
    .send({ email: 'test@example.invalid', password: 'test', admin: true });
  expect(response.status).toBe(422);
});
test('erreurs SQL et internes sans détails sensibles', async () => {
  const bad = {
    authenticate: async () => {
      throw new Error('password=secret SQL SELECT');
    },
  };
  const res = await request(
    createApp({ config, services: { auth: bad, patients: {}, administration: {}, payments: {} } }),
  ).get('/api/v1/users');
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toMatch(/password|SELECT|secret/);
});
test('JWT : algorithme, issuer, audience et expiration', () => {
  const service = new AuthService({}, config);
  for (const token of [
    jwt.sign({ sub: 'test', sid: 'session' }, config.secret, {
      algorithm: 'HS384',
      issuer: 'osteopilot',
      audience: 'osteopilot-web',
    }),
    jwt.sign({ sub: 'test', sid: 'session' }, config.secret, {
      algorithm: 'HS256',
      issuer: 'other',
      audience: 'osteopilot-web',
    }),
    jwt.sign({ sub: 'test', sid: 'session' }, config.secret, {
      algorithm: 'HS256',
      expiresIn: -1,
      issuer: 'osteopilot',
      audience: 'osteopilot-web',
    }),
  ])
    expect(() => service.claims(token)).toThrow();
});

test.each(['http://localhost:5174', 'http://127.0.0.1:5174', 'http://osteopilot.org:5174'])(
  'connexion autorisée pour une origine frontend explicite : %s',
  async (origin) => {
    const configured = createEnvironment({
      NODE_ENV: 'test',
      APP_PUBLIC_URL: 'http://osteopilot.org:5174',
      CORS_ORIGINS: 'http://localhost:5174,http://127.0.0.1:5174,http://osteopilot.org:5174',
    });
    const loginAuth = {
      login: jest.fn(async () => ({ user: { id: 'test' }, csrfToken: 'test', token: 'test' })),
      cookie: jest.fn(),
    };
    const server = createApp({
      config: configured,
      services: { auth: loginAuth, patients: {}, administration: {}, payments: {} },
    });
    const response = await request(server)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: 'test@example.invalid', password: 'test' });
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(loginAuth.login).toHaveBeenCalledTimes(1);
  },
);
test.each(['http://osteopilot.org.evil.invalid:5174', 'http://osteopilot.org:3008', 'null'])(
  'origine non autorisée toujours refusée : %s',
  async (origin) => {
    const configured = createEnvironment({
      NODE_ENV: 'test',
      CORS_ORIGINS: 'http://osteopilot.org:5174',
    });
    const loginAuth = { login: jest.fn(), cookie: jest.fn() };
    const server = createApp({
      config: configured,
      services: { auth: loginAuth, patients: {}, administration: {}, payments: {} },
    });
    const response = await request(server)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: 'test@example.invalid', password: 'test' });
    expect(response.status).toBe(403);
    expect(loginAuth.login).not.toHaveBeenCalled();
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  },
);
