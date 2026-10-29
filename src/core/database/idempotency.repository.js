import { requireTransaction } from './transaction.js';
export class IdempotencyRepository {
  constructor(db) {
    this.model = db.models.IdempotencyKeys;
  }
  find(userId, keyHash, transaction) {
    requireTransaction(transaction);
    return this.model.findOne({
      where: { userId, keyHash },
      attributes: ['requestHash', 'result'],
      transaction,
    });
  }
  create(values, transaction) {
    requireTransaction(transaction);
    return this.model.create(values, { transaction });
  }
  complete(row, result, transaction) {
    requireTransaction(transaction);
    return row.update({ result }, { transaction });
  }
}
