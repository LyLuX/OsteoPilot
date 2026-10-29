import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import request from 'supertest';
import { createEnvironment } from '../../src/config/env.js';
import { createDatabase } from '../../src/core/database/database.js';
import { checkSchema, migrate } from '../../src/core/database/migrations.js';
import { withTransaction } from '../../src/core/database/transaction.js';
import { createApp } from '../../src/app.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { PatientService } from '../../src/modules/patients/patient.service.js';
import { AdministrationService } from '../../src/modules/administration/administration.service.js';
import { permissions } from '../../src/modules/permissions/permissions.js';
const safeName = process.env.DATABASE_NAME;
if (
  !/^osteopilot_test_[a-f0-9]{16}$/.test(safeName) ||
  process.env.TEST_DATABASE_ISOLATED !== safeName
)
  throw new Error('Tests refusés : isolation non garantie.');
const config = createEnvironment();
const db = createDatabase(config);
const auth = new AuthService(db, config);
const patients = new PatientService(db, auth);
const administration = new AdministrationService(db, auth);
const app = createApp({ db, config });
let admin;
let session;
const input = (suffix = randomUUID()) => ({
  firstName: 'Fictif',
  lastName: 'Test ' + suffix,
  email: '',
  phone: '',
  address: '',
});
const csv = (suffix = randomUUID()) =>
  'lastName,firstName,phone,email,address\n"Test ' + suffix + '",Fictif,,,\n';
