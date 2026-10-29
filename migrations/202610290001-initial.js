import { randomUUID } from 'node:crypto';
import { DataTypes as D } from 'sequelize';
import { definitions, baseAttributes, indexes } from '../src/core/database/schema.js';
import { permissions } from '../src/modules/permissions/permissions.js';
export const migrationName = '202610290001-initial.js';
export async function up(db) {
  const qi = db.sequelize.getQueryInterface();
  // DDL MySQL : commits implicites, jamais de fausse promesse de rollback.
  for (const [table, attributes] of Object.entries(definitions)) {
    await qi.createTable(
      table,
      { ...baseAttributes(), ...attributes },
      { engine: 'InnoDB', charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    for (const index of indexes[table] || []) await qi.addIndex(table, index.fields, index);
  }
  await qi.createTable(
    'SequelizeMeta',
    { name: { type: D.STRING(255), allowNull: false, primaryKey: true } },
    { engine: 'InnoDB', charset: 'utf8mb4' },
  );
  await db.sequelize.transaction(async (transaction) => {
    const stamp = () => ({ id: randomUUID(), createdAt: new Date(), updatedAt: new Date() });
    await qi.bulkInsert('Locks', [{ ...stamp(), name: 'writes' }], { transaction });
    await qi.bulkInsert(
      'Settings',
      [
        {
          ...stamp(),
          name: 'Mon cabinet',
          address: '',
          phone: '',
          email: '',
          timezone: 'Europe/Paris',
        },
      ],
      { transaction },
    );
    const roleId = randomUUID();
    await qi.bulkInsert('Roles', [{ ...stamp(), id: roleId, name: 'ADMIN', system: true }], {
      transaction,
    });
    const rows = permissions.map((name) => ({ ...stamp(), name }));
    await qi.bulkInsert('Permissions', rows, { transaction });
    await qi.bulkInsert(
      'RolePermissions',
      rows.map((p) => ({ ...stamp(), roleId, permissionId: p.id })),
      { transaction },
    );
    await qi.bulkInsert('SequelizeMeta', [{ name: migrationName }], { transaction });
  });
}
// Pas de down automatique : une restauration requiert une sauvegarde et une décision explicite.
