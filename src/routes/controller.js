import { parse } from '../core/validation.js';
import { idInput } from './registry.js';
export function createControllers({ auth, patients, administration, payments }) {
  const token = (req) => req.cookies['osteopilot.access'];
  const csrf = (req) => req.get('X-CSRF-Token');
  const key = (req) => req.get('Idempotency-Key');
  const id = (req) => parse(idInput, req.params.id);
  return {
    login: async (req, res) => {
      const session = await auth.login(req.body.email, req.body.password);
      auth.cookie(res, session.token);
      return { user: session.user, csrfToken: session.csrfToken };
    },
    me: (req) => ({
      user: req.context.publicUser,
      csrfToken: auth.csrfToken(req.context.session.id),
    }),
    refresh: async (req, res) => {
      const session = await auth.refresh(token(req), csrf(req));
      auth.cookie(res, session.token);
      return { user: session.user };
    },
    logout: async (req, res) => {
      const result = await auth.logout(token(req), csrf(req));
      auth.clearCookie(res);
      return result;
    },
    paymentsList: (req) => payments.list(req.query),
    paymentsSummary: (req) => payments.summary(req.query),
    paymentPatients: (req) => payments.patients(req.query),
    paymentsCreate: (req) => payments.create(token(req), csrf(req), req.body, key(req)),
    patientsList: (req) => patients.list(req.query),
    patientsCreate: (req) => patients.create(token(req), csrf(req), req.body, key(req)),
    patientGet: (req) => patients.get(id(req)),
    patientUpdate: (req) => patients.update(token(req), csrf(req), id(req), req.body),
    patientStatus: (req) => patients.setActive(token(req), csrf(req), id(req), req.body),
    patientArchive: (req) => patients.update(token(req), csrf(req), id(req), req.body, true),
    importPreview: async (req) => {
      const result = await patients.preview(req.body.csv);
      return {
        valid: result.valid,
        total: result.total,
        fingerprint: result.fingerprint,
        errors: result.errors,
        preview: result.patients.slice(0, 10),
      };
    },
    importConfirm: (req) =>
      patients.import(token(req), csrf(req), req.body.csv, req.body.fingerprint, key(req)),
    export: async (req, res) => {
      const csv = await patients.export(token(req), csrf(req));
      res.type('text/csv; charset=utf-8').attachment('osteopilot-patients.csv').send(csv);
    },
    usersList: (req) => administration.list('Users', req.query),
    rolesList: (req) => administration.list('Roles', req.query),
    permissionsList: (req) => administration.list('Permissions', req.query),
    userCreate: (req) => administration.saveUser(token(req), csrf(req), null, req.body),
    userUpdate: (req) => administration.saveUser(token(req), csrf(req), id(req), req.body),
    roleCreate: (req) => administration.saveRole(token(req), csrf(req), null, req.body),
    roleUpdate: (req) => administration.saveRole(token(req), csrf(req), id(req), req.body),
    permissionsUpdate: (req) =>
      administration.setPermissions(token(req), csrf(req), id(req), req.body),
    settingsGet: () => administration.settings(),
    settingsUpdate: (req) => administration.saveSettings(token(req), csrf(req), req.body),
    paymentMethodUpdate: (req) =>
      administration.changePaymentMethod(token(req), csrf(req), req.body),
    history: (req) => administration.history(req.query),
  };
}
