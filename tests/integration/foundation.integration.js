import { up as initialUp } from '../../migrations/202610290001-initial.js';
import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import request from 'supertest';
import { createEnvironment } from '../../src/config/env.js';
import { createDatabase } from '../../src/core/database/database.js';
import {
  checkSchema,
  migrate,
  inspectDatabase,
  undoMigration,
} from '../../src/core/database/migrations.js';
import { withTransaction } from '../../src/core/database/transaction.js';
import { createApp } from '../../src/app.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { PatientService } from '../../src/modules/patients/patient.service.js';
import { PaymentService } from '../../src/modules/payments/payment.service.js';
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
const payments = new PaymentService(db, auth);
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
      ['Patients', 'Payments', 'AuditLogs', 'IdempotencyKeys', 'Sessions'].map(async (table) => [
        table,
        await db.models[table].count(),
      ]),
    ),
  );
test('migration des règlements depuis le schéma initial : informations du cabinet préservées', async () => {
  // Le garde du fichier et le runner réservent ces DDL à la base éphémère.
  const qi = db.sequelize.getQueryInterface();
  const before = await administration.settings();
  await qi.removeColumn('Settings', 'paymentMethods');
  await db.sequelize.transaction((transaction) =>
    qi.bulkDelete(
      'SequelizeMeta',
      {
        name: [
          '202610290002-settings-payment-methods.js',
          '202610290003-payments.js',
          '202610290004-payment-bank-deposits.js',
          '202610310005-calendar-default-view.js',
        ],
      },
      { transaction },
    ),
  );
  await expect(checkSchema(db)).rejects.toMatchObject({ status: 409 });
  await migrate(db);
  await checkSchema(db);
  expect(await administration.settings()).toEqual({ ...before, paymentMethods: [] });
  await migrate(db);
  expect(await administration.settings()).toEqual({ ...before, paymentMethods: [] });
});

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

test('statut patient HTTP : désactivation, réactivation, filtres, audit minimal et version dépassée', async () => {
  const row = await patients.create(session.token, session.csrfToken, input(), randomUUID());
  const change = (values) =>
    request(app)
      .patch('/api/v1/patients/' + row.id + '/status')
      .set('Origin', config.publicUrl)
      .set('Cookie', 'osteopilot.access=' + session.token)
      .set('X-CSRF-Token', session.csrfToken)
      .send(values);
  const disabled = await change({ active: false, version: row.version });
  expect(disabled.status).toBe(200);
  expect(disabled.body.data).toMatchObject({ archived: true, version: 2 });
  expect(
    (await patients.list({ archived: 'true', search: row.lastName })).items.map((p) => p.id),
  ).toContain(row.id);
  expect((await patients.list({ archived: 'false', search: row.lastName })).items).toHaveLength(0);
  const before = await db.models.AuditLogs.count();
  expect((await change({ active: true, version: 1 })).status).toBe(409);
  expect(await db.models.AuditLogs.count()).toBe(before);
  const enabled = await change({ active: true, version: 2 });
  expect(enabled.status).toBe(200);
  expect(enabled.body.data).toMatchObject({ archived: false, version: 3 });
  expect(enabled.body.data).not.toHaveProperty('duplicateKey');
  expect(
    (await patients.list({ archived: 'false', search: row.lastName })).items.map((p) => p.id),
  ).toContain(row.id);
  const audits = await db.models.AuditLogs.findAll({
    where: { entityId: row.id },
    order: [['createdAt', 'ASC']],
  });
  expect(audits.map((a) => a.action).sort()).toEqual([
    'patients.activate',
    'patients.archive',
    'patients.create',
  ]);
  expect(JSON.stringify(audits)).not.toContain(row.lastName);
});

