import { assert } from '../src/core/errors.js';
import { definitions } from '../src/core/database/schema.js';
import { removeColumns, finishDown } from '../src/core/database/migration-rollback.js';
export const migrationName = '202611070008-payment-cheque-number.js';
export async function up(db) {
  const qi = db.sequelize.getQueryInterface();
  const columns = await qi.describeTable('Payments');
  if (!columns.chequeNumber)
    await qi.addColumn('Payments', 'chequeNumber', definitions.Payments.chequeNumber);
  else
    assert(
      columns.chequeNumber.type.toUpperCase() === 'VARCHAR(30)' && columns.chequeNumber.allowNull,
      'Schéma : colonne Payments.chequeNumber divergente.',
      409,
    );
  await db.sequelize.transaction(async (transaction) => {
    await qi.bulkInsert('SequelizeMeta', [{ name: migrationName }], { transaction });
  });
}
export async function down(db) {
  await removeColumns(db, 'Payments', ['chequeNumber']);
  await finishDown(db, migrationName);
}
