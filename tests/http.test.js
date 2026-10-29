import request from 'supertest';
import { jest } from '@jest/globals';
import { createApp } from '../src/app.js';
import { createEnvironment } from '../src/config/env.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import jwt from 'jsonwebtoken';
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
const app = createApp({ config, services: { auth, patients: {}, administration: {} } });
test('health minimal et en-têtes', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.data.version).toBe('0.1.0');
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
    createApp({ config, services: { auth: bad, patients: {}, administration: {} } }),
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
