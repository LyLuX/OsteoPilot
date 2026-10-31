import { removeColumns, finishDown } from '../src/core/database/migration-rollback.js';
import { DataTypes as D } from 'sequelize';
import { assert } from '../src/core/errors.js';
export const migrationName = '202610290002-settings-payment-methods.js';
export async function up(db) {
  const qi = db.sequelize.getQueryInterface();
  const description = await qi.describeTable('Settings');
  if (!description.paymentMethods) {
    // DDL MySQL avec commit implicite ; colonne nullable pour préserver les lignes existantes.
    await qi.addColumn('Settings', 'paymentMethods', { type: D.JSON, allowNull: true });
  } else {
    assert(
      description.paymentMethods.type.toUpperCase() === 'JSON' &&
        description.paymentMethods.allowNull,
      'Schéma : colonne Settings.paymentMethods divergente.',
      409,
    );
  }
  await db.sequelize.transaction(async (transaction) => {
    await qi.bulkInsert('SequelizeMeta', [{ name: migrationName }], { transaction });
  });
}

export async function down(db) {
  await removeColumns(db, 'Settings', ['paymentMethods']);
  await finishDown(db, migrationName);
}
