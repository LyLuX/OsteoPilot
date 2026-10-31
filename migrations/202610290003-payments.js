import { finishDown } from '../src/core/database/migration-rollback.js';
import { randomUUID } from 'node:crypto';
import { definitions, baseAttributes, indexes } from '../src/core/database/schema.js';
export const migrationName = '202610290003-payments.js';
export async function up(db) {
  const qi = db.sequelize.getQueryInterface();
  const tables = await qi.showAllTables();
  if (!tables.some((name) => name.toLowerCase() === 'payments')) {
    await qi.createTable(
      'Payments',
      {
        ...baseAttributes(),
        ...Object.fromEntries(
          Object.entries(definitions.Payments).filter(
            ([name]) => !['bankDeposited', 'version'].includes(name),
          ),
        ),
      },
      { engine: 'InnoDB', charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
  }
  const found = await qi.showIndex('Payments');
  for (const index of indexes.Payments) {
    if (!found.some((i) => i.fields.map((f) => f.attribute).join(',') === index.fields.join(',')))
      await qi.addIndex('Payments', index.fields, index);
  }
  await db.sequelize.transaction(async (transaction) => {
    const admins = await db.models.Roles.findAll({
      where: { system: true, name: 'ADMIN' },
      attributes: ['id'],
      transaction,
    });
    for (const name of ['payments.read', 'payments.create']) {
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
    await qi.bulkInsert('SequelizeMeta', [{ name: migrationName }], { transaction });
  });
}

export async function down(db) {
  const qi = db.sequelize.getQueryInterface();
  const tables = await qi.showAllTables();
  if (tables.some((name) => name.toLowerCase() === 'payments')) await qi.dropTable('Payments');
  await finishDown(db, migrationName, ['payments.read', 'payments.create'], true);
}
