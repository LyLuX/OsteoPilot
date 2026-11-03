import { todayInParis } from '../../core/civil-date.js';
import { Transaction } from 'sequelize';
import { AppError, assert } from '../../core/errors.js';
import { parse, pageResult, uuid } from '../../core/validation.js';
import { digest } from '../auth/auth.service.js';
import { recordAudit } from '../audit/audit.service.js';
import { SettingsRepository } from '../administration/settings.repository.js';
import { paymentMethodCodes } from '../administration/payment-methods.js';
import { IdempotencyRepository } from '../../core/database/idempotency.repository.js';
import { PaymentRepository } from './payment.repository.js';
import {
  paymentInput,
  paymentDeleteInput,
  patientPaymentsQuery,
  paymentDepositInput,
  depositMethods,
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
  async remove(token, csrf, id, values) {
    id = parse(uuid, id);
    const input = parse(paymentDeleteInput, values);
    return this.auth.write(token, csrf, 'payments.delete', async (ctx, tx) => {
      const row = await this.repository.findForUpdate(id, tx);
      assert(row, 'Paiement introuvable.', 404);
      assert(
        row.version === input.version,
        'Ce paiement a changé. Actualisez la liste avant de le supprimer.',
        409,
      );
      await this.repository.remove(row, tx);
      await recordAudit(
        this.db,
        { actorId: ctx.user.id, action: 'payments.delete', entity: 'payment', entityId: id },
        tx,
      );
      return { id };
    });
  }
  async patientPayments(token, id, query) {
    id = parse(uuid, id);
    query = parse(patientPaymentsQuery, query);
    return this.db.sequelize.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ },
      async (tx) => {
        const context = await this.auth.authenticate(token, tx);
        this.auth.permit(context, 'patients.read');
        this.auth.permit(context, 'payments.read');
        assert(await this.repository.patientExists(id, tx), 'Patient introuvable.', 404);
        const result = await this.repository.patientPayments(id, query, tx);
        const rows = await this.repository.patientTotals(id, tx);
        const methods = Object.fromEntries(paymentMethodCodes.map((code) => [code, 0]));
        let totalCents = 0;
        for (const row of rows) {
          const cents = Number(row.amountCents);
          assert(
            Number.isSafeInteger(cents) && cents >= 0 && Number.isSafeInteger(totalCents + cents),
            'Montants hors limites.',
            422,
          );
          methods[row.method] = cents;
          totalCents += cents;
        }
        return { ...pageResult(result, query, publicPayment), summary: { totalCents, methods } };
      },
    );
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
  async setBankDeposit(token, csrf, id, values) {
    id = parse(uuid, id);
    const input = parse(paymentDepositInput, values);
    return this.auth.write(token, csrf, 'payments.deposit', async (ctx, tx) => {
      const row = await this.repository.findForUpdate(id, tx);
      assert(row, 'Paiement introuvable.', 404);
      assert(
        depositMethods.includes(row.method),
        'Le dépôt en banque concerne uniquement les espèces et les chèques.',
        422,
      );
      assert(
        row.version === input.version,
        'Ce paiement a changé. La liste doit être actualisée avant de réessayer.',
        409,
      );
      if (row.bankDeposited === input.bankDeposited) return publicPayment(row);
      await this.repository.updateDeposit(
        row,
        { bankDeposited: input.bankDeposited, version: row.version + 1 },
        tx,
      );
      await recordAudit(
        this.db,
        {
          actorId: ctx.user.id,
          action: input.bankDeposited
            ? 'payments.bank-deposit.mark'
            : 'payments.bank-deposit.unmark',
          entity: 'payment',
          entityId: row.id,
        },
        tx,
      );
      return publicPayment(row);
    });
  }
  async create(token, csrf, values, key) {
    const input = parse(paymentInput, values);
    assert(
      typeof key === 'string' && /^[a-zA-Z0-9-]{16,100}$/.test(key),
      'Clé Idempotency-Key requise (16 à 100 caractères).',
      422,
    );
    return this.auth.write(token, csrf, 'payments.create', async (ctx, tx) => {
      if (input.date > todayInParis()) {
        const message = 'La date du paiement ne peut pas être postérieure à aujourd’hui.';
        throw new AppError(message, 422, [{ field: 'date', message }]);
      }
      const keyHash = digest(key);
      const requestHash = digest(JSON.stringify({ operation: 'payments.create', input }));
      const existing = await this.idempotency.find(ctx.user.id, keyHash, tx);
      if (existing) {
        assert(
          existing.requestHash === requestHash,
          'Clé déjà utilisée pour une autre requête.',
          409,
        );
        const row = await this.repository.findForUpdate(existing.result.id, tx);
        assert(
          row,
          'Ce paiement a été supprimé. La clé de création ne peut pas être réutilisée.',
          409,
        );
        return publicPayment(row);
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
