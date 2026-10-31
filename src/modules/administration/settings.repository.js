import { requireTransaction } from '../../core/database/transaction.js';
const attributes = [
  'id',
  'name',
  'address',
  'phone',
  'email',
  'timezone',
  'paymentMethods',
  'defaultCalendarView',
  'updatedAt',
];
export class SettingsRepository {
  constructor(db) {
    this.model = db.models.Settings;
  }
  calendar() {
    return this.model.findOne({ attributes: ['defaultCalendarView'] });
  }
  find(transaction) {
    return this.model.findOne({
      attributes,
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
  }
  update(row, values, transaction) {
    requireTransaction(transaction);
    return row.update(values, { transaction });
  }
}
export const publicSettings = (row) =>
  Object.fromEntries(
    attributes.map((field) => [
      field,
      field === 'paymentMethods' ? (row[field] ?? []) : row[field],
    ]),
  );