test('statut patient : validation stricte, CSRF, permission HTTP et service', async () => {
  const row = await patients.create(session.token, session.csrfToken, input(), randomUUID());
  const send = (values, s = session, csrf = s.csrfToken) =>
    request(app)
      .patch('/api/v1/patients/' + row.id + '/status')
      .set('Origin', config.publicUrl)
      .set('Cookie', 'osteopilot.access=' + s.token)
      .set('X-CSRF-Token', csrf)
      .send(values);
  const before = await db.models.AuditLogs.count();
  for (const invalid of [
    { version: 1 },
    { active: 'false', version: 1 },
    { active: false, version: 0 },
    { active: false, version: 1, firstName: 'Interdit' },
  ]) {
    expect((await send(invalid)).status).toBe(422);
    await expect(
      patients.setActive(session.token, session.csrfToken, row.id, invalid),
    ).rejects.toMatchObject({ status: 422 });
  }
  expect((await send({ active: false, version: 1 }, session, 'invalid')).status).toBe(403);
  expect(await db.models.AuditLogs.count()).toBe(before);
  const restricted = await restrictedUser();
  const count = await db.models.AuditLogs.count();
  expect((await send({ active: false, version: 1 }, restricted.session)).status).toBe(403);
  await expect(
    patients.setActive(restricted.session.token, restricted.session.csrfToken, row.id, {
      active: false,
      version: 1,
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect(await db.models.AuditLogs.count()).toBe(count);
  expect((await patients.get(row.id)).archived).toBe(false);
  await expect(
    patients.setActive(session.token, session.csrfToken, randomUUID(), {
      active: true,
      version: 1,
    }),
  ).rejects.toMatchObject({ status: 404 });
});

test.each([false, true])(
  'statut active=%s : panne audit annule statut et version',
  async (active) => {
    const row = await patients.create(session.token, session.csrfToken, input(), randomUUID());
    if (active)
      await patients.setActive(session.token, session.csrfToken, row.id, {
        active: false,
        version: 1,
      });
    const before = await patients.get(row.id);
    const count = await db.models.AuditLogs.count();
    const original = db.models.AuditLogs.create.bind(db.models.AuditLogs);
    jest.spyOn(db.models.AuditLogs, 'create').mockImplementation(async (values, options) => {
      expect(options.transaction).toBeTruthy();
      const changed = await db.models.Patients.findByPk(row.id, {
        transaction: options.transaction,
      });
      expect(changed.archived).toBe(!active);
      await original(values, options);
      throw new Error('Panne audit statut');
    });
    await expect(
      patients.setActive(session.token, session.csrfToken, row.id, {
        active,
        version: before.version,
      }),
    ).rejects.toThrow('Panne audit statut');
    expect(await patients.get(row.id)).toEqual(before);
    expect(await db.models.AuditLogs.count()).toBe(count);
  },
);

const settingsValues = (settings) =>
  Object.fromEntries(
    ['name', 'address', 'phone', 'email', 'timezone'].map((field) => [field, settings[field]]),
  );
test('règlements HTTP : changement isolé, relecture et informations générales indépendantes', async () => {
  const before = await administration.settings();
  const patch = (method, accepted) =>
    request(app)
      .patch('/api/v1/settings/payment-methods')
      .set('Origin', config.publicUrl)
      .set('Cookie', 'osteopilot.access=' + session.token)
      .set('X-CSRF-Token', session.csrfToken)
      .send({ method, accepted });
  const count = await db.models.AuditLogs.count();
  const saved = await patch('cash', true);
  expect(saved.status).toBe(200);
  expect(saved.body.data).toEqual({ paymentMethods: ['cash'] });
  expect((await patch('transfer', true)).status).toBe(200);
  const after = await administration.settings();
  expect(settingsValues(after)).toEqual(settingsValues(before));
  const read = await request(app)
    .get('/api/v1/settings')
    .set('Cookie', 'osteopilot.access=' + session.token);
  expect(read.body.data.paymentMethods).toEqual(['cash', 'transfer']);
  expect(await db.models.AuditLogs.count()).toBe(count + 2);
  await administration.saveSettings(session.token, session.csrfToken, {
    ...settingsValues(before),
    name: 'Cabinet modifié',
  });
  expect((await administration.settings()).paymentMethods).toEqual(['cash', 'transfer']);
  await expect(
    administration.saveSettings(session.token, session.csrfToken, {
      ...settingsValues(before),
      paymentMethods: [],
    }),
  ).rejects.toMatchObject({ status: 422 });
  await migrate(db);
  expect((await administration.settings()).paymentMethods).toEqual(['cash', 'transfer']);
  await patch('cash', false);
  await patch('transfer', false);
  expect((await administration.settings()).paymentMethods).toEqual([]);
  const audit = await db.models.AuditLogs.findOne({
    where: { action: 'settings.payment-methods.update', entityId: before.id },
  });
  expect(audit).toBeTruthy();
  expect(JSON.stringify(audit)).not.toMatch(/paymentMethods|cash|transfer/);
});

test('règlements : validation stricte, CSRF et droits HTTP comme service', async () => {
  const before = await administration.settings();
  const count = await db.models.AuditLogs.count();
  const send = (values, s = session, csrf = s.csrfToken) =>
    request(app)
      .patch('/api/v1/settings/payment-methods')
      .set('Origin', config.publicUrl)
      .set('Cookie', 'osteopilot.access=' + s.token)
      .set('X-CSRF-Token', csrf)
      .send(values);
  for (const invalid of [
    { method: 'bitcoin', accepted: true },
    { method: 'cash', accepted: 'true' },
    { accepted: true },
    { method: 'card', accepted: true, name: 'Interdit' },
  ]) {
    await expect(
      administration.changePaymentMethod(session.token, session.csrfToken, invalid),
    ).rejects.toMatchObject({ status: 422 });
    expect((await send(invalid)).status).toBe(422);
  }
  expect((await send({ method: 'cash', accepted: true }, session, 'invalid')).status).toBe(403);
  expect(await db.models.AuditLogs.count()).toBe(count);
  const restricted = await restrictedUser(['settings.read']);
  const baseline = await db.models.AuditLogs.count();
  await expect(
    administration.changePaymentMethod(restricted.session.token, restricted.session.csrfToken, {
      method: 'card',
      accepted: true,
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect((await send({ method: 'card', accepted: true }, restricted.session)).status).toBe(403);
  expect(await administration.settings()).toEqual(before);
  expect(await db.models.AuditLogs.count()).toBe(baseline);
});

test('règlements : deux cases modifiées simultanément sont conservées ensemble', async () => {
  for (const method of ['cash', 'card'])
    await administration.changePaymentMethod(session.token, session.csrfToken, {
      method,
      accepted: false,
    });
  await Promise.all(
    ['cash', 'card'].map((method) =>
      administration.changePaymentMethod(session.token, session.csrfToken, {
        method,
        accepted: true,
      }),
    ),
  );
  expect((await administration.settings()).paymentMethods).toEqual(
    expect.arrayContaining(['cash', 'card']),
  );
});

test('règlements : panne audit après écriture annule aussi la sélection', async () => {
  const before = await administration.settings();
  const count = await db.models.AuditLogs.count();
  const accepted = !before.paymentMethods.includes('cheque');
  const original = db.models.AuditLogs.create.bind(db.models.AuditLogs);
  jest.spyOn(db.models.AuditLogs, 'create').mockImplementation(async (values, options) => {
    const row = await db.models.Settings.findOne({ transaction: options.transaction });
    expect(row.paymentMethods.includes('cheque')).toBe(accepted);
    await original(values, options);
    throw new Error('Panne audit règlements');
  });
  await expect(
    administration.changePaymentMethod(session.token, session.csrfToken, {
      method: 'cheque',
      accepted,
    }),
  ).rejects.toThrow('Panne audit règlements');
  expect(await administration.settings()).toEqual(before);
  expect(await db.models.AuditLogs.count()).toBe(count);
});

const paymentValues = (patientId, overrides = {}) => ({
  patientId,
  date: '2026-10-29',
  method: 'cash',
  amountCents: 1050,
  ...overrides,
});
async function paymentPatient() {
  return patients.create(session.token, session.csrfToken, input(), randomUUID());
}
async function acceptMethod(method, accepted = true) {
  return administration.changePaymentMethod(session.token, session.csrfToken, { method, accepted });
}

test('paiements HTTP : création liée au patient, totaux exacts par type et liste paginée', async () => {
  await acceptMethod('cash');
  await acceptMethod('card');
  const patient = await paymentPatient();
  const cookie = 'osteopilot.access=' + session.token;
  const response = await request(app)
    .post('/api/v1/payments')
    .set('Origin', config.publicUrl)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', session.csrfToken)
    .set('Idempotency-Key', randomUUID())
    .send(paymentValues(patient.id));
  expect(response.status).toBe(201);
  expect(response.body.data).toMatchObject({
    patientId: patient.id,
    amountCents: 1050,
    date: '2026-10-29',
  });
  expect(response.body.data).not.toHaveProperty('createdBy');
  await payments.create(
    session.token,
    session.csrfToken,
    paymentValues(patient.id, { method: 'card', amountCents: 2051 }),
    randomUUID(),
  );
  const summary = await request(app)
    .get('/api/v1/payments/summary')
    .set('Cookie', cookie)
    .query({ from: '2026-10-29', to: '2026-10-29' });
  expect(summary.status).toBe(200);
  expect(summary.body.data.days).toEqual([
    {
      date: '2026-10-29',
      methods: { cash: 1050, card: 2051, cheque: 0, transfer: 0 },
      totalCents: 3101,
    },
  ]);
  const list = await request(app)
    .get('/api/v1/payments')
    .set('Cookie', cookie)
    .query({ date: '2026-10-29', limit: 1 });
  expect(list.body.data.items).toHaveLength(1);
  expect(list.body.data.pagination.total).toBe(2);
  expect(list.body.data.items[0].patient).toEqual({
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
  });
  expect(list.body.data.items[0].patient).not.toHaveProperty('email');
  const empty = await payments.summary({ from: '2026-10-28', to: '2026-10-28' });
  expect(empty.days).toEqual([]);
});

test('paiement : concurrence et rejeu même clé ne créent ni doublon ni audit supplémentaire', async () => {
  await acceptMethod('cash');
  const patient = await paymentPatient();
  const values = paymentValues(patient.id, { date: '2026-10-30', amountCents: 1 });
  const key = randomUUID();
  const count = await db.models.Payments.count();
  const audit = await db.models.AuditLogs.count({ where: { action: 'payments.create' } });
  const [first, second] = await Promise.all([
    payments.create(session.token, session.csrfToken, values, key),
    payments.create(session.token, session.csrfToken, values, key),
  ]);
  expect(first.id).toBe(second.id);
  expect(await db.models.Payments.count()).toBe(count + 1);
  expect(await db.models.AuditLogs.count({ where: { action: 'payments.create' } })).toBe(audit + 1);
  await expect(
    payments.create(session.token, session.csrfToken, { ...values, amountCents: 2 }, key),
  ).rejects.toMatchObject({ status: 409 });
  await acceptMethod('cash', false);
  expect((await payments.create(session.token, session.csrfToken, values, key)).id).toBe(first.id);
  await expect(
    payments.create(session.token, session.csrfToken, values, randomUUID()),
  ).rejects.toMatchObject({ status: 422 });
  expect((await payments.summary({ from: values.date, to: values.date })).days[0].totalCents).toBe(
    1,
  );
  await acceptMethod('cash');
});

test('paiements : refus des montants invalides, patient inactif, moyen non accepté et CSRF', async () => {
  await acceptMethod('cash');
  await acceptMethod('transfer', false);
  const patient = await paymentPatient();
  const values = paymentValues(patient.id);
  const before = await snapshot();
  for (const invalid of [
    { ...values, amountCents: 0 },
    { ...values, amountCents: -1 },
    { ...values, amountCents: 1.5 },
    { ...values, amountCents: 100000000 },
    { ...values, date: '2026-02-30' },
    { ...values, method: 'bitcoin' },
    { ...values, method: 'transfer' },
    { ...values, patientId: randomUUID() },
    { ...values, note: 'interdit' },
  ]) {
    await expect(
      payments.create(session.token, session.csrfToken, invalid, randomUUID()),
    ).rejects.toMatchObject({ status: 422 });
  }
  await expect(payments.create(session.token, session.csrfToken, values, '')).rejects.toMatchObject(
    { status: 422 },
  );
  expect(await snapshot()).toEqual(before);
  const denied = await request(app)
    .post('/api/v1/payments')
    .set('Origin', config.publicUrl)
    .set('Cookie', 'osteopilot.access=' + session.token)
    .set('X-CSRF-Token', 'invalid')
    .set('Idempotency-Key', randomUUID())
    .send(values);
  expect(denied.status).toBe(403);
  await patients.setActive(session.token, session.csrfToken, patient.id, {
    active: false,
    version: 1,
  });
  await expect(
    payments.create(session.token, session.csrfToken, values, randomUUID()),
  ).rejects.toMatchObject({ status: 422 });
  await expect(payments.summary({ from: '2026-01-01', to: '2027-01-02' })).rejects.toMatchObject({
    status: 422,
  });
  await expect(payments.list({ date: values.date, limit: 101 })).rejects.toMatchObject({
    status: 422,
  });
});

test('paiement : panne audit après insertion annule paiement et clé idempotente', async () => {
  const patient = await paymentPatient();
  await acceptMethod('cash');
  const before = await snapshot();
  const original = db.models.AuditLogs.create.bind(db.models.AuditLogs);
  jest.spyOn(db.models.AuditLogs, 'create').mockImplementation(async (values, options) => {
    expect(await db.models.Payments.count({ transaction: options.transaction })).toBe(
      before.Payments + 1,
    );
    expect(await db.models.IdempotencyKeys.count({ transaction: options.transaction })).toBe(
      before.IdempotencyKeys + 1,
    );
    await original(values, options);
    throw new Error('Panne audit paiement');
  });
  await expect(
    payments.create(session.token, session.csrfToken, paymentValues(patient.id), randomUUID()),
  ).rejects.toThrow('Panne audit paiement');
  expect(await snapshot()).toEqual(before);
});

test('droits paiements : accès HTTP et service refusés, recherche patient minimale pour la saisie', async () => {
  const denied = await restrictedUser(['dashboard.read']);
  const cookie = 'osteopilot.access=' + denied.session.token;
  expect(
    (await request(app).get('/api/v1/payments').query({ date: '2026-10-29' }).set('Cookie', cookie))
      .status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .get('/api/v1/payments/summary')
        .query({ from: '2026-10-01', to: '2026-10-31' })
        .set('Cookie', cookie)
    ).status,
  ).toBe(403);
  const patient = await paymentPatient();
  await expect(
    payments.create(
      denied.session.token,
      denied.session.csrfToken,
      paymentValues(patient.id),
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 403 });
  const response = await request(app)
    .post('/api/v1/payments')
    .set('Origin', config.publicUrl)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', denied.session.csrfToken)
    .set('Idempotency-Key', randomUUID())
    .send(paymentValues(patient.id));
  expect(response.status).toBe(403);
  const writer = await restrictedUser(['dashboard.read', 'payments.create']);
  const lookup = await request(app)
    .get('/api/v1/payments/patients')
    .set('Cookie', 'osteopilot.access=' + writer.session.token)
    .query({ search: patient.lastName, limit: 5 });
  expect(lookup.status).toBe(200);
  expect(lookup.body.data.items).toEqual([
    { id: patient.id, firstName: patient.firstName, lastName: patient.lastName },
  ]);
});

test('paiements : périodes inclusives, tri civil, pagination et totaux annuels historiques', async () => {
  await acceptMethod('cash');
  const patient = await paymentPatient();
  for (const [date, amountCents] of [
    ['2024-01-01', 101],
    ['2024-02-29', 202],
    ['2024-12-31', 303],
    ['2025-01-01', 404],
  ]) {
    await payments.create(
      session.token,
      session.csrfToken,
      paymentValues(patient.id, { date, amountCents }),
      randomUUID(),
    );
  }
  await acceptMethod('cash', false);
  const cookie = 'osteopilot.access=' + session.token;
  const range = { from: '2024-01-01', to: '2024-12-31' };
  const first = await request(app)
    .get('/api/v1/payments')
    .set('Cookie', cookie)
    .query({ ...range, limit: 2 });
  expect(first.status).toBe(200);
  expect(first.body.data.pagination).toMatchObject({ total: 3, totalPages: 2 });
  expect(first.body.data.items.map((p) => p.date)).toEqual(['2024-12-31', '2024-02-29']);
  const second = await payments.list({ ...range, limit: 2, page: 2 });
  expect(second.items.map((p) => p.date)).toEqual(['2024-01-01']);
  const annual = await request(app)
    .get('/api/v1/payments/summary')
    .set('Cookie', cookie)
    .query(range);
  expect(annual.status).toBe(200);
  expect(annual.body.data.acceptedMethods).not.toContain('cash');
  expect(annual.body.data.days.reduce((total, d) => total + d.totalCents, 0)).toBe(606);
  for (const query of [
    { from: range.from },
    { ...range, date: '2024-02-29' },
    { ...range, to: '2025-01-01' },
    { from: range.to, to: range.from },
  ]) {
    const response = await request(app).get('/api/v1/payments').set('Cookie', cookie).query(query);
    expect(response.status).toBe(422);
  }
  await acceptMethod('cash');
});

test('dépôt banque : espèces et chèques, aller-retour audité, lecture et totaux inchangés', async () => {
  const patient = await paymentPatient();
  for (const method of ['cash', 'cheque']) {
    await acceptMethod(method);
    const row = await payments.create(
      session.token,
      session.csrfToken,
      paymentValues(patient.id, { method, date: '2025-06-15' }),
      randomUUID(),
    );
    expect(row).toMatchObject({ bankDeposited: false, version: 1 });
    const before = await payments.summary({ from: row.date, to: row.date });
    // Un ancien moyen désactivé reste gérable, sans dépendre du paramétrage actuel.
    await acceptMethod(method, false);
    const send = (body) =>
      request(app)
        .patch('/api/v1/payments/' + row.id + '/bank-deposit')
        .set('Origin', config.publicUrl)
        .set('Cookie', 'osteopilot.access=' + session.token)
        .set('X-CSRF-Token', session.csrfToken)
        .send(body);
    const mark = await send({ bankDeposited: true, version: 1 });
    expect(mark.status).toBe(200);
    expect(mark.body.data).toMatchObject({
      id: row.id,
      bankDeposited: true,
      version: 2,
      amountCents: row.amountCents,
      date: row.date,
    });
    const list = await payments.list({ date: row.date });
    expect(list.items.find((p) => p.id === row.id)).toMatchObject({
      bankDeposited: true,
      version: 2,
    });
    expect((await payments.summary({ from: row.date, to: row.date })).days).toEqual(before.days);
    expect((await send({ bankDeposited: false, version: 1 })).status).toBe(409);
    const count = await db.models.AuditLogs.count();
    expect((await send({ bankDeposited: true, version: 2 })).status).toBe(200);
    expect(await db.models.AuditLogs.count()).toBe(count);
    const unmark = await send({ bankDeposited: false, version: 2 });
    expect(unmark.body.data).toMatchObject({ bankDeposited: false, version: 3 });
    const audits = await db.models.AuditLogs.findAll({
      where: {
        entityId: row.id,
        action: ['payments.bank-deposit.mark', 'payments.bank-deposit.unmark'],
      },
    });
    expect(audits.map((a) => a.action).sort()).toEqual([
      'payments.bank-deposit.mark',
      'payments.bank-deposit.unmark',
    ]);
    expect(JSON.stringify(audits)).not.toMatch(/amountCents|bankDeposited|firstName|lastName/);
    await acceptMethod(method);
  }
});

test('dépôt banque : refus moyens inéligibles, version, permission, CSRF et UUID', async () => {
  const patient = await paymentPatient();
  for (const method of ['card', 'transfer']) {
    await acceptMethod(method);
    const row = await payments.create(
      session.token,
      session.csrfToken,
      paymentValues(patient.id, { method }),
      randomUUID(),
    );
    expect(row.bankDeposited).toBeNull();
    await expect(
      payments.setBankDeposit(session.token, session.csrfToken, row.id, {
        bankDeposited: true,
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 422 });
  }
  await acceptMethod('cash');
  const row = await payments.create(
    session.token,
    session.csrfToken,
    paymentValues(patient.id),
    randomUUID(),
  );
  const reader = await restrictedUser(['payments.read', 'payments.create']);
  const before = await snapshot();
  const send = (id, body, token = session.token, csrf = session.csrfToken) =>
    request(app)
      .patch('/api/v1/payments/' + id + '/bank-deposit')
      .set('Origin', config.publicUrl)
      .set('Cookie', 'osteopilot.access=' + token)
      .set('X-CSRF-Token', csrf)
      .send(body);
  expect(
    (
      await send(
        row.id,
        { bankDeposited: true, version: 1 },
        reader.session.token,
        reader.session.csrfToken,
      )
    ).status,
  ).toBe(403);
  await expect(
    payments.setBankDeposit(reader.session.token, reader.session.csrfToken, row.id, {
      bankDeposited: true,
      version: 1,
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    (await send(row.id, { bankDeposited: true, version: 1 }, session.token, 'invalid')).status,
  ).toBe(403);
  expect((await send('invalide', { bankDeposited: true, version: 1 })).status).toBe(422);
  expect((await send(randomUUID(), { bankDeposited: true, version: 1 })).status).toBe(404);
  for (const body of [
    { bankDeposited: 'true', version: 1 },
    { bankDeposited: true, version: 0 },
    { bankDeposited: true, version: 1, method: 'cash' },
  ])
    expect((await send(row.id, body)).status).toBe(422);
  expect(await snapshot()).toEqual(before);
  const stored = await db.models.Payments.findByPk(row.id);
  expect(stored.bankDeposited).toBe(false);
  expect(stored.version).toBe(1);
});

test('dépôt banque : concurrence et rollback atomique si l’audit échoue', async () => {
  await acceptMethod('cash');
  const patient = await paymentPatient();
  const row = await payments.create(
    session.token,
    session.csrfToken,
    paymentValues(patient.id),
    randomUUID(),
  );
  await patients.setActive(session.token, session.csrfToken, patient.id, {
    active: false,
    version: 1,
  });
  const results = await Promise.allSettled(
    [true, true].map((bankDeposited) =>
      payments.setBankDeposit(session.token, session.csrfToken, row.id, {
        bankDeposited,
        version: 1,
      }),
    ),
  );
  // La première écriture prend le verrou et avance la version ; l’autre ne l’écrase pas.
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  const rejected = results.filter((result) => result.status === 'rejected');
  expect(rejected).toHaveLength(1);
  expect(rejected[0].reason.status).toBe(409);
  const count = await db.models.AuditLogs.count();
  jest.spyOn(db.models.AuditLogs, 'create').mockRejectedValueOnce(new Error('Panne audit dépôt'));
  await expect(
    payments.setBankDeposit(session.token, session.csrfToken, row.id, {
      bankDeposited: false,
      version: 2,
    }),
  ).rejects.toThrow('Panne audit dépôt');
  const stored = await db.models.Payments.findByPk(row.id);
  expect(stored.bankDeposited).toBe(true);
  expect(stored.version).toBe(2);
  expect(await db.models.AuditLogs.count()).toBe(count);
});

test('migration du dépôt depuis des paiements existants : montants préservés et passage répété sans écrasement', async () => {
  // DDL autorisés uniquement par le garde et le runner de base éphémère.
  const qi = db.sequelize.getQueryInterface();
  const before = await db.models.Payments.findAll({
    attributes: ['id', 'date', 'method', 'amountCents'],
    order: [['id', 'ASC']],
    raw: true,
  });
  await qi.removeColumn('Payments', 'bankDeposited');
  await qi.removeColumn('Payments', 'version');
  await db.sequelize.transaction((transaction) =>
    qi.bulkDelete(
      'SequelizeMeta',
      { name: ['202610290004-payment-bank-deposits.js', '202610310005-calendar-default-view.js'] },
      { transaction },
    ),
  );
  await expect(checkSchema(db)).rejects.toMatchObject({ status: 409 });
  await migrate(db);
  await checkSchema(db);
  expect(
    await db.models.Payments.findAll({
      attributes: ['id', 'date', 'method', 'amountCents'],
      order: [['id', 'ASC']],
      raw: true,
    }),
  ).toEqual(before);
  expect(await db.models.Payments.count({ where: { bankDeposited: false, version: 1 } })).toBe(
    before.length,
  );
  const row = await db.models.Payments.findOne({ where: { method: 'cash' } });
  await payments.setBankDeposit(session.token, session.csrfToken, row.id, {
    bankDeposited: true,
    version: 1,
  });
  await migrate(db);
  await row.reload();
  expect(row.bankDeposited).toBe(true);
  expect(row.version).toBe(2);
});

test('vue initiale : mise à jour indépendante, lecture minimale du dashboard et audit sans données', async () => {
  const before = await administration.settings();
  const cookie = 'osteopilot.access=' + session.token;
  const save = (defaultCalendarView) =>
    request(app)
      .patch('/api/v1/settings/calendar')
      .set('Cookie', cookie)
      .set('Origin', config.publicUrl)
      .set('X-CSRF-Token', session.csrfToken)
      .send({ defaultCalendarView });
  for (const value of ['week', 'year', 'month']) {
    const response = await save(value);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ defaultCalendarView: value });
    const after = await administration.settings();
    expect({
      ...after,
      updatedAt: before.updatedAt,
      defaultCalendarView: before.defaultCalendarView,
    }).toEqual(before);
  }
  const audit = await db.models.AuditLogs.findAll({
    where: { action: 'settings.calendar.update' },
  });
  expect(audit.length).toBeGreaterThanOrEqual(3);
  expect(JSON.stringify(audit)).not.toMatch(
    /defaultCalendarView|firstName|lastName|paymentMethods/,
  );
  const count = await db.models.AuditLogs.count();
  await save('month');
  expect(await db.models.AuditLogs.count()).toBe(count);
  const dashboardUser = await restrictedUser(['dashboard.read']);
  const read = await request(app)
    .get('/api/v1/settings/calendar')
    .set('Cookie', 'osteopilot.access=' + dashboardUser.session.token);
  expect(read.status).toBe(200);
  expect(read.body.data).toEqual({ defaultCalendarView: 'month' });
  expect(
    (
      await request(app)
        .get('/api/v1/settings')
        .set('Cookie', 'osteopilot.access=' + dashboardUser.session.token)
    ).status,
  ).toBe(403);
  await Promise.all([
    administration.changeCalendarSettings(session.token, session.csrfToken, {
      defaultCalendarView: 'year',
    }),
    administration.changePaymentMethod(session.token, session.csrfToken, {
      method: 'cash',
      accepted: true,
    }),
  ]);
  const combined = await administration.settings();
  expect(combined.defaultCalendarView).toBe('year');
  expect(combined.paymentMethods).toContain('cash');
  const general = Object.fromEntries(
    ['name', 'address', 'phone', 'email', 'timezone'].map((key) => [key, combined[key]]),
  );
  await administration.saveSettings(session.token, session.csrfToken, general);
  expect((await administration.settings()).defaultCalendarView).toBe('year');
  await expect(
    administration.saveSettings(session.token, session.csrfToken, {
      ...general,
      defaultCalendarView: 'month',
    }),
  ).rejects.toMatchObject({ status: 422 });
});

test('vue initiale : permissions, CSRF, validation et rollback de l’audit', async () => {
  const reader = await restrictedUser(['dashboard.read', 'settings.read']);
  const send = (body, token = session.token, csrf = session.csrfToken) =>
    request(app)
      .patch('/api/v1/settings/calendar')
      .set('Cookie', 'osteopilot.access=' + token)
      .set('Origin', config.publicUrl)
      .set('X-CSRF-Token', csrf)
      .send(body);
  const before = await administration.settings();
  expect(
    (await send({ defaultCalendarView: 'week' }, reader.session.token, reader.session.csrfToken))
      .status,
  ).toBe(403);
  await expect(
    administration.changeCalendarSettings(reader.session.token, reader.session.csrfToken, {
      defaultCalendarView: 'week',
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect((await send({ defaultCalendarView: 'week' }, session.token, 'invalid')).status).toBe(403);
  const withoutDashboard = await restrictedUser(['settings.read']);
  expect(
    (
      await request(app)
        .get('/api/v1/settings/calendar')
        .set('Cookie', 'osteopilot.access=' + withoutDashboard.session.token)
    ).status,
  ).toBe(403);
  for (const body of [
    { defaultCalendarView: 'day' },
    { defaultCalendarView: 'week', name: 'interdit' },
    { defaultCalendarView: null },
    {},
  ])
    expect((await send(body)).status).toBe(422);
  expect(await administration.settings()).toEqual(before);
  const count = await db.models.AuditLogs.count();
  jest
    .spyOn(db.models.AuditLogs, 'create')
    .mockRejectedValueOnce(new Error('Panne audit calendrier'));
  await expect(
    administration.changeCalendarSettings(session.token, session.csrfToken, {
      defaultCalendarView: 'week',
    }),
  ).rejects.toThrow('Panne audit calendrier');
  expect(await administration.settings()).toEqual(before);
  expect(await db.models.AuditLogs.count()).toBe(count);
});

test('migration de la vue initiale : mois par défaut et préférences préservées au deuxième passage', async () => {
  // DDL réservés à la base éphémère du runner, jamais à osteopilot.
  const qi = db.sequelize.getQueryInterface();
  const before = await administration.settings();
  const paymentsBefore = await db.models.Payments.count();
  await qi.removeColumn('Settings', 'defaultCalendarView');
  await db.sequelize.transaction((transaction) =>
    qi.bulkDelete(
      'SequelizeMeta',
      { name: '202610310005-calendar-default-view.js' },
      { transaction },
    ),
  );
  await expect(checkSchema(db)).rejects.toMatchObject({ status: 409 });
  await migrate(db);
  await checkSchema(db);
  expect(await administration.settings()).toEqual({ ...before, defaultCalendarView: 'month' });
  expect(await db.models.Payments.count()).toBe(paymentsBefore);
  await administration.changeCalendarSettings(session.token, session.csrfToken, {
    defaultCalendarView: 'week',
  });
  await migrate(db);
  expect((await administration.settings()).defaultCalendarView).toBe('week');
});

test('down : verrou partagé, historique inconnu et échec DDL sans retrait de l’historique', async () => {
  const before = (await inspectDatabase(db)).history;
  const connection = await db.sequelize.connectionManager.getConnection();
  const query = (sql) =>
    new Promise((resolve, reject) =>
      connection.query(sql, (error, rows) => (error ? reject(error) : resolve(rows))),
    );
  try {
    await query("SELECT GET_LOCK(CONCAT(DATABASE(), ':osteopilot:migrate'), 0)");
    await expect(undoMigration(db, { confirmDatabase: safeName })).rejects.toMatchObject({
      status: 409,
    });
  } finally {
    await query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':osteopilot:migrate'))");
    await db.sequelize.connectionManager.releaseConnection(connection);
  }
  const qi = db.sequelize.getQueryInterface();
  await db.sequelize.transaction((transaction) =>
    qi.bulkInsert('SequelizeMeta', [{ name: 'inconnue.js' }], { transaction }),
  );
  try {
    await expect(undoMigration(db, { confirmDatabase: safeName })).rejects.toMatchObject({
      status: 409,
    });
    expect((await qi.describeTable('Settings')).defaultCalendarView).toBeDefined();
  } finally {
    await db.sequelize.transaction((transaction) =>
      qi.bulkDelete('SequelizeMeta', { name: 'inconnue.js' }, { transaction }),
    );
  }
  jest.spyOn(qi, 'removeColumn').mockRejectedValueOnce(new Error('Panne DDL simulée'));
  await expect(undoMigration(db, { confirmDatabase: safeName })).rejects.toThrow(
    'Panne DDL simulée',
  );
  expect((await inspectDatabase(db)).history).toEqual(before);
  jest.spyOn(qi, 'bulkDelete').mockRejectedValueOnce(new Error('Panne historique simulée'));
  await expect(undoMigration(db, { confirmDatabase: safeName })).rejects.toThrow(
    'Panne historique simulée',
  );
  expect((await inspectDatabase(db)).history).toEqual(before);
  expect((await qi.describeTable('Settings')).defaultCalendarView).toBeUndefined();
  // Reprise explicite du même down après DDL partiel.
  await undoMigration(db, { confirmDatabase: safeName });
  expect((await inspectDatabase(db)).history).toEqual(before.slice(0, -1));
  await migrate(db);
});

test('down/up des cinq migrations : colonnes, données conservées, permissions et reconstruction complète', async () => {
  const qi = db.sequelize.getQueryInterface();
  const undo = () => undoMigration(db, { confirmDatabase: safeName });
  const original = await inspectDatabase(db);
  const settingsBefore = await administration.settings();
  const patientsBefore = await db.models.Patients.count();
  const paymentsBefore = await db.models.Payments.count();
  expect(paymentsBefore).toBeGreaterThan(0);
  await undo();
  expect((await qi.describeTable('Settings')).defaultCalendarView).toBeUndefined();
  await expect(checkSchema(db)).rejects.toMatchObject({ status: 409 });
  await migrate(db);
  expect(await administration.settings()).toEqual({
    ...settingsBefore,
    defaultCalendarView: 'month',
  });
  await undo();
  await undo();
  const columns = await qi.describeTable('Payments');
  expect(columns.bankDeposited).toBeUndefined();
  expect(columns.version).toBeUndefined();
  expect(await db.models.Payments.count()).toBe(paymentsBefore);
  expect(await db.models.Permissions.count({ where: { name: 'payments.deposit' } })).toBe(0);
  await migrate(db);
  expect(await db.models.Payments.count({ where: { bankDeposited: false, version: 1 } })).toBe(
    paymentsBefore,
  );
  const permission = await db.models.Permissions.findOne({ where: { name: 'payments.deposit' } });
  expect(await db.models.RolePermissions.count({ where: { permissionId: permission.id } })).toBe(1);
  // Retour complet en ordre inverse ; aucune base autre que celle du runner.
  for (let remaining = 4; remaining >= 0; remaining--) {
    const result = await undo();
    expect(result.undone).toBe(original.history[remaining]);
    expect(result.history).toEqual(original.history.slice(0, remaining));
    if (remaining === 2) {
      expect((await qi.showAllTables()).some((table) => table.toLowerCase() === 'payments')).toBe(
        false,
      );
      expect(
        await db.models.Permissions.count({
          where: { name: ['payments.read', 'payments.create', 'payments.deposit'] },
        }),
      ).toBe(0);
      const [memos] = await db.sequelize.query(
        "SELECT COUNT(*) AS count FROM IdempotencyKeys WHERE JSON_EXTRACT(result, '$.amountCents') IS NOT NULL",
      );
      expect(Number(memos[0].count)).toBe(0);
      expect(await db.models.Patients.count()).toBe(patientsBefore);
    }
    if (remaining === 1) {
      const settings = await qi.describeTable('Settings');
      expect(settings.paymentMethods).toBeUndefined();
      expect(settings.defaultCalendarView).toBeUndefined();
    }
  }
  expect((await inspectDatabase(db)).tables).toEqual([]);
  expect((await undo()).undone).toBeNull();
  await initialUp(db);
  const baseline = await qi.describeTable('Settings');
  expect(baseline.paymentMethods).toBeUndefined();
  expect(baseline.defaultCalendarView).toBeUndefined();
  expect((await qi.showAllTables()).some((table) => table.toLowerCase() === 'payments')).toBe(
    false,
  );
  expect(
    await db.models.Permissions.count({
      where: { name: ['payments.read', 'payments.create', 'payments.deposit'] },
    }),
  ).toBe(0);
  await migrate(db);
  await checkSchema(db);
  expect((await inspectDatabase(db)).history).toEqual(original.history);
  expect(await db.models.Permissions.count()).toBe(permissions.length);
  expect(await db.models.Payments.count()).toBe(0);
  expect((await db.models.Settings.findOne()).defaultCalendarView).toBe('month');
  await migrate(db);
  await checkSchema(db);
});
