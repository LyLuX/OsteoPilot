import { Op, fn, col } from 'sequelize';
import { requireTransaction } from '../../core/database/transaction.js';
const attributes = [
  'id',
  'patientId',
  'date',
  'method',
  'amountCents',
  'createdAt',
  'bankDeposited',
  'chequeNumber',
  'version',
];
export class PaymentRepository {
  constructor(db) {
    this.models = db.models;
  }
  createSlip(values, transaction) {
    requireTransaction(transaction);
    return this.models.DepositSlips.create(values, { transaction });
  }
  slips(query, transaction) {
    return this.models.DepositSlips.findAndCountAll({
      attributes: [
        'id',
        'method',
        'cabinetName',
        'createdAt',
        'paymentCount',
        'totalCents',
        'reconstructed',
      ],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      transaction,
    });
  }
  slip(id, transaction) {
    return this.models.DepositSlips.findByPk(id, {
      attributes: [
        'id',
        'method',
        'cabinetName',
        'createdAt',
        'paymentCount',
        'totalCents',
        'reconstructed',
        'items',
      ],
      transaction,
    });
  }
  slipPayments(ids, transaction) {
    return this.models.Payments.findAll({
      attributes: ['id', 'date', 'createdAt', 'version', 'amountCents', 'chequeNumber'],
      where: { id: { [Op.in]: ids } },
      include: [
        { model: this.models.Patients, as: 'patient', attributes: ['firstName', 'lastName'] },
      ],
      transaction,
    });
  }
  depositSelection(selection, transaction, limit) {
    requireTransaction(transaction);
    const where = { method: selection.method, bankDeposited: false };
    if (selection.all && selection.excluded.length) where.id = { [Op.notIn]: selection.excluded };
    if (!selection.all) where.id = { [Op.in]: selection.ids };
    return this.models.Payments.findAll({
      attributes: ['id', 'version', 'date', 'amountCents', 'chequeNumber'],
      where,
      transaction,
      limit,
      include: [
        { model: this.models.Patients, as: 'patient', attributes: ['firstName', 'lastName'] },
      ],
      order: [
        ['date', 'DESC'],
        ['createdAt', 'DESC'],
        ['id', 'ASC'],
      ],
    });
  }
  depositedByMethod(method, transaction, limit, lock = false) {
    requireTransaction(transaction);
    return this.models.Payments.findAll({
      attributes: ['id', 'version'],
      where: { method, bankDeposited: true },
      order: [['id', 'ASC']],
      limit,
      transaction,
      ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    });
  }
  depositRows(ids, transaction) {
    requireTransaction(transaction);
    return this.models.Payments.findAll({
      attributes,
      where: { id: { [Op.in]: ids } },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }
  create(values, transaction) {
    requireTransaction(transaction);
    return this.models.Payments.create(values, { transaction });
  }
  findForUpdate(id, transaction) {
    requireTransaction(transaction);
    return this.models.Payments.findByPk(id, {
      attributes,
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }
  remove(row, transaction) {
    requireTransaction(transaction);
    return row.destroy({ transaction });
  }
  patientExists(id, transaction) {
    return this.models.Patients.findByPk(id, { attributes: ['id'], transaction });
  }
  patientPayments(id, query, transaction) {
    return this.models.Payments.findAndCountAll({
      attributes,
      where: { patientId: id },
      transaction,
      order: [
        ['date', 'DESC'],
        ['createdAt', 'DESC'],
        ['id', 'ASC'],
      ],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
  }
  patientTotals(id, transaction) {
    return this.models.Payments.findAll({
      attributes: ['method', [fn('SUM', col('amountCents')), 'amountCents']],
      where: { patientId: id },
      group: ['method'],
      raw: true,
      transaction,
    });
  }
  updateDeposit(row, values, transaction) {
    requireTransaction(transaction);
    return row.update(values, { transaction });
  }
  depositCounts(transaction) {
    return this.models.Payments.findAll({
      attributes: ['method', 'bankDeposited', [fn('COUNT', col('id')), 'count']],
      where: { method: { [Op.in]: ['cash', 'cheque'] } },
      group: ['method', 'bankDeposited'],
      raw: true,
      transaction,
    });
  }
  list(query, transaction) {
    return this.models.Payments.findAndCountAll({
      attributes,
      transaction,
      where: query.date
        ? { date: query.date }
        : query.from
          ? { date: { [Op.between]: [query.from, query.to] } }
          : {},
      include: [
        { model: this.models.Patients, as: 'patient', attributes: ['id', 'firstName', 'lastName'] },
      ],
      order: [
        ['date', 'DESC'],
        ['createdAt', 'DESC'],
        ['id', 'ASC'],
      ],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
  }
  totals({ from, to }) {
    return this.models.Payments.findAll({
      attributes: ['date', 'method', [fn('SUM', col('amountCents')), 'amountCents']],
      where: { date: { [Op.between]: [from, to] } },
      group: ['date', 'method'],
      raw: true,
    });
  }
  patient(id, transaction) {
    return this.models.Patients.findByPk(id, {
      attributes: ['id', 'archived'],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }
  patients(query) {
    const where = { archived: false };
    if (query.search)
      where[Op.or] = ['firstName', 'lastName'].map((key) => ({
        [key]: { [Op.like]: '%' + query.search.replace(/[\\%_]/g, '\\$&') + '%' },
      }));
    return this.models.Patients.findAndCountAll({
      attributes: ['id', 'firstName', 'lastName'],
      where,
      order: [
        ['lastName', 'ASC'],
        ['firstName', 'ASC'],
        ['id', 'ASC'],
      ],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
  }
}
