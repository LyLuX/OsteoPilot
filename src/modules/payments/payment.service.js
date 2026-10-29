import { AppError, assert } from '../../core/errors.js';
import { parse, pageResult } from '../../core/validation.js';
import { digest } from '../auth/auth.service.js';
import { recordAudit } from '../audit/audit.service.js';
import { SettingsRepository } from '../administration/settings.repository.js';
import { paymentMethodCodes } from '../administration/payment-methods.js';
import { IdempotencyRepository } from '../../core/database/idempotency.repository.js';
import { PaymentRepository } from './payment.repository.js';
import {
  paymentInput,
  paymentQuery,
  paymentSummaryQuery,
  paymentPatientQuery,
  publicPayment,
} from './payment.validator.js';
export class PaymentService {
  constructor(db, auth) {
    this.db = db;
    this.auth = auth;
    this.repository = new PaymentRepository(db);
    this.settings = new SettingsRepository(db);
    this.idempotency = new IdempotencyRepository(db);
  }
  async list(query) {
    query = parse(paymentQuery, query);
    return pageResult(await this.repository.list(query), query, publicPayment);
  }
  async patients(query) {
    query = parse(paymentPatientQuery, query);
    return pageResult(await this.repository.patients(query), query, (p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
    }));
  }
  async summary(query) {
    query = parse(paymentSummaryQuery, query);
    const [rows, settings] = await Promise.all([
      this.repository.totals(query),
      this.settings.find(),
    ]);
    const days = new Map();
    for (const row of rows) {
      const day = days.get(row.date) || {
        date: row.date,
        methods: Object.fromEntries(paymentMethodCodes.map((code) => [code, 0])),
        totalCents: 0,
      };
      const cents = Number(row.amountCents);
      assert(
        Number.isSafeInteger(cents) && cents >= 0 && Number.isSafeInteger(day.totalCents + cents),
        'Montants hors limites.',
        422,
      );
      day.methods[row.method] = cents;
      day.totalCents += cents;
      days.set(row.date, day);
    }
    return {
      days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      acceptedMethods: settings?.paymentMethods ?? [],
    };
  }
  async create(token, csrf, values, key) {
    const input = parse(paymentInput, values);
    assert(
      typeof key === 'string' && /^[a-zA-Z0-9-]{16,100}$/.test(key),
      'Clé Idempotency-Key requise (16 à 100 caractères).',
      422,
    );
    return this.auth.write(token, csrf, 'payments.create', async (ctx, tx) => {
      const keyHash = digest(key);
      const requestHash = digest(JSON.stringify({ operation: 'payments.create', input }));
      const existing = await this.idempotency.find(ctx.user.id, keyHash, tx);
      if (existing) {
        assert(
          existing.requestHash === requestHash,
          'Clé déjà utilisée pour une autre requête.',
          409,
        );
        return existing.result;
      }
      const settings = await this.settings.find(tx);
      if (!settings?.paymentMethods?.includes(input.method))
        throw new AppError('Ce moyen de paiement n’est pas accepté par le cabinet.', 422, [
          { field: 'method', message: 'Choisissez un moyen de paiement accepté.' },
        ]);
      const patient = await this.repository.patient(input.patientId, tx);
      if (!patient || patient.archived)
        throw new AppError('Sélectionnez un patient actif.', 422, [
          { field: 'patientId', message: 'Sélectionnez un patient actif.' },
        ]);
      const memo = await this.idempotency.create({ userId: ctx.user.id, keyHash, requestHash }, tx);
      const row = await this.repository.create({ ...input, createdBy: ctx.user.id }, tx);
      await recordAudit(
        this.db,
        { actorId: ctx.user.id, action: 'payments.create', entity: 'payment', entityId: row.id },
        tx,
      );
      const result = publicPayment(row);
      await this.idempotency.complete(memo, result, tx);
      return result;
    });
  }
}
