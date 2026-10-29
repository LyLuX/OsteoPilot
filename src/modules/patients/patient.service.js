import { createHash } from 'node:crypto';
import { Op } from 'sequelize';
import { assert } from '../../core/errors.js';
import { parse, pageResult } from '../../core/validation.js';
import { recordAudit } from '../audit/audit.service.js';
import { digest } from '../auth/auth.service.js';
import { PatientRepository } from './patient.repository.js';
import {
  patientInput,
  patientUpdate,
  patientStatus,
  patientQuery,
  publicPatient,
} from './patient.validator.js';
import { parseCsv, exportCsv } from './csv.js';
export function duplicateKey(p) {
  const normalized = [p.lastName, p.firstName, p.email, p.phone].map((s) =>
    s.normalize('NFKC').trim().toLocaleLowerCase('fr'),
  );
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
export class PatientService {
  constructor(db, auth) {
    this.db = db;
    this.auth = auth;
    this.repository = new PatientRepository(db);
  }
  async list(query) {
    query = parse(patientQuery, query);
    return pageResult(await this.repository.list(query), query, publicPatient);
  }
  async get(id) {
    const row = await this.repository.find(id);
    assert(row, 'Patient introuvable.', 404);
    return publicPatient(row);
  }
  async idempotent(context, transaction, key, operation, request, work) {
    assert(
      typeof key === 'string' && /^[a-zA-Z0-9-]{16,100}$/.test(key),
      'Clé Idempotency-Key requise (16 à 100 caractères).',
      422,
    );
    const keyHash = digest(key);
    const requestHash = digest(JSON.stringify({ operation, request }));
    const model = this.db.models.IdempotencyKeys;
    const existing = await model.findOne({
      where: { userId: context.user.id, keyHash },
      transaction,
    });
    if (existing) {
      assert(
        existing.requestHash === requestHash,
        'Clé déjà utilisée pour une autre requête.',
        409,
      );
      return existing.result;
    }
    const row = await model.create(
      { userId: context.user.id, keyHash, requestHash },
      { transaction },
    );
    const result = await work();
    await row.update({ result }, { transaction });
    return result;
  }
  async create(token, csrf, values, key) {
    values = parse(patientInput, values);
    return this.auth.write(token, csrf, 'patients.create', (ctx, tx) =>
      this.idempotent(ctx, tx, key, 'patients.create', values, async () => {
        const row = await this.repository.create(
          { ...values, duplicateKey: duplicateKey(values) },
          tx,
        );
        await recordAudit(
          this.db,
          { actorId: ctx.user.id, action: 'patients.create', entity: 'patient', entityId: row.id },
          tx,
        );
        return publicPatient(row);
      }),
    );
  }
  async update(token, csrf, id, values, archive = false) {
    const input = archive
      ? parse(patientUpdate.pick({ version: true }), values)
      : parse(patientUpdate, values);
    return this.auth.write(
      token,
      csrf,
      archive ? 'patients.archive' : 'patients.update',
      async (ctx, tx) => {
        const row = await this.repository.find(id, tx);
        assert(row, 'Patient introuvable.', 404);
        assert(
          row.version === input.version,
          'Cette fiche a changé. Rechargez-la avant de modifier.',
          409,
        );
        const { version, ...fields } = input;
        const changes = archive
          ? { archived: true }
          : { ...fields, duplicateKey: duplicateKey(fields) };
        await this.repository.update(row, { ...changes, version: version + 1 }, tx);
        await recordAudit(
          this.db,
          {
            actorId: ctx.user.id,
            action: archive ? 'patients.archive' : 'patients.update',
            entity: 'patient',
            entityId: id,
          },
          tx,
        );
        return publicPatient(row);
      },
    );
  }
  async setActive(token, csrf, id, values) {
    const input = parse(patientStatus, values);
    return this.auth.write(token, csrf, 'patients.archive', async (ctx, tx) => {
      const row = await this.repository.find(id, tx);
      assert(row, 'Patient introuvable.', 404);
      assert(
        row.version === input.version,
        'Cette fiche a changé. Rechargez-la avant de modifier.',
        409,
      );
      await this.repository.update(row, { archived: !input.active, version: row.version + 1 }, tx);
      await recordAudit(
        this.db,
        {
          actorId: ctx.user.id,
          action: input.active ? 'patients.activate' : 'patients.archive',
          entity: 'patient',
          entityId: id,
        },
        tx,
      );
      return publicPatient(row);
    });
  }
  async preview(csv, transaction) {
    const parsed = parseCsv(csv);
    const seen = new Set();
    const keys = parsed.patients.filter(Boolean).map(duplicateKey);
    const existing = await this.db.models.Patients.findAll({
      where: { duplicateKey: { [Op.in]: keys } },
      attributes: ['duplicateKey'],
      transaction,
    });
    const known = new Set(existing.map((p) => p.duplicateKey));
    parsed.patients.forEach((p, i) => {
      if (!p) return;
      const key = duplicateKey(p);
      if (seen.has(key) || known.has(key))
        parsed.errors.push({
          line: i + 2,
          fields: [],
          reason: 'Doublon : aucun écrasement autorisé.',
        });
      seen.add(key);
    });
    return {
      ...parsed,
      valid: parsed.errors.length === 0,
      total: parsed.patients.length,
      fingerprint: digest(csv),
    };
  }
  async import(token, csrf, csv, fingerprint, key) {
    assert(digest(csv) === fingerprint, 'Le fichier a changé. Recommencez l’aperçu.', 409);
    return this.auth.write(token, csrf, 'patients.import', (ctx, tx) =>
      this.idempotent(ctx, tx, key, 'patients.import', { fingerprint }, async () => {
        const preview = await this.preview(csv, tx);
        assert(preview.valid, 'Import refusé : corrigez toutes les lignes.', 422);
        for (const p of preview.patients)
          await this.repository.create({ ...p, duplicateKey: duplicateKey(p) }, tx);
        await recordAudit(
          this.db,
          {
            actorId: ctx.user.id,
            action: 'patients.import',
            entity: 'patient',
            count: preview.total,
          },
          tx,
        );
        return { imported: preview.total };
      }),
    );
  }
  async export(token, csrf) {
    return this.auth.write(token, csrf, 'patients.export', async (ctx, tx) => {
      const rows = await this.db.models.Patients.findAll({
        where: { archived: false },
        limit: 10001,
        order: [
          ['lastName', 'ASC'],
          ['id', 'ASC'],
        ],
        transaction: tx,
      });
      assert(
        rows.length <= 10000,
        'Export limité à 10 000 patients. Réduisez le périmètre avant export.',
        422,
      );
      const csv = exportCsv(rows);
      await recordAudit(
        this.db,
        { actorId: ctx.user.id, action: 'patients.export', entity: 'patient', count: rows.length },
        tx,
      );
      return csv;
    });
  }
}
