import { Op } from 'sequelize';
import { requireTransaction } from '../../core/database/transaction.js';
export class PatientRepository {
  constructor(db) {
    this.model = db.models.Patients;
  }
  list(query) {
    const where = {};
    if (query.archived !== 'all') where.archived = query.archived === 'true';
    if (query.search)
      where[Op.or] = ['firstName', 'lastName', 'email', 'phone'].map((key) => ({
        [key]: { [Op.like]: '%' + query.search.replace(/[\\%_]/g, '\\$&') + '%' },
      }));
    return this.model.findAndCountAll({
      where,
      order: [
        [query.sort, query.direction],
        ['id', 'ASC'],
      ],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
  }
  find(id, transaction) {
    return this.model.findByPk(id, {
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
  }
  create(values, transaction) {
    requireTransaction(transaction);
    return this.model.create(values, { transaction });
  }
  update(row, values, transaction) {
    requireTransaction(transaction);
    return row.update(values, { transaction });
  }
}
