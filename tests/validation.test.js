import { createEnvironment } from '../src/config/env.js';
import { parse } from '../src/core/validation.js';
import { patientInput, patientQuery } from '../src/modules/patients/patient.validator.js';
import { parseCsv, exportCsv } from '../src/modules/patients/csv.js';
import { duplicateKey } from '../src/modules/patients/patient.service.js';
import { publicUser } from '../src/modules/users/user.model.js';
import { requireTransaction } from '../src/core/database/transaction.js';
import { logDenial } from '../src/core/security-logger.js';
const patient = { firstName: 'Fictif', lastName: 'Exemple' };
test('champs stricts et données minimales', () => {
  expect(parse(patientInput, patient)).toMatchObject({ email: '', phone: '', address: '' });
  expect(() => parse(patientInput, { ...patient, diagnosis: 'interdit' })).toThrow();
  expect(() => parse(patientInput, { ...patient, firstName: '' })).toThrow();
  expect(() => parse(patientInput, { ...patient, phone: '<script>' })).toThrow();
});
test.each([{ limit: 101 }, { page: -1 }, { sort: 'passwordHash' }, { direction: 'DROP' }])(
  'pagination et tri refusés : %p',
  (query) => {
    expect(() => parse(patientQuery, query)).toThrow();
  },
);
test('doublons normalisés sans données personnelles en clé', () => {
  const p = parse(patientInput, patient);
  const a = duplicateKey(p);
  expect(a).toMatch(/^[a-f0-9]{64}$/);
  expect(a).toBe(duplicateKey({ ...p, firstName: ' FICTIF ' }));
});
test('CSV borné, UTF-8 BOM, quoting et rapport par ligne sans valeurs', () => {
  const result = parseCsv(
    '\uFEFFlastName,firstName,phone,email,address\n"Exemple, Test",Fictif,,,\n',
  );
  expect(result.errors).toEqual([]);
  expect(result.patients[0].lastName).toBe('Exemple, Test');
  expect(() => parseCsv('nom,prenom\nTest,Fictif')).toThrow();
  expect(() => parseCsv('x'.repeat(524289))).toThrow();
  const bad = parseCsv('lastName,firstName,phone,email,address\nTest,,,,\n');
  expect(bad.errors[0].line).toBe(2);
  expect(JSON.stringify(bad.errors)).not.toContain('Test');
});
test.each(['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '  =cmd', '\t=cmd'])(
  'formule tableur neutralisée : %p',
  (value) => {
    expect(exportCsv([{ firstName: 'Fictif', lastName: value }])).toContain("'" + value);
  },
);
test('projections utilisateur sans secret', () => {
  const result = publicUser({ id: 'public', passwordHash: 'secret', Roles: [] });
  expect(result).not.toHaveProperty('passwordHash');
});
test('écriture hors transaction refusée', () => {
  expect(() => requireTransaction()).toThrow();
});
test('configuration production fail closed et test isolé', () => {
  expect(() => createEnvironment({ NODE_ENV: 'production' })).toThrow();
  expect(() =>
    createEnvironment(
      { NODE_ENV: 'test', DATABASE_NAME: 'osteopilot', DATABASE_USER: 'test' },
      { databaseOnly: true },
    ),
  ).toThrow();
  expect(() => createEnvironment({ NODE_ENV: 'test', TRUSTED_PROXIES: 'true' })).toThrow();
});
test('logger défaillant : refus non contourné et aucune donnée personnelle', () => {
  const lines = [];
  for (let i = 0; i < 5; i++) logDenial(403, (line) => lines.push(line));
  expect(lines[0]).toContain('repeated_denial');
  expect(() => {
    for (let i = 0; i < 5; i++)
      logDenial(403, () => {
        throw new Error();
      });
  }).not.toThrow();
});
