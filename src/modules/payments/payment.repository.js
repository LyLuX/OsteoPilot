import { Op, fn, col } from 'sequelize';
import { requireTransaction } from '../../core/database/transaction.js';
const attributes = ['id', 'patientId', 'date', 'method', 'amountCents', 'createdAt'];
export class PaymentRepository {
  constructor(db) {
    this.models = db.models;
  }
  create(values, transaction) {
    requireTransaction(transaction);
    return this.models.Payments.create(values, { transaction });
  }
  list(query) {
    return this.models.Payments.findAndCountAll({
      attributes,
      where: { date: query.date ?? { [Op.between]: [query.from, query.to] } },
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