beforeAll(async () => {
  await checkSchema(db);
  await promisify(execFile)(process.execPath, ['scripts/create-admin.js'], {
    env: {
      ...process.env,
      ADMIN_EMAIL: 'admin@example.invalid',
      ADMIN_FIRST_NAME: 'Admin',
      ADMIN_LAST_NAME: 'Fictif',
      ADMIN_PASSWORD: 'Phrase de test uniquement 123!',
    },
  });
  admin = await db.models.Users.findOne({ where: { email: 'admin@example.invalid' } });
  session = await auth.login('admin@example.invalid', 'Phrase de test uniquement 123!');
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => db.sequelize.close());
const snapshot = async () =>
  Object.fromEntries(
    await Promise.all(
      ['Patients', 'AuditLogs', 'IdempotencyKeys', 'Sessions'].map(async (table) => [
        table,
        await db.models[table].count(),
      ]),
    ),
  );
test('migration répétable et schéma contraint InnoDB', async () => {
  const count = await db.models.Users.count();
  await migrate(db);
  await checkSchema(db);
  expect(await db.models.Users.count()).toBe(count);
  expect(await db.models.Permissions.count()).toBe(permissions.length);
});
test('création et modification patients : données minimales, conflit de version et unicité', async () => {
  const values = input();
  const row = await patients.create(session.token, session.csrfToken, values, randomUUID());
  expect(row.duplicateKey).toBeUndefined();
  const updated = await patients.update(session.token, session.csrfToken, row.id, {
    ...values,
    address: 'Adresse fictive',
    version: 1,
  });
  expect(updated.version).toBe(2);
  await expect(
    patients.update(session.token, session.csrfToken, row.id, { ...values, version: 1 }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    patients.create(session.token, session.csrfToken, values, randomUUID()),
  ).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
});
test.each(['before', 'after'])(
  'panne %s audit : rollback métier, audit et idempotence',
  async (position) => {
    const before = await snapshot();
    const original = db.models.AuditLogs.create.bind(db.models.AuditLogs);
    jest.spyOn(db.models.AuditLogs, 'create').mockImplementation(async (values, options) => {
      expect(options.transaction).toBeTruthy();
      expect(await db.models.Patients.count({ transaction: options.transaction })).toBe(
        before.Patients + 1,
      );
      if (position === 'after') await original(values, options);
      throw new Error('Panne audit simulée');
    });
    await expect(
      patients.create(session.token, session.csrfToken, input(), randomUUID()),
    ).rejects.toThrow('Panne audit');
    expect(await snapshot()).toEqual(before);
  },
);
test('appels concurrents même clé : un seul effet et rejeu identique', async () => {
  const before = await db.models.Patients.count();
  const values = input();
  const key = randomUUID();
  const [a, b] = await Promise.all([
    patients.create(session.token, session.csrfToken, values, key),
    patients.create(session.token, session.csrfToken, values, key),
  ]);
  expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
  expect(await db.models.Patients.count()).toBe(before + 1);
  await expect(
    patients.create(session.token, session.csrfToken, input(), key),
  ).rejects.toMatchObject({ status: 409 });
});
test('deux mises à jour concurrentes : une seule version acceptée', async () => {
  const values = input();
  const row = await patients.create(session.token, session.csrfToken, values, randomUUID());
  const results = await Promise.allSettled(
    [1, 2].map((n) =>
      patients.update(session.token, session.csrfToken, row.id, {
        ...values,
        address: 'Adresse fictive ' + n,
        version: 1,
      }),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((r) => r.status === 'rejected').reason.status).toBe(409);
});
test('import : validation puis tout ou rien, doublons et rejeu', async () => {
  const source = csv();
  const preview = await patients.preview(source);
  expect(preview.valid).toBe(true);
  const key = randomUUID();
  const result = await patients.import(
    session.token,
    session.csrfToken,
    source,
    preview.fingerprint,
    key,
  );
  expect(result.imported).toBe(1);
  expect(
    await patients.import(session.token, session.csrfToken, source, preview.fingerprint, key),
  ).toEqual(result);
  expect((await patients.preview(source)).valid).toBe(false);
  await expect(
    patients.import(session.token, session.csrfToken, source, preview.fingerprint, randomUUID()),
  ).rejects.toMatchObject({ status: 422 });
});
test('échec audit import après plusieurs créations : toutes les lignes annulées', async () => {
  const source = csv() + '"Autre ' + randomUUID() + '",Fictif,,,\n';
  const preview = await patients.preview(source);
  const before = await snapshot();
  jest.spyOn(db.models.AuditLogs, 'create').mockRejectedValue(new Error('Audit indisponible'));
  await expect(
    patients.import(session.token, session.csrfToken, source, preview.fingerprint, randomUUID()),
  ).rejects.toThrow();
  expect(await snapshot()).toEqual(before);
});
test('export audité sans données personnelles dans le journal', async () => {
  const result = await patients.export(session.token, session.csrfToken);
  expect(result).toContain('lastName,firstName,phone,email,address');
  const audit = await db.models.AuditLogs.findOne({ where: { action: 'patients.export' } });
  expect(Object.keys(audit.toJSON()).sort()).toEqual(
    ['action', 'actorId', 'count', 'createdAt', 'entity', 'entityId', 'id', 'updatedAt'].sort(),
  );
  expect(JSON.stringify(audit)).not.toContain('Fictif');
});
async function restrictedUser(names = ['patients.read']) {
  const role = await administration.saveRole(session.token, session.csrfToken, null, {
    name: 'TEST-' + randomUUID(),
  });
  const perms = await db.models.Permissions.findAll({ where: { name: names } });
  await administration.setPermissions(session.token, session.csrfToken, role.id, {
    permissionIds: perms.map((p) => p.id),
  });
  const email = randomUUID() + '@example.invalid';
  const user = await administration.saveUser(session.token, session.csrfToken, null, {
    firstName: 'Compte',
    lastName: 'Fictif',
    email,
    password: 'Phrase de test uniquement 123!',
    active: true,
    roleIds: [role.id],
  });
  return { user, role, session: await auth.login(email, 'Phrase de test uniquement 123!') };
}
test('export sans permission : HTTP 403, sans mutation ni audit', async () => {
  const restricted = await restrictedUser();
  const before = await snapshot();
  const response = await request(app)
    .post('/api/v1/patients/export')
    .set('Origin', config.publicUrl)
    .set('Cookie', 'osteopilot.access=' + restricted.session.token)
    .set('X-CSRF-Token', restricted.session.csrfToken)
    .send({});
  expect(response.status).toBe(403);
  expect(await snapshot()).toEqual(before);
});
test('droits retirés immédiatement, rôle système et auto-élévation protégés', async () => {
  const restricted = await restrictedUser(['patients.read', 'permissions.update', 'roles.read']);
  await expect(
    administration.setPermissions(
      restricted.session.token,
      restricted.session.csrfToken,
      restricted.role.id,
      { permissionIds: [] },
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    administration.saveUser(session.token, session.csrfToken, admin.id, {
      firstName: 'Admin',
      lastName: 'Fictif',
      email: admin.email,
      active: false,
      roleIds: [restricted.role.id],
    }),
  ).rejects.toMatchObject({ status: 403 });
  await administration.setPermissions(session.token, session.csrfToken, restricted.role.id, {
    permissionIds: [],
  });
  const ctx = await auth.authenticate(restricted.session.token);
  expect(() => auth.permit(ctx, 'patients.read')).toThrow();
});
test('désactivation utilisateur révoque toutes ses sessions', async () => {
  const restricted = await restrictedUser();
  await administration.saveUser(session.token, session.csrfToken, restricted.user.id, {
    firstName: 'Compte',
    lastName: 'Fictif',
    email: restricted.user.email,
    active: false,
    roleIds: [restricted.role.id],
  });
  await expect(auth.authenticate(restricted.session.token)).rejects.toMatchObject({ status: 401 });
});
test('JWT cookie HttpOnly, CSRF et origine imposés', async () => {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', config.publicUrl)
    .send({ email: admin.email, password: 'Phrase de test uniquement 123!' });
  expect(response.status).toBe(200);
  expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
  expect(response.headers['set-cookie'][0]).toContain('SameSite=Strict');
  expect(response.body.data.token).toBeUndefined();
  const denied = await request(app)
    .post('/api/v1/patients')
    .set('Origin', config.publicUrl)
    .set('Cookie', 'osteopilot.access=' + session.token)
    .send(input());
  expect(denied.status).toBe(403);
  expect(
    (
      await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'https://hostile.invalid')
        .send({ email: admin.email, password: 'anything' })
    ).status,
  ).toBe(403);
});
test('rotation : ancien JWT refusé, logout révoqué', async () => {
  const s = await auth.login(admin.email, 'Phrase de test uniquement 123!');
  const refreshed = await auth.refresh(s.token, s.csrfToken);
  await expect(auth.authenticate(s.token)).rejects.toMatchObject({ status: 401 });
  expect((await auth.authenticate(refreshed.token)).publicUser.email).toBe(admin.email);
  await auth.logout(refreshed.token, s.csrfToken);
  await expect(auth.authenticate(refreshed.token)).rejects.toMatchObject({ status: 401 });
});
test('inactivité serveur contrôlée indépendamment du navigateur', async () => {
  const s = await auth.login(admin.email, 'Phrase de test uniquement 123!');
  const ctx = await auth.authenticate(s.token);
  await withTransaction(db, (transaction) =>
    ctx.session.update({ lastActivityAt: new Date(Date.now() - 16 * 60000) }, { transaction }),
  );
  await expect(auth.authenticate(s.token)).rejects.toMatchObject({ status: 401 });
});
test('base non vide sans historique reconnu : reprise automatique refusée', async () => {
  // Aucune DDL : le garde est testé en simulant uniquement le diagnostic.
  const original = db.sequelize.query.bind(db.sequelize);
  jest.spyOn(db.sequelize, 'query').mockImplementation((sql, options) => {
    if (sql === 'SELECT name FROM SequelizeMeta ORDER BY name')
      return Promise.resolve([[{ name: 'historique-inconnu' }], {}]);
    return original(sql, options);
  });
  await expect(migrate(db)).rejects.toMatchObject({ status: 409 });
});

test('bootstrap CLI idempotent sans changement de mot de passe', async () => {
  const before = await db.models.Users.findByPk(admin.id);
  const count = await db.models.AuditLogs.count();
  await promisify(execFile)(process.execPath, ['scripts/create-admin.js'], {
    env: {
      ...process.env,
      ADMIN_EMAIL: 'admin@example.invalid',
      ADMIN_FIRST_NAME: 'Admin',
      ADMIN_LAST_NAME: 'Fictif',
      ADMIN_PASSWORD: 'Autre phrase de test non retenue 456!',
    },
  });
  expect((await db.models.Users.findByPk(admin.id)).passwordHash).toBe(before.passwordHash);
  expect(await db.models.AuditLogs.count()).toBe(count);
});
test('parcours HTTP patient et restauration du CSRF après rechargement', async () => {
  const cookie = 'osteopilot.access=' + session.token;
  const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
  expect(me.status).toBe(200);
  expect(me.body.data.csrfToken).toBe(session.csrfToken);
  const created = await request(app)
    .post('/api/v1/patients')
    .set('Origin', config.publicUrl)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', session.csrfToken)
    .set('Idempotency-Key', randomUUID())
    .send(input());
  expect(created.status).toBe(201);
  expect(created.body.data).not.toHaveProperty('duplicateKey');
  const id = created.body.data.id;
  const list = await request(app)
    .get('/api/v1/patients')
    .query({ search: created.body.data.lastName, limit: 5 })
    .set('Cookie', cookie);
  expect(list.status).toBe(200);
  expect(list.body.data.items.some((p) => p.id === id)).toBe(true);
  const invalid = await request(app)
    .get('/api/v1/patients')
    .query({ sort: 'passwordHash' })
    .set('Cookie', cookie);
  expect(invalid.status).toBe(422);
  const archived = await request(app)
    .post('/api/v1/patients/' + id + '/archive')
    .set('Origin', config.publicUrl)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ version: 1 });
  expect(archived.status).toBe(200);
  expect(archived.body.data.archived).toBe(true);
});
test('écriture Sequelize sans transaction explicitement refusée', async () => {
  await expect(db.models.Roles.create({ name: 'HORS-TRANSACTION' })).rejects.toThrow(
    'Transaction explicite',
  );
});
