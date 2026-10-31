import { removeColumns, finishDown } from '../src/core/database/migration-rollback.js';
import { randomUUID } from 'node:crypto';
import { definitions } from '../src/core/database/schema.js';
export const migrationName = '202610290004-payment-bank-deposits.js';
export async function up(db) {
  const qi = db.sequelize.getQueryInterface();
  const columns = await qi.describeTable('Payments');
  for (const name of ['bankDeposited', 'version']) {
    if (!columns[name]) await qi.addColumn('Payments', name, definitions.Payments[name]);
  }
  await db.sequelize.transaction(async (transaction) => {
    const name = 'payments.deposit';
    let permission = await db.models.Permissions.findOne({ where: { name }, transaction });
    if (!permission)
      permission = await db.models.Permissions.create({ id: randomUUID(), name }, { transaction });
    const admins = await db.models.Roles.findAll({
      where: { system: true, name: 'ADMIN' },
      attributes: ['id'],
      transaction,
    });
    for (const role of admins) {
      const where = { roleId: role.id, permissionId: permission.id };
      if (!(await db.models.RolePermissions.findOne({ where, transaction })))
        await db.models.RolePermissions.create(where, { transaction });
    }
    await qi.bulkInsert('SequelizeMeta', [{ name: migrationName }], { transaction });
  });
}

export async function down(db) {
  await removeColumns(db, 'Payments', ['bankDeposited', 'version']);
  await finishDown(db, migrationName, ['payments.deposit']);
}
