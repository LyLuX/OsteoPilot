import { randomUUID } from 'node:crypto';
import { finishDown } from '../src/core/database/migration-rollback.js';
export const migrationName = '202611070010-deposit-action-permissions.js';
const names = [
  'payments.deposit.cancel',
  'payments.deposits.read',
  'payments.deposits.reprint',
  'payments.deposits.delete',
];
export async function up(db) {
  await db.sequelize.transaction(async (transaction) => {
    const admins = await db.models.Roles.findAll({
      where: { system: true, name: 'ADMIN' },
      attributes: ['id'],
      transaction,
    });
    for (const name of names) {
      let permission = await db.models.Permissions.findOne({ where: { name }, transaction });
      if (!permission)
        permission = await db.models.Permissions.create(
          { id: randomUUID(), name },
          { transaction },
        );
      for (const role of admins) {
        const where = { roleId: role.id, permissionId: permission.id };
        if (!(await db.models.RolePermissions.findOne({ where, transaction })))
          await db.models.RolePermissions.create(where, { transaction });
      }
    }
    await db.sequelize
      .getQueryInterface()
      .bulkInsert('SequelizeMeta', [{ name: migrationName }], { transaction });
  });
}
export async function down(db) {
  await finishDown(db, migrationName, names);
}
