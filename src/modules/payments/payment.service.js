import { slipItems, slipSummary, publicSlip } from './deposit-slip.js';
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
  depositHistoryQuery,
  paymentDepositCancelQuery,
  paymentDepositCancelInput,
  paymentDepositSelection,
  paymentDepositBatch,
  depositBatchLimit,
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
  async depositHistory(token, query) {
    query = parse(depositHistoryQuery, query);
    return this.db.sequelize.transaction(async (tx) => {
      const context = await this.auth.authenticate(token, tx);
      this.auth.permit(context, 'payments.read');
      return pageResult(await this.repository.slips(query, tx), query, slipSummary);
    });
  }
  async depositSlip(token, id) {
    id = parse(uuid, id);
    return this.db.sequelize.transaction(async (tx) => {
      const context = await this.auth.authenticate(token, tx);
      this.auth.permit(context, 'payments.read');
      const row = await this.repository.slip(id, tx);
      assert(row, 'Bordereau introuvable.', 404);
      return publicSlip(row);
    });
  }
  async cancellableDeposits(token, query) {
    const { method } = parse(paymentDepositCancelQuery, query);
    return this.db.sequelize.transaction(async (tx) => {
      const context = await this.auth.authenticate(token, tx);
      this.auth.permit(context, 'payments.read');
      this.auth.permit(context, 'payments.deposit');
      const rows = await this.repository.depositedByMethod(method, tx, depositBatchLimit + 1);
      assert(
        rows.length <= depositBatchLimit,
        'Trop de dépôts à annuler : contactez l’administrateur (5 000 maximum par opération).',
        422,
      );
      return { method, items: rows.map(({ id, version }) => ({ id, version })) };
    });
  }
  async cancelDeposits(token, csrf, values, key) {
    const input = parse(paymentDepositCancelInput, values);
    input.items.sort((a, b) => a.id.localeCompare(b.id));
    assert(
      typeof key === 'string' && /^[a-zA-Z0-9-]{16,100}$/.test(key),
      'Clé Idempotency-Key requise (16 à 100 caractères).',
      422,
    );
    return this.auth.write(token, csrf, 'payments.deposit', async (ctx, tx) => {
      this.auth.permit(ctx, 'payments.read');
      const keyHash = digest(key);
      const requestHash = digest(JSON.stringify({ operation: 'payments.cancel-deposits', input }));
      const existing = await this.idempotency.find(ctx.user.id, keyHash, tx);
      if (existing) {
        assert(
          existing.requestHash === requestHash,
          'Clé déjà utilisée pour une autre requête.',
          409,
        );
        return existing.result;
      }
      const rows = await this.repository.depositedByMethod(
        input.method,
        tx,
        depositBatchLimit + 1,
        true,
      );
      assert(rows.length > 0, 'Aucun paiement déposé pour ce type de paiement.', 422);
      const versions = new Map(input.items.map(({ id, version }) => [id, version]));
      assert(
        rows.length === input.items.length &&
          rows.every((row) => row.version === versions.get(row.id)),
        'Les dépôts ont changé. Actualisez la liste avant de confirmer leur annulation.',
        409,
      );
      const memo = await this.idempotency.create({ userId: ctx.user.id, keyHash, requestHash }, tx);
      for (const row of rows) {
        await this.repository.updateDeposit(
          row,
          { bankDeposited: false, version: row.version + 1 },
          tx,
        );
        await recordAudit(
          this.db,
          {
            actorId: ctx.user.id,
            action: 'payments.bank-deposit.unmark',
            entity: 'payment',
            entityId: row.id,
          },
          tx,
        );
      }
      const result = { count: rows.length };
      await this.idempotency.complete(memo, result, tx);
      return result;
    });
  }
  async depositPreview(token, csrf, values) {
    const input = parse(paymentDepositSelection, values);
    return this.auth.write(token, csrf, 'payments.deposit', async (ctx, tx) => {
      this.auth.permit(ctx, 'payments.read');
      const rows = await this.repository.depositSelection(input, tx, depositBatchLimit + 1);
      assert(
        rows.length <= depositBatchLimit,
        'Sélection trop grande : choisissez au maximum 5 000 paiements.',
        422,
      );
      assert(
        input.all || rows.length === input.ids.length,
        'La sélection a changé. Actualisez la liste.',
        409,
      );
      assert(rows.length > 0, 'Aucun paiement à déposer dans cette sélection.', 422);
      const cabinet = await this.settings.printIdentity(tx);
      assert(
        cabinet?.name?.trim(),
        'Renseignez le nom du cabinet dans le paramétrage avant d’imprimer.',
        422,
      );
      let totalCents = 0;
      const items = rows.map((row) => {
        totalCents += row.amountCents;
        assert(Number.isSafeInteger(totalCents), 'Montants hors limites.', 422);
        return {
          id: row.id,
          version: row.version,
          date: row.date,
          amountCents: row.amountCents,
          chequeNumber: input.method === 'cheque' ? (row.chequeNumber ?? null) : null,
          patient: { firstName: row.patient.firstName, lastName: row.patient.lastName },
        };
      });
      return { method: input.method, cabinetName: cabinet.name, items, totalCents };
    });
  }
  async depositBatch(token, csrf, values, key) {
    const input = parse(paymentDepositBatch, values);
    input.items.sort((a, b) => a.id.localeCompare(b.id));
    assert(
      typeof key === 'string' && /^[a-zA-Z0-9-]{16,100}$/.test(key),
      'Clé Idempotency-Key requise (16 à 100 caractères).',
      422,
    );
    return this.auth.write(token, csrf, 'payments.deposit', async (ctx, tx) => {
      this.auth.permit(ctx, 'payments.read');
      const keyHash = digest(key);
      const requestHash = digest(JSON.stringify({ operation: 'payments.deposit-batch', input }));
      const existing = await this.idempotency.find(ctx.user.id, keyHash, tx);
      if (existing) {
        assert(
          existing.requestHash === requestHash,
          'Clé déjà utilisée pour une autre requête.',
          409,
        );
        return existing.result;
      }
      const rows = await this.repository.depositRows(
        input.items.map((item) => item.id),
        tx,
      );
      const versions = new Map(input.items.map((item) => [item.id, item.version]));
      assert(
        rows.length === input.items.length &&
          rows.every(
            (row) =>
              row.method === input.method &&
              !row.bankDeposited &&
              row.version === versions.get(row.id),
          ),
        'La sélection a changé. Revenez à la liste pour préparer un nouveau bordereau.',
        409,
      );
      const memo = await this.idempotency.create({ userId: ctx.user.id, keyHash, requestHash }, tx);
      let totalCents = 0;
      for (const row of rows) {
        totalCents += row.amountCents;
        assert(Number.isSafeInteger(totalCents), 'Montants hors limites.', 422);
        await this.repository.updateDeposit(
          row,
          { bankDeposited: true, version: row.version + 1 },
          tx,
        );
        await recordAudit(
          this.db,
          {
            actorId: ctx.user.id,
            action: 'payments.bank-deposit.mark',
            entity: 'payment',
            entityId: row.id,
          },
          tx,
        );
      }
      const cabinet = await this.settings.printIdentity(tx);
      assert(cabinet?.name?.trim(), 'Renseignez le nom du cabinet avant d’imprimer.', 422);
      const items = slipItems(
        await this.repository.slipPayments(
          input.items.map(({ id }) => id),
          tx,
        ),
        input.method,
      );
      const archive = await this.repository.createSlip(
        {
          createdBy: ctx.user.id,
          method: input.method,
          cabinetName: cabinet.name,
          paymentCount: items.length,
          totalCents,
          items,
          reconstructed: false,
        },
        tx,
      );
      await recordAudit(
        this.db,
        {
          actorId: ctx.user.id,
          action: 'payments.deposit-slip.create',
          entity: 'deposit-slip',
          entityId: archive.id,
          count: items.length,
        },
        tx,
      );
      const result = {
        ids: rows.map((row) => row.id),
        totalCents,
        slip: publicSlip(await this.repository.slip(archive.id, tx)),
      };
      await this.idempotency.complete(memo, result, tx);
      return result;
    });
  }
  async list(query) {
    query = parse(paymentQuery, query);
    return this.db.sequelize.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ },
      async (tx) => {
        const rows = await this.repository.list(query, tx);
        const counts = await this.repository.depositCounts(tx);
        const pendingDeposits = { cash: 0, cheque: 0 };
        const depositedPayments = { cash: 0, cheque: 0 };
        for (const row of counts) {
          const target = row.bankDeposited ? depositedPayments : pendingDeposits;
          target[row.method] = Number(row.count);
        }
        return { ...pageResult(rows, query, publicPayment), pendingDeposits, depositedPayments };
      },
    );
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
      const tariff = settings?.tariffs?.find((tariff) => tariff.id === input.tariffId);
      if (!tariff)
        throw new AppError('Sélectionnez un tarif configuré dans le paramétrage.', 422, [
          { field: 'tariffId', message: 'Choisissez un tarif disponible.' },
        ]);
      if (tariff.amountCents !== input.amountCents)
        throw new AppError(
          'Le montant de ce tarif a changé. Sélectionnez à nouveau le tarif.',
          409,
          [{ field: 'tariffId', message: 'Le tarif a changé. Sélectionnez-le à nouveau.' }],
        );
      const patient = await this.repository.patient(input.patientId, tx);
      if (!patient || patient.archived)
        throw new AppError('Sélectionnez un patient actif.', 422, [
          { field: 'patientId', message: 'Sélectionnez un patient actif.' },
        ]);
      const memo = await this.idempotency.create({ userId: ctx.user.id, keyHash, requestHash }, tx);
      const payment = Object.fromEntries(
        ['patientId', 'date', 'method'].map((field) => [field, input[field]]),
      );
      const row = await this.repository.create(
        {
          ...payment,
          amountCents: tariff.amountCents,
          chequeNumber: input.chequeNumber ?? null,
          createdBy: ctx.user.id,
        },
        tx,
      );
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
