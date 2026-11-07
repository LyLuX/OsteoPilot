import { publicPayment } from '../../src/modules/payments/payment.validator.js';
import { todayInParis } from '../../src/core/civil-date.js';
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
  for (const amountCents of [1, 101, 202, 303, 404, 1050, 2051, 1001, 2345, 4321, 12345, 99999]) {
    const tariff = await administration.saveTariff(session.token, session.csrfToken, null, {
      label: 'Tarif de test ' + amountCents,
      amountCents,
    });
    fixtureTariffIds.set(amountCents, tariff.id);
  }
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => db.sequelize.close());
// Fixtures use the same archived-batch operation as Gestion paiements.
const markPayment = async (token, csrf, id, { version }) => {
  const row = await db.models.Payments.findByPk(id, { attributes: ['method'] });
  await payments.depositBatch(
    token,
    csrf,
    { method: row.method, items: [{ id, version }] },
    randomUUID(),
  );
  return publicPayment(await db.models.Payments.findByPk(id));
};
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
          '202611030006-payment-delete-permission.js',
          '202611030007-payment-tariffs.js',
          '202611070008-payment-cheque-number.js',
          '202611070009-deposit-slips.js',
          '202611070010-deposit-action-permissions.js',
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

const fixtureTariffIds = new Map();
const paymentValues = (patientId, overrides = {}) => ({
  patientId,
  date: '2026-10-29',
  method: 'cash',
  amountCents: 1050,
  tariffId: fixtureTariffIds.get(overrides.amountCents ?? 1050) ?? fixtureTariffIds.get(1050),
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

test('paiements : disponibilité globale des dépôts indépendante des pages et dates, actualisée après mutation', async () => {
  const expected = async (bankDeposited) => ({
    cash: await db.models.Payments.count({ where: { method: 'cash', bankDeposited } }),
    cheque: await db.models.Payments.count({ where: { method: 'cheque', bankDeposited } }),
  });
  const before = await expected(false);
  const depositedBefore = await expected(true);
  const patient = await paymentPatient();
  await acceptMethod('cheque');
  const row = await payments.create(
    session.token,
    session.csrfToken,
    paymentValues(patient.id, { method: 'cheque' }),
    randomUUID(),
  );
  const read = () =>
    request(app)
      .get('/api/v1/payments')
      .set('Cookie', 'osteopilot.access=' + session.token)
      .query({ date: '1000-01-01', page: 999, limit: 1 });
  const pending = await read();
  expect(pending.status).toBe(200);
  expect(pending.body.data.items).toEqual([]);
  expect(pending.body.data.pendingDeposits).toEqual({ ...before, cheque: before.cheque + 1 });
  expect(pending.body.data.pendingDeposits).toEqual(await expected(false));
  expect(pending.body.data.depositedPayments).toEqual(depositedBefore);
  await markPayment(session.token, session.csrfToken, row.id, {
    bankDeposited: true,
    version: 1,
  });
  const deposited = await read();
  expect(deposited.body.data.pendingDeposits).toEqual(before);
  expect(deposited.body.data.depositedPayments).toEqual({
    ...depositedBefore,
    cheque: depositedBefore.cheque + 1,
  });
  expect(deposited.body.data.depositedPayments).toEqual(await expected(true));
  await payments.setBankDeposit(session.token, session.csrfToken, row.id, {
    bankDeposited: false,
    version: 2,
  });
  expect((await read()).body.data.pendingDeposits).toEqual({
    ...before,
    cheque: before.cheque + 1,
  });
  expect((await read()).body.data.depositedPayments).toEqual(depositedBefore);
  await payments.remove(session.token, session.csrfToken, row.id, { version: 3, confirmed: true });
  const removed = await read();
  expect(removed.body.data.pendingDeposits).toEqual(before);
  expect(removed.body.data.depositedPayments).toEqual(depositedBefore);
});

test('paiements : périodes inclusives, tri civil, pagination et totaux annuels historiques', async () => {
  const previousTotal = (await payments.list({})).pagination.total;
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
  const all = await request(app).get('/api/v1/payments').set('Cookie', cookie).query({ limit: 2 });
  expect(all.status).toBe(200);
  expect(all.body.data.pagination).toMatchObject({
    total: previousTotal + 4,
    totalPages: Math.ceil((previousTotal + 4) / 2),
  });
  const history = [...all.body.data.items];
  for (let page = 2; page <= all.body.data.pagination.totalPages; page += 1) {
    history.push(...(await payments.list({ page, limit: 2 })).items);
  }
  expect(new Set(history.map((payment) => payment.id)).size).toBe(previousTotal + 4);
  expect(
    history.filter((payment) => payment.patientId === patient.id).map((payment) => payment.date),
  ).toEqual(['2025-01-01', '2024-12-31', '2024-02-29', '2024-01-01']);
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
    const mark = await markPayment(session.token, session.csrfToken, row.id, { version: 1 });
    expect(mark).toMatchObject({
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
    expect((await send({ bankDeposited: true, version: 2 })).status).toBe(422);
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
        bankDeposited: false,
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
        { bankDeposited: false, version: 1 },
        reader.session.token,
        reader.session.csrfToken,
      )
    ).status,
  ).toBe(403);
  await expect(
    payments.setBankDeposit(reader.session.token, reader.session.csrfToken, row.id, {
      bankDeposited: false,
      version: 1,
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    (await send(row.id, { bankDeposited: false, version: 1 }, session.token, 'invalid')).status,
  ).toBe(403);
  expect((await send('invalide', { bankDeposited: false, version: 1 })).status).toBe(422);
  expect((await send(randomUUID(), { bankDeposited: false, version: 1 })).status).toBe(404);
  for (const body of [
    { bankDeposited: 'true', version: 1 },
    { bankDeposited: false, version: 0 },
    { bankDeposited: false, version: 1, method: 'cash' },
  ])
    expect((await send(row.id, body)).status).toBe(422);
  expect((await send(row.id, { bankDeposited: true, version: 1 })).status).toBe(422);
  await expect(
    payments.setBankDeposit(session.token, session.csrfToken, row.id, {
      bankDeposited: true,
      version: 1,
    }),
  ).rejects.toMatchObject({ status: 422 });
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
    [0, 1].map(() => markPayment(session.token, session.csrfToken, row.id, { version: 1 })),
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
      {
        name: [
          '202610290004-payment-bank-deposits.js',
          '202610310005-calendar-default-view.js',
          '202611030006-payment-delete-permission.js',
          '202611030007-payment-tariffs.js',
          '202611070008-payment-cheque-number.js',
          '202611070009-deposit-slips.js',
          '202611070010-deposit-action-permissions.js',
        ],
      },
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
  await markPayment(session.token, session.csrfToken, row.id, {
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
      {
        name: [
          '202610310005-calendar-default-view.js',
          '202611030006-payment-delete-permission.js',
          '202611030007-payment-tariffs.js',
          '202611070008-payment-cheque-number.js',
          '202611070009-deposit-slips.js',
          '202611070010-deposit-action-permissions.js',
        ],
      },
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

test('paiement : refus serveur des dates futures, aujourd’hui et passé autorisés sans effets en cas de refus', async () => {
  await acceptMethod('cash');
  const patient = await paymentPatient();
  const today = todayInParis();
  const [year, month, day] = today.split('-').map(Number);
  const tomorrow = todayInParis(new Date(Date.UTC(year, month - 1, day + 1, 12)));
  const yesterday = todayInParis(new Date(Date.UTC(year, month - 1, day - 1, 12)));
  const values = paymentValues(patient.id, { date: tomorrow });
  const before = await snapshot();
  await expect(
    payments.create(session.token, session.csrfToken, values, randomUUID()),
  ).rejects.toMatchObject({
    status: 422,
    details: [{ field: 'date', message: expect.any(String) }],
  });
  const response = await request(app)
    .post('/api/v1/payments')
    .set('Cookie', 'osteopilot.access=' + session.token)
    .set('Origin', config.publicUrl)
    .set('X-CSRF-Token', session.csrfToken)
    .set('Idempotency-Key', randomUUID())
    .send(values);
  expect(response.status).toBe(422);
  expect(response.body.error.details[0].field).toBe('date');
  expect(await snapshot()).toEqual(before);
  for (const date of [yesterday, today])
    expect(
      (await payments.create(session.token, session.csrfToken, { ...values, date }, randomUUID()))
        .date,
    ).toBe(date);
});

test('suppression : permission dédiée, CSRF, origine, confirmation et version obligatoires', async () => {
  await acceptMethod('cash');
  const patient = await paymentPatient();
  const row = await payments.create(
    session.token,
    session.csrfToken,
    paymentValues(patient.id),
    randomUUID(),
  );
  const reader = await restrictedUser(['payments.read', 'payments.create', 'payments.deposit']);
  const send = (
    body,
    token = session.token,
    csrf = session.csrfToken,
    origin = config.publicUrl,
    id = row.id,
  ) =>
    request(app)
      .delete('/api/v1/payments/' + id)
      .set('Cookie', 'osteopilot.access=' + token)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send(body);
  const valid = { version: row.version, confirmed: true };
  const before = await snapshot();
  expect((await send(valid, reader.session.token, reader.session.csrfToken)).status).toBe(403);
  await expect(
    payments.remove(reader.session.token, reader.session.csrfToken, row.id, valid),
  ).rejects.toMatchObject({ status: 403 });
  expect((await send(valid, session.token, 'invalide')).status).toBe(403);
  expect(
    (await send(valid, session.token, session.csrfToken, 'https://invalide.invalid')).status,
  ).toBe(403);
  for (const body of [
    { version: 1 },
    { version: 1, confirmed: false },
    { version: '1', confirmed: true },
    { version: 0, confirmed: true },
    { ...valid, amountCents: 1 },
  ])
    expect((await send(body)).status).toBe(422);
  expect((await send({ ...valid, version: 2 })).status).toBe(409);
  expect(
    (await send(valid, session.token, session.csrfToken, config.publicUrl, 'invalide')).status,
  ).toBe(422);
  expect(
    (await send(valid, session.token, session.csrfToken, config.publicUrl, randomUUID())).status,
  ).toBe(404);
  expect(await snapshot()).toEqual(before);
});

test('suppression atomique : rollback audit, paiement déposé, concurrence, totaux et rejeu sans résurrection', async () => {
  await acceptMethod('cash');
  const patient = await paymentPatient();
  const key = randomUUID();
  const values = paymentValues(patient.id, { date: '2021-11-03', amountCents: 12345 });
  const row = await payments.create(session.token, session.csrfToken, values, key);
  const deposited = await markPayment(session.token, session.csrfToken, row.id, {
    version: 1,
    bankDeposited: true,
  });
  await expect(
    payments.remove(session.token, session.csrfToken, row.id, { version: 1, confirmed: true }),
  ).rejects.toMatchObject({ status: 409 });
  const count = await db.models.AuditLogs.count();
  jest
    .spyOn(db.models.AuditLogs, 'create')
    .mockRejectedValueOnce(new Error('Panne audit suppression'));
  await expect(
    payments.remove(session.token, session.csrfToken, row.id, {
      version: deposited.version,
      confirmed: true,
    }),
  ).rejects.toThrow('Panne audit suppression');
  expect(await db.models.Payments.findByPk(row.id)).not.toBeNull();
  expect(await db.models.AuditLogs.count()).toBe(count);
  const before = await payments.summary({ from: values.date, to: values.date });
  const send = () =>
    request(app)
      .delete('/api/v1/payments/' + row.id)
      .set('Cookie', 'osteopilot.access=' + session.token)
      .set('Origin', config.publicUrl)
      .set('X-CSRF-Token', session.csrfToken)
      .send({ version: deposited.version, confirmed: true });
  const results = await Promise.all([send(), send()]);
  expect(results.map((response) => response.status).sort()).toEqual([200, 404]);
  expect(results.find((response) => response.status === 200).body.data).toEqual({ id: row.id });
  expect(await db.models.Payments.findByPk(row.id)).toBeNull();
  expect((await payments.summary({ from: values.date, to: values.date })).days).toEqual([]);
  expect(before.days[0].totalCents).toBe(12345);
  const audit = await db.models.AuditLogs.findAll({
    where: { action: 'payments.delete', entityId: row.id },
  });
  expect(audit).toHaveLength(1);
  expect(JSON.stringify(audit)).not.toMatch(/amountCents|bankDeposited|firstName|lastName/);
  await expect(
    payments.create(session.token, session.csrfToken, values, key),
  ).rejects.toMatchObject({ status: 409 });
  expect(await db.models.Payments.findByPk(row.id)).toBeNull();
});

test('fiche patient : récapitulatif isolé, toutes dates, total indépendant de la page et double permission', async () => {
  const patient = await paymentPatient();
  const other = await paymentPatient();
  await acceptMethod('cash');
  await acceptMethod('cheque');
  const first = await payments.create(
    session.token,
    session.csrfToken,
    paymentValues(patient.id, { date: '2020-01-02', amountCents: 1001 }),
    randomUUID(),
  );
  const second = await payments.create(
    session.token,
    session.csrfToken,
    paymentValues(patient.id, { date: '2026-11-03', method: 'cheque', amountCents: 2345 }),
    randomUUID(),
  );
  await payments.create(
    session.token,
    session.csrfToken,
    paymentValues(other.id, { amountCents: 99999 }),
    randomUUID(),
  );
  await administration.changePaymentMethod(session.token, session.csrfToken, {
    method: 'cheque',
    accepted: false,
  });
  await patients.setActive(session.token, session.csrfToken, patient.id, {
    version: patient.version,
    active: false,
  });
  const viewer = await restrictedUser(['patients.read', 'payments.read']);
  const get = (id = patient.id, query = {}, token = viewer.session.token) =>
    request(app)
      .get('/api/v1/patients/' + id + '/payments')
      .set('Cookie', 'osteopilot.access=' + token)
      .query(query);
  const page1 = await get(patient.id, { page: 1, limit: 1 });
  expect(page1.status).toBe(200);
  expect(page1.body.data.items.map((row) => row.id)).toEqual([second.id]);
  expect(page1.body.data.pagination).toMatchObject({ total: 2, totalPages: 2, page: 1 });
  expect(page1.body.data.summary).toEqual({
    totalCents: 3346,
    methods: { cash: 1001, cheque: 2345, card: 0, transfer: 0 },
  });
  expect(JSON.stringify(page1.body.data)).not.toMatch(/createdBy|passwordHash|firstName|lastName/);
  const page2 = await get(patient.id, { page: 2, limit: 1 });
  expect(page2.body.data.items.map((row) => row.id)).toEqual([first.id]);
  expect(page2.body.data.summary).toEqual(page1.body.data.summary);
  for (const permissions of [['patients.read'], ['payments.read']]) {
    const denied = await restrictedUser(permissions);
    expect((await get(patient.id, {}, denied.session.token)).status).toBe(403);
    await expect(
      payments.patientPayments(denied.session.token, patient.id, {}),
    ).rejects.toMatchObject({ status: 403 });
  }
  for (const query of [{ page: 0 }, { limit: 101 }, { sort: 'createdBy' }, { patientId: other.id }])
    expect((await get(patient.id, query)).status).toBe(422);
  expect((await get(randomUUID())).status).toBe(404);
  expect((await get('invalide')).status).toBe(422);
  await payments.remove(session.token, session.csrfToken, second.id, {
    version: 1,
    confirmed: true,
  });
  expect((await get()).body.data.summary.totalCents).toBe(1001);
  const empty = await paymentPatient();
  const result = (await get(empty.id)).body.data;
  expect(result.items).toEqual([]);
  expect(result.summary.totalCents).toBe(0);
});

test('récapitulatif patient : liste et total cohérents pendant une suppression concurrente', async () => {
  await acceptMethod('cash');
  const patient = await paymentPatient();
  const row = await payments.create(
    session.token,
    session.csrfToken,
    paymentValues(patient.id, { amountCents: 4321 }),
    randomUUID(),
  );
  const original = payments.repository.patientPayments.bind(payments.repository);
  jest.spyOn(payments.repository, 'patientPayments').mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    await payments.remove(session.token, session.csrfToken, row.id, {
      version: 1,
      confirmed: true,
    });
    return result;
  });
  const snapshot = await payments.patientPayments(session.token, patient.id, {});
  expect(snapshot.items.map((item) => item.id)).toEqual([row.id]);
  expect(snapshot.summary.totalCents).toBe(4321);
  const refreshed = await payments.patientPayments(session.token, patient.id, {});
  expect(refreshed.items).toEqual([]);
  expect(refreshed.summary.totalCents).toBe(0);
});

test('tarifs : lecture minimale pour le paiement et ajout/modification indépendants avec audit atomique', async () => {
  const before = await administration.settings();
  const writer = await restrictedUser(['payments.create']);
  const get = () =>
    request(app)
      .get('/api/v1/settings/tariffs')
      .set('Cookie', 'osteopilot.access=' + writer.session.token);
  const read = await get();
  expect(read.status).toBe(200);
  expect(Object.keys(read.body.data)).toEqual(['tariffs']);
  expect(
    read.body.data.tariffs.slice(0, 2).map(({ label, amountCents }) => ({ label, amountCents })),
  ).toEqual([
    { label: 'Consultation enfant/nourrisson', amountCents: 4500 },
    { label: 'Consultation adulte', amountCents: 5500 },
  ]);
  expect(JSON.stringify(read.body.data)).not.toMatch(/email|phone|address|timezone/);
  const send = (method, path, body, token = session.token, csrf = session.csrfToken) =>
    request(app)
      [method]('/api/v1' + path)
      .set('Cookie', 'osteopilot.access=' + token)
      .set('Origin', config.publicUrl)
      .set('X-CSRF-Token', csrf)
      .send(body);
  const input = { label: 'Consultation de test complémentaire', amountCents: 6750 };
  expect(
    (await send('post', '/settings/tariffs', input, writer.session.token, writer.session.csrfToken))
      .status,
  ).toBe(403);
  expect((await send('post', '/settings/tariffs', input, session.token, 'invalide')).status).toBe(
    403,
  );
  for (const body of [
    { ...input, amountCents: 0 },
    { ...input, amountCents: 1.5 },
    { ...input, label: '' },
    { ...input, label: 'x'.repeat(101) },
    { ...input, force: true },
  ])
    expect((await send('post', '/settings/tariffs', body)).status).toBe(422);
  const created = await send('post', '/settings/tariffs', input);
  expect(created.status).toBe(201);
  const tariff = created.body.data;
  expect(tariff).toMatchObject({ ...input, version: 1 });
  expect(tariff.id).toMatch(/^[a-f0-9-]{36}$/);
  const updated = await send('patch', '/settings/tariffs/' + tariff.id, {
    label: input.label,
    amountCents: 6800,
    version: 1,
  });
  expect(updated.status).toBe(200);
  expect(updated.body.data.version).toBe(2);
  expect(
    (
      await send('patch', '/settings/tariffs/' + tariff.id, {
        label: input.label,
        amountCents: 6900,
        version: 1,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await send('post', '/settings/tariffs', {
        ...input,
        label: '  ' + input.label.toUpperCase() + '  ',
      })
    ).status,
  ).toBe(422);
  const after = await administration.settings();
  expect({ ...after, tariffs: before.tariffs, updatedAt: before.updatedAt }).toEqual(before);
  const audit = await db.models.AuditLogs.findAll({ where: { entityId: tariff.id } });
  expect(audit).toHaveLength(2);
  expect(JSON.stringify(audit)).not.toMatch(/label|amountCents|Consultation/);
  const stable = await administration.settings();
  const count = await db.models.AuditLogs.count();
  jest.spyOn(db.models.AuditLogs, 'create').mockRejectedValueOnce(new Error('Panne audit tarif'));
  await expect(
    administration.saveTariff(session.token, session.csrfToken, tariff.id, {
      label: input.label,
      amountCents: 7000,
      version: 2,
    }),
  ).rejects.toThrow('Panne audit tarif');
  expect(await administration.settings()).toEqual(stable);
  expect(await db.models.AuditLogs.count()).toBe(count);
  const denied = await restrictedUser(['settings.read']);
  expect(
    (
      await request(app)
        .get('/api/v1/settings/tariffs')
        .set('Cookie', 'osteopilot.access=' + denied.session.token)
    ).status,
  ).toBe(403);
});

test('tarifs : montant serveur, tarif requis, prix obsolète refusé et paiements antérieurs préservés', async () => {
  await acceptMethod('cash');
  const patient = await paymentPatient();
  const tariff = await administration.saveTariff(session.token, session.csrfToken, null, {
    label: 'Tarif historique de test',
    amountCents: 5150,
  });
  const values = { ...paymentValues(patient.id), tariffId: tariff.id, amountCents: 5150 };
  const key = randomUUID();
  const payment = await payments.create(session.token, session.csrfToken, values, key);
  const before = await snapshot();
  await expect(
    payments.create(
      session.token,
      session.csrfToken,
      { ...values, tariffId: randomUUID() },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 422 });
  const { tariffId: omitted, ...noTariff } = values;
  expect(omitted).toBe(tariff.id);
  await expect(
    payments.create(session.token, session.csrfToken, noTariff, randomUUID()),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    payments.create(session.token, session.csrfToken, { ...values, amountCents: 1 }, randomUUID()),
  ).rejects.toMatchObject({
    status: 409,
    details: [{ field: 'tariffId', message: expect.any(String) }],
  });
  expect(await snapshot()).toEqual(before);
  const changed = await administration.saveTariff(session.token, session.csrfToken, tariff.id, {
    label: tariff.label,
    amountCents: 5250,
    version: 1,
  });
  await expect(
    payments.create(session.token, session.csrfToken, values, randomUUID()),
  ).rejects.toMatchObject({ status: 409 });
  expect((await payments.create(session.token, session.csrfToken, values, key)).amountCents).toBe(
    5150,
  );
  expect((await db.models.Payments.findByPk(payment.id)).amountCents).toBe(5150);
  const next = await payments.create(
    session.token,
    session.csrfToken,
    { ...values, amountCents: changed.amountCents },
    randomUUID(),
  );
  expect(next.amountCents).toBe(5250);
});

test('tarifs : ajouts concurrents sans perte et plafond de 100 tarifs', async () => {
  const created = await Promise.all(
    ['A', 'B'].map((label) =>
      administration.saveTariff(session.token, session.csrfToken, null, {
        label: 'Tarif concurrent ' + label,
        amountCents: 100,
      }),
    ),
  );
  const settings = await administration.settings();
  for (const tariff of created)
    expect(settings.tariffs.some((item) => item.id === tariff.id)).toBe(true);
  const saved = settings.tariffs;
  await db.sequelize.transaction(async (transaction) => {
    const row = await db.models.Settings.findOne({ transaction });
    await row.update(
      {
        tariffs: Array.from({ length: 100 }, (_, index) => ({
          id: randomUUID(),
          label: 'Tarif limite ' + index,
          amountCents: 100,
          version: 1,
        })),
      },
      { transaction },
    );
  });
  try {
    await expect(
      administration.saveTariff(session.token, session.csrfToken, null, {
        label: 'Tarif en trop',
        amountCents: 100,
      }),
    ).rejects.toMatchObject({ status: 422 });
  } finally {
    await db.sequelize.transaction(async (transaction) => {
      const row = await db.models.Settings.findOne({ transaction });
      await row.update({ tariffs: saved }, { transaction });
    });
  }
});

test('bordereau : aperçu sans mutation, sélection globale, dépôt atomique idempotent et annulation', async () => {
  await acceptMethod('cash');
  const patient = await paymentPatient();
  const rows = [];
  for (const amountCents of [101, 202])
    rows.push(
      await payments.create(
        session.token,
        session.csrfToken,
        paymentValues(patient.id, { method: 'cash', amountCents }),
        randomUUID(),
      ),
    );
  const operator = await restrictedUser(['payments.read', 'payments.deposit']);
  const selected = { method: 'cash', all: false, ids: rows.map((row) => row.id), excluded: [] };
  const before = await snapshot();
  const preview = await payments.depositPreview(session.token, session.csrfToken, selected);
  expect(await snapshot()).toEqual(before);
  expect(preview.totalCents).toBe(303);
  const identity = await db.models.Settings.findOne({ attributes: ['name'] });
  expect(preview.cabinetName).toBe(identity.name);
  expect(Object.keys(preview).sort()).toEqual(
    ['method', 'items', 'totalCents', 'cabinetName'].sort(),
  );
  expect(preview.items.every((payment) => payment.chequeNumber === null)).toBe(true);
  const operatorPreview = await payments.depositPreview(
    operator.session.token,
    operator.session.csrfToken,
    selected,
  );
  expect(operatorPreview.cabinetName).toBe(identity.name);
  expect(preview.items).toHaveLength(2);
  expect(preview.items[0].patient).toEqual({
    firstName: patient.firstName,
    lastName: patient.lastName,
  });
  expect(Object.keys(preview.items[0]).sort()).toEqual(
    ['id', 'version', 'date', 'amountCents', 'chequeNumber', 'patient'].sort(),
  );
  const global = await payments.depositPreview(session.token, session.csrfToken, {
    method: 'cash',
    all: true,
    ids: [],
    excluded: [rows[0].id],
  });
  expect(global.items.map((row) => row.id)).toContain(rows[1].id);
  expect(global.items.map((row) => row.id)).not.toContain(rows[0].id);
  const values = {
    method: preview.method,
    items: preview.items.map(({ id, version }) => ({ id, version })),
  };
  const key = randomUUID();
  const send = () =>
    request(app)
      .post('/api/v1/payments/deposits')
      .set('Origin', config.publicUrl)
      .set('Cookie', 'osteopilot.access=' + session.token)
      .set('X-CSRF-Token', session.csrfToken)
      .set('Idempotency-Key', key)
      .send(values);
  const response = await send();
  expect(response.status).toBe(200);
  expect(response.body.data.totalCents).toBe(303);
  for (const row of rows)
    expect((await db.models.Payments.findByPk(row.id)).bankDeposited).toBe(true);
  const after = await snapshot();
  expect(after.AuditLogs).toBe(before.AuditLogs + 3);
  expect((await send()).body.data).toEqual(response.body.data);
  expect(await snapshot()).toEqual(after);
  await expect(
    payments.depositBatch(
      session.token,
      session.csrfToken,
      { ...values, items: [values.items[0]] },
      key,
    ),
  ).rejects.toMatchObject({ status: 409 });
  const audits = await db.models.AuditLogs.findAll({
    where: { action: 'payments.bank-deposit.mark', entityId: rows.map((row) => row.id) },
    raw: true,
  });
  expect(audits).toHaveLength(2);
  expect(JSON.stringify(audits)).not.toMatch(/amountCents|firstName|lastName|chequeNumber/);
  await payments.setBankDeposit(session.token, session.csrfToken, rows[0].id, {
    bankDeposited: false,
    version: 2,
  });
  const undone = await db.models.Payments.findByPk(rows[0].id);
  expect(undone.bankDeposited).toBe(false);
  expect(undone.amountCents).toBe(101);
  expect(undone.version).toBe(3);
});

test('bordereau : conflit et panne audit annulent tout le lot, concurrence sans double dépôt', async () => {
  await acceptMethod('cheque');
  const patient = await paymentPatient();
  const rows = [];
  for (const amountCents of [101, 202])
    rows.push(
      await payments.create(
        session.token,
        session.csrfToken,
        paymentValues(patient.id, {
          method: 'cheque',
          amountCents,
          ...(amountCents === 101 ? { chequeNumber: '0012345' } : {}),
        }),
        randomUUID(),
      ),
    );

  const preview = await payments.depositPreview(session.token, session.csrfToken, {
    method: 'cheque',
    all: false,
    ids: rows.map((row) => row.id),
    excluded: [],
  });
  expect(preview.items.find((payment) => payment.id === rows[0].id).chequeNumber).toBe('0012345');
  expect(preview.items.find((payment) => payment.id === rows[1].id).chequeNumber).toBeNull();
  const input = { method: 'cheque', items: rows.map(({ id, version }) => ({ id, version })) };
  const before = await snapshot();
  await expect(
    payments.depositBatch(
      session.token,
      session.csrfToken,
      { ...input, items: [{ ...input.items[0], version: 2 }, input.items[1]] },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(await snapshot()).toEqual(before);
  const original = db.models.AuditLogs.create.bind(db.models.AuditLogs);
  let calls = 0;
  const spy = jest.spyOn(db.models.AuditLogs, 'create').mockImplementation((...args) => {
    calls++;
    if (calls === 2) throw new Error('Panne second audit dépôt');
    return original(...args);
  });
  await expect(
    payments.depositBatch(session.token, session.csrfToken, input, randomUUID()),
  ).rejects.toThrow('Panne second audit dépôt');
  spy.mockRestore();
  expect(await snapshot()).toEqual(before);
  for (const row of rows)
    expect(await db.models.Payments.findByPk(row.id)).toMatchObject({
      bankDeposited: false,
      version: 1,
    });
  const results = await Promise.allSettled([
    payments.depositBatch(session.token, session.csrfToken, input, randomUUID()),
    payments.depositBatch(session.token, session.csrfToken, input, randomUUID()),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((result) => result.status === 'rejected').reason).toMatchObject({
    status: 409,
  });
  expect((await snapshot()).AuditLogs).toBe(before.AuditLogs + 3);
});

test('bordereau : permissions, origine, CSRF, sélection indisponible et bornes', async () => {
  const reader = await restrictedUser(['payments.read']);
  const depositor = await restrictedUser(['payments.deposit']);
  const selection = { method: 'cash', all: false, ids: [randomUUID()], excluded: [] };
  await expect(
    payments.depositPreview(reader.session.token, reader.session.csrfToken, selection),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    payments.depositPreview(depositor.session.token, depositor.session.csrfToken, selection),
  ).rejects.toMatchObject({ status: 403 });
  const input = { method: 'cash', items: [{ id: randomUUID(), version: 1 }] };
  await expect(
    payments.depositBatch(reader.session.token, reader.session.csrfToken, input, randomUUID()),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    payments.depositBatch(
      depositor.session.token,
      depositor.session.csrfToken,
      input,
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    payments.depositBatch(session.token, 'invalid', input, randomUUID()),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    payments.depositBatch(session.token, session.csrfToken, input, randomUUID()),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    payments.depositPreview(session.token, session.csrfToken, selection),
  ).rejects.toMatchObject({ status: 409 });
  const noOrigin = await request(app)
    .post('/api/v1/payments/deposits')
    .set('Cookie', 'osteopilot.access=' + session.token)
    .send(input);
  expect(noOrigin.status).toBe(403);
  const csrf = await request(app)
    .post('/api/v1/payments/deposits/preview')
    .set('Origin', config.publicUrl)
    .set('Cookie', 'osteopilot.access=' + session.token)
    .send(selection);
  expect(csrf.status).toBe(403);
  const spy = jest
    .spyOn(payments.repository, 'depositSelection')
    .mockResolvedValueOnce(Array(5001).fill({}));
  await expect(
    payments.depositPreview(session.token, session.csrfToken, {
      method: 'cash',
      all: true,
      ids: [],
      excluded: [],
    }),
  ).rejects.toMatchObject({ status: 422 });
  spy.mockRestore();
});

test('annulation globale : tous les dépôts du type, versions, audit minimal et idempotence', async () => {
  await acceptMethod('cash');
  await acceptMethod('cheque');
  const patient = await paymentPatient();
  const created = [];
  for (const method of ['cash', 'cash', 'cheque']) {
    const row = await payments.create(
      session.token,
      session.csrfToken,
      paymentValues(patient.id, { method, amountCents: 101 }),
      randomUUID(),
    );
    created.push(
      await markPayment(session.token, session.csrfToken, row.id, {
        bankDeposited: true,
        version: row.version,
      }),
    );
  }
  const response = await request(app)
    .get('/api/v1/payments/deposits/cancellable')
    .set('Cookie', 'osteopilot.access=' + session.token)
    .query({ method: 'cash' });
  expect(response.status).toBe(200);
  const selection = response.body.data;
  for (const item of selection.items) expect(Object.keys(item).sort()).toEqual(['id', 'version']);
  expect(selection.items.map(({ id }) => id)).toEqual(
    expect.arrayContaining(created.slice(0, 2).map(({ id }) => id)),
  );
  expect(selection.items.map(({ id }) => id)).not.toContain(created[2].id);
  const beforeRows = await db.models.Payments.findAll({
    attributes: ['id', 'date', 'method', 'amountCents', 'bankDeposited', 'version'],
    raw: true,
  });
  const before = await snapshot();
  const key = randomUUID();
  const input = { ...selection, confirmed: true };
  const send = () =>
    request(app)
      .post('/api/v1/payments/deposits/cancel')
      .set('Origin', config.publicUrl)
      .set('Cookie', 'osteopilot.access=' + session.token)
      .set('X-CSRF-Token', session.csrfToken)
      .set('Idempotency-Key', key)
      .send(input);
  const result = await send();
  expect(result.status).toBe(200);
  expect(result.body.data.count).toBe(selection.items.length);
  expect((await payments.cancellableDeposits(session.token, { method: 'cash' })).items).toEqual([]);
  for (const row of beforeRows) {
    const stored = (await db.models.Payments.findByPk(row.id)).get({ plain: true });
    expect(stored.date).toBe(row.date);
    expect(stored.amountCents).toBe(row.amountCents);
    if (row.method === 'cash' && row.bankDeposited)
      expect(stored).toMatchObject({ bankDeposited: false, version: row.version + 1 });
    else
      expect(stored).toMatchObject({
        bankDeposited: Boolean(row.bankDeposited),
        version: row.version,
      });
  }
  const after = await snapshot();
  expect(after.AuditLogs).toBe(before.AuditLogs + selection.items.length);
  expect((await send()).body.data).toEqual(result.body.data);
  expect(await snapshot()).toEqual(after);
  await expect(
    payments.cancelDeposits(session.token, session.csrfToken, input, randomUUID()),
  ).rejects.toMatchObject({ status: 422 });
  expect(await snapshot()).toEqual(after);
  const audits = await db.models.AuditLogs.findAll({
    where: {
      action: 'payments.bank-deposit.unmark',
      entityId: selection.items.map(({ id }) => id),
    },
    raw: true,
  });
  expect(JSON.stringify(audits)).not.toMatch(/amountCents|firstName|lastName|chequeNumber/);
});

test('annulation globale : conflit sur ajout ou version, rollback du second audit et concurrence', async () => {
  await acceptMethod('cash');
  const patient = await paymentPatient();
  const first = await payments.create(
    session.token,
    session.csrfToken,
    paymentValues(patient.id, { method: 'cash' }),
    randomUUID(),
  );
  await markPayment(session.token, session.csrfToken, first.id, {
    bankDeposited: true,
    version: 1,
  });
  const old = await payments.cancellableDeposits(session.token, { method: 'cash' });
  const next = await payments.create(
    session.token,
    session.csrfToken,
    paymentValues(patient.id, { method: 'cash' }),
    randomUUID(),
  );
  await markPayment(session.token, session.csrfToken, next.id, {
    bankDeposited: true,
    version: 1,
  });
  await expect(
    payments.cancelDeposits(
      session.token,
      session.csrfToken,
      { ...old, confirmed: true },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 409 });
  const selection = await payments.cancellableDeposits(session.token, { method: 'cash' });
  const input = { ...selection, confirmed: true };
  const stale = {
    ...input,
    items: input.items.map((item, index) =>
      index === 0 ? { ...item, version: item.version + 1 } : item,
    ),
  };
  const before = await snapshot();
  await expect(
    payments.cancelDeposits(session.token, session.csrfToken, stale, randomUUID()),
  ).rejects.toMatchObject({ status: 409 });
  expect(await snapshot()).toEqual(before);
  const original = db.models.AuditLogs.create.bind(db.models.AuditLogs);
  let calls = 0;
  const spy = jest.spyOn(db.models.AuditLogs, 'create').mockImplementation((...args) => {
    calls++;
    if (calls === 2) throw new Error('Panne second audit annulation');
    return original(...args);
  });
  await expect(
    payments.cancelDeposits(session.token, session.csrfToken, input, randomUUID()),
  ).rejects.toThrow('Panne second audit annulation');
  spy.mockRestore();
  expect(await snapshot()).toEqual(before);
  expect(await payments.cancellableDeposits(session.token, { method: 'cash' })).toEqual(selection);
  const results = await Promise.allSettled([
    payments.cancelDeposits(session.token, session.csrfToken, input, randomUUID()),
    payments.cancelDeposits(session.token, session.csrfToken, input, randomUUID()),
  ]);
  expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
  expect(results.find(({ status }) => status === 'rejected').reason).toMatchObject({ status: 422 });
  expect((await snapshot()).AuditLogs).toBe(before.AuditLogs + selection.items.length);
});

test('annulation globale : droits backend, CSRF, confirmation et limite sans tronquage', async () => {
  const reader = await restrictedUser(['payments.read']);
  const depositor = await restrictedUser(['payments.deposit']);
  const input = { method: 'cash', items: [{ id: randomUUID(), version: 1 }], confirmed: true };
  for (const user of [reader, depositor]) {
    await expect(
      payments.cancellableDeposits(user.session.token, { method: 'cash' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      payments.cancelDeposits(user.session.token, user.session.csrfToken, input, randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
  }
  await expect(
    payments.cancelDeposits(session.token, 'invalid', input, randomUUID()),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    payments.cancelDeposits(
      session.token,
      session.csrfToken,
      { ...input, confirmed: false },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 422 });
  const noOrigin = await request(app)
    .post('/api/v1/payments/deposits/cancel')
    .set('Cookie', 'osteopilot.access=' + session.token)
    .send(input);
  expect(noOrigin.status).toBe(403);
  const spy = jest
    .spyOn(payments.repository, 'depositedByMethod')
    .mockResolvedValueOnce(Array(5001).fill({}));
  await expect(
    payments.cancellableDeposits(session.token, { method: 'cash' }),
  ).rejects.toMatchObject({ status: 422 });
  spy.mockRestore();
});

test('historique des dépôts : archive atomique immuable, lecture seule et contrôles serveur', async () => {
  await acceptMethod('cheque');
  const patient = await paymentPatient();
  const row = await payments.create(
    session.token,
    session.csrfToken,
    paymentValues(patient.id, { method: 'cheque', chequeNumber: '0012345', amountCents: 101 }),
    randomUUID(),
  );
  const input = { method: 'cheque', items: [{ id: row.id, version: row.version }] };
  const before = await db.models.DepositSlips.count();
  const key = randomUUID();
  const result = await payments.depositBatch(session.token, session.csrfToken, input, key);
  expect(await db.models.DepositSlips.count()).toBe(before + 1);
  expect((await payments.depositBatch(session.token, session.csrfToken, input, key)).slip).toEqual(
    result.slip,
  );
  const archived = result.slip;
  expect(archived.items[0].chequeNumber).toBe('0012345');
  expect(archived.reconstructed).toBe(false);
  const reader = await restrictedUser([
    'payments.read',
    'payments.deposits.read',
    'payments.deposits.reprint',
  ]);
  const denied = await restrictedUser(['patients.read']);
  const get = (path, query = {}, token = reader.session.token) =>
    request(app)
      .get(path)
      .query(query)
      .set('Cookie', 'osteopilot.access=' + token);
  const list = await get('/api/v1/payments/deposits/history', { limit: 1 });
  expect(list.status).toBe(200);
  expect(list.body.data.items).toHaveLength(1);
  expect(list.body.data.items[0]).not.toHaveProperty('items');
  expect(list.body.data.pagination.total).toBe(before + 1);
  expect((await get('/api/v1/payments/deposits/history', { limit: 101 })).status).toBe(422);
  expect((await get('/api/v1/payments/deposits/history', { sort: 'patient' })).status).toBe(422);
  expect((await get('/api/v1/payments/deposits/history/' + randomUUID())).status).toBe(404);
  expect((await get('/api/v1/payments/deposits/history/invalide')).status).toBe(422);
  expect((await get('/api/v1/payments/deposits/history', {}, denied.session.token)).status).toBe(
    403,
  );
  expect(
    (await get('/api/v1/payments/deposits/history/' + archived.id, {}, denied.session.token))
      .status,
  ).toBe(403);
  await payments.setBankDeposit(session.token, session.csrfToken, row.id, {
    bankDeposited: false,
    version: 2,
  });
  await payments.remove(session.token, session.csrfToken, row.id, { version: 3, confirmed: true });
  await patients.update(session.token, session.csrfToken, patient.id, {
    lastName: patient.lastName,
    email: '',
    phone: '',
    address: '',
    firstName: 'Modifié',
    version: patient.version,
  });
  const state = await snapshot();
  const detail = await get('/api/v1/payments/deposits/history/' + archived.id);
  expect(detail.status).toBe(200);
  expect(detail.body.data).toEqual(archived);
  expect(await payments.depositSlip(reader.session.token, archived.id)).toEqual(archived);
  expect(await snapshot()).toEqual(state);
  const audit = await db.models.AuditLogs.findOne({
    where: { action: 'payments.deposit-slip.create', entityId: archived.id },
    raw: true,
  });
  expect(audit.count).toBe(1);
  expect(JSON.stringify(audit)).not.toMatch(/0012345|chequeNumber|firstName|cabinetName/);
});

test('archivage : panne après création du document annule dépôts, archive et idempotence', async () => {
  await acceptMethod('cash');
  const patient = await paymentPatient();
  const row = await payments.create(
    session.token,
    session.csrfToken,
    paymentValues(patient.id),
    randomUUID(),
  );
  const before = await snapshot();
  const count = await db.models.DepositSlips.count();
  const create = db.models.AuditLogs.create.bind(db.models.AuditLogs);
  jest.spyOn(db.models.AuditLogs, 'create').mockImplementation((values, options) => {
    if (values.action === 'payments.deposit-slip.create') throw new Error('Panne audit archive');
    return create(values, options);
  });
  await expect(
    payments.depositBatch(
      session.token,
      session.csrfToken,
      { method: 'cash', items: [{ id: row.id, version: 1 }] },
      randomUUID(),
    ),
  ).rejects.toThrow('Panne audit archive');
  expect(await snapshot()).toEqual(before);
  expect(await db.models.DepositSlips.count()).toBe(count);
  expect((await db.models.Payments.findByPk(row.id)).bankDeposited).toBe(false);
});

test('permissions distinctes : dépôt, annulation, historique et réimpression contrôlés dans les services et les routes', async () => {
  const reader = await restrictedUser(['payments.read']);
  const history = await restrictedUser(['payments.read', 'payments.deposits.read']);
  const reprinter = await restrictedUser([
    'payments.read',
    'payments.deposits.read',
    'payments.deposits.reprint',
  ]);
  const depositor = await restrictedUser(['payments.read', 'payments.deposit']);
  const canceller = await restrictedUser(['payments.read', 'payments.deposit.cancel']);
  await acceptMethod('cash');
  const patient = await paymentPatient();
  const row = await payments.create(
    session.token,
    session.csrfToken,
    paymentValues(patient.id),
    randomUUID(),
  );
  for (const user of [reader, history, reprinter, canceller])
    await expect(
      payments.depositBatch(
        user.session.token,
        user.session.csrfToken,
        {
          method: 'cash',
          items: [{ id: row.id, version: 1 }],
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
  await markPayment(depositor.session.token, depositor.session.csrfToken, row.id, {
    bankDeposited: true,
    version: 1,
  });
  await expect(
    payments.setBankDeposit(depositor.session.token, depositor.session.csrfToken, row.id, {
      bankDeposited: false,
      version: 2,
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    payments.cancellableDeposits(depositor.session.token, { method: 'cash' }),
  ).rejects.toMatchObject({ status: 403 });
  const pendingCancel = await payments.cancellableDeposits(canceller.session.token, {
    method: 'cash',
  });
  const values = { ...pendingCancel, confirmed: true };
  await expect(
    payments.cancelDeposits(
      depositor.session.token,
      depositor.session.csrfToken,
      values,
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 403 });
  await payments.cancelDeposits(
    canceller.session.token,
    canceller.session.csrfToken,
    values,
    randomUUID(),
  );
  expect((await db.models.Payments.findByPk(row.id)).bankDeposited).toBe(false);
  await expect(payments.depositHistory(reader.session.token, {})).rejects.toMatchObject({
    status: 403,
  });
  const list = await payments.depositHistory(history.session.token, {});
  expect(list.items.length).toBeGreaterThan(0);
  const id = list.items[0].id;
  await expect(payments.depositSlip(history.session.token, id)).rejects.toMatchObject({
    status: 403,
  });
  expect((await payments.depositSlip(reprinter.session.token, id)).id).toBe(id);
  expect(
    (
      await request(app)
        .get('/api/v1/payments/deposits/history')
        .set('Cookie', 'osteopilot.access=' + reader.session.token)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .get('/api/v1/payments/deposits/history/' + id)
        .set('Cookie', 'osteopilot.access=' + history.session.token)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .patch('/api/v1/payments/' + row.id + '/bank-deposit')
        .set('Origin', config.publicUrl)
        .set('Cookie', 'osteopilot.access=' + depositor.session.token)
        .set('X-CSRF-Token', depositor.session.csrfToken)
        .send({ bankDeposited: false, version: 3 })
    ).status,
  ).toBe(403);
});

test('suppression bordereau : droit propre, confirmation, protection des originaux, audit et paiements conservés', async () => {
  const archive = await db.models.DepositSlips.findOne({ where: { reconstructed: false } });
  const id = randomUUID();
  await db.sequelize.transaction((transaction) =>
    db.models.DepositSlips.create(
      {
        id,
        createdBy: admin.id,
        method: archive.method,
        cabinetName: archive.cabinetName,
        paymentCount: archive.paymentCount,
        totalCents: archive.totalCents,
        items: archive.items,
        reconstructed: true,
      },
      { transaction },
    ),
  );
  const deleter = await restrictedUser([
    'payments.read',
    'payments.deposits.read',
    'payments.deposits.delete',
  ]);
  const historyReader = await restrictedUser([
    'payments.read',
    'payments.deposits.read',
    'payments.deposits.reprint',
  ]);
  const missingHistory = await restrictedUser(['payments.read', 'payments.deposits.delete']);
  for (const user of [historyReader, missingHistory])
    await expect(
      payments.deleteDepositSlip(user.session.token, user.session.csrfToken, id, {
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
  const send = (slipId, body, csrf = deleter.session.csrfToken, origin = config.publicUrl) =>
    request(app)
      .delete('/api/v1/payments/deposits/history/' + slipId)
      .set('Origin', origin)
      .set('Cookie', 'osteopilot.access=' + deleter.session.token)
      .set('X-CSRF-Token', csrf)
      .send(body);
  expect((await send(id, { confirmed: false })).status).toBe(422);
  expect((await send(id, { confirmed: true, reconstructed: true })).status).toBe(422);
  expect((await send(id, { confirmed: true }, 'invalid')).status).toBe(403);
  expect(
    (await send(id, { confirmed: true }, deleter.session.csrfToken, 'https://example.invalid'))
      .status,
  ).toBe(403);
  expect((await send(archive.id, { confirmed: true })).status).toBe(409);
  expect(await db.models.DepositSlips.findByPk(archive.id)).not.toBeNull();
  const before = await db.models.Payments.findAll({
    attributes: ['id', 'bankDeposited', 'version', 'amountCents'],
    order: [['id', 'ASC']],
    raw: true,
  });
  const count = await db.models.DepositSlips.count();
  const spy = jest
    .spyOn(db.models.AuditLogs, 'create')
    .mockRejectedValueOnce(new Error('Panne audit suppression bordereau'));
  await expect(
    payments.deleteDepositSlip(deleter.session.token, deleter.session.csrfToken, id, {
      confirmed: true,
    }),
  ).rejects.toThrow('Panne audit suppression bordereau');
  spy.mockRestore();
  expect(await db.models.DepositSlips.count()).toBe(count);
  const response = await send(id, { confirmed: true });
  expect(response.status).toBe(200);
  expect(response.body.data).toEqual({ id });
  expect(await db.models.DepositSlips.findByPk(id)).toBeNull();
  expect((await send(id, { confirmed: true })).status).toBe(404);
  expect(
    await db.models.Payments.findAll({
      attributes: ['id', 'bankDeposited', 'version', 'amountCents'],
      order: [['id', 'ASC']],
      raw: true,
    }),
  ).toEqual(before);
  const audit = await db.models.AuditLogs.findAll({
    where: { action: 'payments.deposit-slip.delete', entityId: id },
    raw: true,
  });
  expect(audit).toHaveLength(1);
  expect(JSON.stringify(audit)).not.toMatch(/cabinetName|firstName|amountCents|chequeNumber/);
});

test('migration 010 : droits ADMIN seulement, reprise sans doublon et attribution atomique', async () => {
  const role = await restrictedUser(['payments.read', 'payments.deposit']);
  const assigned = await db.models.RolePermissions.count({ where: { roleId: role.role.id } });
  await undoMigration(db, { confirmDatabase: safeName });
  const spy = jest
    .spyOn(db.models.RolePermissions, 'create')
    .mockRejectedValueOnce(new Error('Panne attribution dépôt'));
  await expect(migrate(db)).rejects.toThrow('Panne attribution dépôt');
  spy.mockRestore();
  expect((await inspectDatabase(db)).history).toHaveLength(9);
  expect(await db.models.Permissions.count({ where: { name: 'payments.deposits.delete' } })).toBe(
    0,
  );
  await migrate(db);
  await migrate(db);
  await checkSchema(db);
  expect(await db.models.RolePermissions.count({ where: { roleId: role.role.id } })).toBe(assigned);
  for (const name of [
    'payments.deposit.cancel',
    'payments.deposits.read',
    'payments.deposits.reprint',
    'payments.deposits.delete',
  ]) {
    const permission = await db.models.Permissions.findOne({ where: { name } });
    expect(await db.models.RolePermissions.count({ where: { permissionId: permission.id } })).toBe(
      1,
    );
  }
});

test('migration 008 : colonne nullable, paiements préservés et reprise du DDL sans écrasement', async () => {
  const before = await db.models.Payments.findAll({
    attributes: ['id', 'amountCents', 'date', 'method'],
    order: [['id', 'ASC']],
    raw: true,
  });
  await undoMigration(db, { confirmDatabase: safeName }); // 010
  await undoMigration(db, { confirmDatabase: safeName }); // 009
  await undoMigration(db, { confirmDatabase: safeName }); // 008
  const qi = db.sequelize.getQueryInterface();
  expect((await qi.describeTable('Payments')).chequeNumber).toBeUndefined();
  await migrate(db);
  await checkSchema(db);
  expect((await qi.describeTable('Payments')).chequeNumber.allowNull).toBe(true);
  expect(
    await db.models.Payments.findAll({
      attributes: ['id', 'amountCents', 'date', 'method'],
      order: [['id', 'ASC']],
      raw: true,
    }),
  ).toEqual(before);
  const row = await db.models.Payments.findOne({ where: { method: 'cheque' } });
  expect(row.chequeNumber).toBeNull();
  await db.sequelize.transaction((transaction) =>
    row.update({ chequeNumber: '0001234' }, { transaction }),
  );
  await db.sequelize.transaction((transaction) =>
    qi.bulkDelete(
      'SequelizeMeta',
      {
        name: [
          '202611070008-payment-cheque-number.js',
          '202611070009-deposit-slips.js',
          '202611070010-deposit-action-permissions.js',
        ],
      },
      { transaction },
    ),
  );
  await migrate(db);
  expect((await db.models.Payments.findByPk(row.id)).chequeNumber).toBe('0001234');
  await migrate(db);
});

test('chèque : numéro stocké et projeté, idempotence, audit minimal et rollback atomique', async () => {
  await acceptMethod('cheque');
  const patient = await paymentPatient();
  const values = paymentValues(patient.id, { method: 'cheque', chequeNumber: '0012345' });
  const key = randomUUID();
  const created = await request(app)
    .post('/api/v1/payments')
    .set('Origin', config.publicUrl)
    .set('Cookie', 'osteopilot.access=' + session.token)
    .set('X-CSRF-Token', session.csrfToken)
    .set('Idempotency-Key', key)
    .send(values);
  expect(created.status).toBe(201);
  const row = created.body.data;
  expect(row.chequeNumber).toBe('0012345');
  expect((await db.models.Payments.findByPk(row.id)).chequeNumber).toBe('0012345');
  expect((await payments.create(session.token, session.csrfToken, values, key)).id).toBe(row.id);
  await expect(
    payments.create(session.token, session.csrfToken, { ...values, chequeNumber: '9999999' }, key),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await payments.list({ date: values.date })).items.find((payment) => payment.id === row.id)
      .chequeNumber,
  ).toBe('0012345');
  expect(
    (await payments.patientPayments(session.token, patient.id, {})).items[0].chequeNumber,
  ).toBe('0012345');
  const audit = await db.models.AuditLogs.findOne({
    where: { action: 'payments.create', entityId: row.id },
    raw: true,
  });
  expect(JSON.stringify(audit)).not.toMatch(/0012345|chequeNumber/);
  const before = await snapshot();
  for (const extra of [
    { chequeNumber: 'bad' },
    { chequeNumber: '1'.repeat(31) },
    { method: 'cash' },
  ]) {
    await expect(
      payments.create(session.token, session.csrfToken, { ...values, ...extra }, randomUUID()),
    ).rejects.toMatchObject({ status: 422 });
  }
  expect(await snapshot()).toEqual(before);
  jest.spyOn(db.models.AuditLogs, 'create').mockRejectedValueOnce(new Error('Panne audit chèque'));
  await expect(
    payments.create(session.token, session.csrfToken, values, randomUUID()),
  ).rejects.toThrow('Panne audit chèque');
  expect(await snapshot()).toEqual(before);
});

test('migration 007 : tarifs initiaux, reprise sans écrasement, down/up sans modification des paiements', async () => {
  const count = await db.models.Payments.count();
  const values = await db.models.Payments.findAll({
    attributes: ['id', 'amountCents'],
    order: [['id', 'ASC']],
    raw: true,
  });
  await undoMigration(db, { confirmDatabase: safeName }); // 010
  await undoMigration(db, { confirmDatabase: safeName }); // 009
  await undoMigration(db, { confirmDatabase: safeName }); // 008
  await undoMigration(db, { confirmDatabase: safeName }); // 007
  expect(
    (await db.sequelize.getQueryInterface().describeTable('Settings')).tariffs,
  ).toBeUndefined();
  await migrate(db);
  expect(
    (await administration.tariffs()).tariffs.map(({ label, amountCents }) => ({
      label,
      amountCents,
    })),
  ).toEqual([
    { label: 'Consultation enfant/nourrisson', amountCents: 4500 },
    { label: 'Consultation adulte', amountCents: 5500 },
  ]);
  const first = (await administration.tariffs()).tariffs[0];
  await administration.saveTariff(session.token, session.csrfToken, first.id, {
    label: first.label,
    amountCents: 4600,
    version: 1,
  });
  await db.sequelize.transaction((transaction) =>
    db.sequelize.getQueryInterface().bulkDelete(
      'SequelizeMeta',
      {
        name: [
          '202611030007-payment-tariffs.js',
          '202611070008-payment-cheque-number.js',
          '202611070009-deposit-slips.js',
          '202611070010-deposit-action-permissions.js',
        ],
      },
      { transaction },
    ),
  );
  await migrate(db);
  expect((await administration.tariffs()).tariffs[0].amountCents).toBe(4600);
  expect(await db.models.Payments.count()).toBe(count);
  expect(
    await db.models.Payments.findAll({
      attributes: ['id', 'amountCents'],
      order: [['id', 'ASC']],
      raw: true,
    }),
  ).toEqual(values);
  await undoMigration(db, { confirmDatabase: safeName }); // 010
  await undoMigration(db, { confirmDatabase: safeName }); // 009
  await undoMigration(db, { confirmDatabase: safeName }); // 008
  await undoMigration(db, { confirmDatabase: safeName }); // 007
  const qi = db.sequelize.getQueryInterface();
  jest.spyOn(qi, 'bulkInsert').mockRejectedValueOnce(new Error('Panne historique tarifs'));
  await expect(migrate(db)).rejects.toThrow('Panne historique tarifs');
  expect((await db.models.Settings.findOne({ attributes: ['tariffs'] })).tariffs).toBeNull();
  expect((await inspectDatabase(db)).history).toHaveLength(6);
  await migrate(db);
});

test('migration 006 : droit de suppression ADMIN, down/up et transaction sans attribution partielle', async () => {
  await undoMigration(db, { confirmDatabase: safeName }); // 010
  await undoMigration(db, { confirmDatabase: safeName }); // 009
  await undoMigration(db, { confirmDatabase: safeName }); // 008
  await undoMigration(db, { confirmDatabase: safeName }); // 007
  const before = await snapshot();
  await undoMigration(db, { confirmDatabase: safeName });
  expect(await db.models.Permissions.count({ where: { name: 'payments.delete' } })).toBe(0);
  jest
    .spyOn(db.models.RolePermissions, 'create')
    .mockRejectedValueOnce(new Error('Panne attribution suppression'));
  await expect(migrate(db)).rejects.toThrow('Panne attribution suppression');
  expect((await inspectDatabase(db)).history).toHaveLength(5);
  expect(await db.models.Permissions.count({ where: { name: 'payments.delete' } })).toBe(0);
  await migrate(db);
  const permission = await db.models.Permissions.findOne({ where: { name: 'payments.delete' } });
  expect(await db.models.RolePermissions.count({ where: { permissionId: permission.id } })).toBe(1);
  await migrate(db);
  expect(await snapshot()).toEqual(before);
});

test('down : verrou partagé, historique inconnu et échec DDL sans retrait de l’historique', async () => {
  await undoMigration(db, { confirmDatabase: safeName }); // 010
  await undoMigration(db, { confirmDatabase: safeName }); // 009
  await undoMigration(db, { confirmDatabase: safeName }); // 008
  await undoMigration(db, { confirmDatabase: safeName }); // 007
  await undoMigration(db, { confirmDatabase: safeName }); // 006 : permission sans DDL
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

test('migration 009 : récupération explicite des anciens lots complets, reprise sans doublon et rollback', async () => {
  await acceptMethod('cash');
  const patient = await paymentPatient();
  const tariff = (await administration.tariffs()).tariffs[0];
  const payment = await payments.create(
    session.token,
    session.csrfToken,
    paymentValues(patient.id, { tariffId: tariff.id, amountCents: tariff.amountCents }),
    randomUUID(),
  );
  const legacyId = randomUUID();
  const missingId = randomUUID();
  await db.sequelize.transaction(async (transaction) => {
    for (const [id, ids, totalCents] of [
      [legacyId, [payment.id], payment.amountCents],
      [missingId, [randomUUID()], 123],
    ])
      await db.models.IdempotencyKeys.create(
        {
          id,
          userId: admin.id,
          keyHash: id.replaceAll('-', '').padEnd(64, 'a'),
          requestHash: id.replaceAll('-', '').padEnd(64, 'b'),
          result: { ids, totalCents },
        },
        { transaction },
      );
  });
  const before = await db.models.Payments.findAll({
    attributes: ['id', 'method', 'amountCents', 'bankDeposited', 'version'],
    order: [['id', 'ASC']],
    raw: true,
  });
  await undoMigration(db, { confirmDatabase: safeName }); // 010
  await undoMigration(db, { confirmDatabase: safeName }); // 009 only
  const spy = jest
    .spyOn(db.models.AuditLogs, 'create')
    .mockRejectedValueOnce(new Error('Panne audit récupération'));
  await expect(migrate(db)).rejects.toThrow('Panne audit récupération');
  spy.mockRestore();
  expect(await db.models.DepositSlips.count()).toBe(0);
  expect((await inspectDatabase(db)).history).toHaveLength(8);
  await migrate(db);
  await checkSchema(db);
  const recovered = await payments.depositSlip(session.token, legacyId);
  expect(recovered.reconstructed).toBe(true);
  expect(recovered.items[0].id).toBe(payment.id);
  expect(recovered.totalCents).toBe(payment.amountCents);
  await expect(payments.depositSlip(session.token, missingId)).rejects.toMatchObject({
    status: 404,
  });
  const count = await db.models.DepositSlips.count();
  const audits = await db.models.AuditLogs.count();
  const qi = db.sequelize.getQueryInterface();
  await db.sequelize.transaction((transaction) =>
    qi.bulkDelete(
      'SequelizeMeta',
      { name: ['202611070009-deposit-slips.js', '202611070010-deposit-action-permissions.js'] },
      { transaction },
    ),
  );
  await migrate(db);
  await migrate(db);
  expect(await db.models.DepositSlips.count()).toBe(count);
  expect(await db.models.AuditLogs.count()).toBe(audits);
  expect(await payments.depositSlip(session.token, legacyId)).toEqual(recovered);
  expect(
    await db.models.Payments.findAll({
      attributes: ['id', 'method', 'amountCents', 'bankDeposited', 'version'],
      order: [['id', 'ASC']],
      raw: true,
    }),
  ).toEqual(before);
});

test('down/up des dix migrations : colonnes, données conservées, permissions et reconstruction complète', async () => {
  const qi = db.sequelize.getQueryInterface();
  const undo = () => undoMigration(db, { confirmDatabase: safeName });
  const original = await inspectDatabase(db);
  const settingsBefore = await administration.settings();
  const patientsBefore = await db.models.Patients.count();
  const paymentsBefore = await db.models.Payments.count();
  expect(paymentsBefore).toBeGreaterThan(0);
  await undo(); // 010
  await undo(); // 009
  await undo(); // 008
  await undo(); // 007
  await undo(); // 006
  await undo();
  expect((await qi.describeTable('Settings')).defaultCalendarView).toBeUndefined();
  await expect(checkSchema(db)).rejects.toMatchObject({ status: 409 });
  await migrate(db);
  expect(await administration.settings()).toEqual({
    ...settingsBefore,
    defaultCalendarView: 'month',
  });
  await undo(); // 010
  await undo(); // 009
  await undo(); // 008
  await undo(); // 007
  await undo(); // 006
  await undo(); // 005
  await undo(); // 004
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
  for (let remaining = original.history.length - 1; remaining >= 0; remaining--) {
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
  expect(baseline.tariffs).toBeUndefined();
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
