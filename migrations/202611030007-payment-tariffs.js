import { DataTypes as D } from 'sequelize';
import { assert } from '../src/core/errors.js';
import { initialTariffs, tariffCatalog } from '../src/modules/administration/tariffs.js';
import { removeColumns, finishDown } from '../src/core/database/migration-rollback.js';
export const migrationName = '202611030007-payment-tariffs.js';
export async function up(db) {
  const qi = db.sequelize.getQueryInterface();
  const columns = await qi.describeTable('Settings');
  if (!columns.tariffs)
    await qi.addColumn('Settings', 'tariffs', { type: D.JSON, allowNull: true });
  else
    assert(
      columns.tariffs.type.toUpperCase() === 'JSON' && columns.tariffs.allowNull,
      'Schéma : colonne Settings.tariffs divergente.',
      409,
    );
  await db.sequelize.transaction(async (transaction) => {
    const row = await db.models.Settings.findOne({
      attributes: ['id', 'tariffs'],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    assert(row, 'Schéma : paramètres du cabinet absents.', 409);
    assert(
      row.tariffs === null || tariffCatalog.safeParse(row.tariffs).success,
      'Schéma : catalogue de tarifs divergent.',
      409,
    );
    if (row.tariffs === null)
      await row.update({ tariffs: initialTariffs() }, { transaction, silent: true });
    await qi.bulkInsert('SequelizeMeta', [{ name: migrationName }], { transaction });
  });
}
export async function down(db) {
  await removeColumns(db, 'Settings', ['tariffs']);
  await finishDown(db, migrationName);
}
