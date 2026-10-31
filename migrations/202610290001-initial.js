import { randomUUID } from 'node:crypto';
import { DataTypes as D } from 'sequelize';
import { definitions, baseAttributes, indexes } from '../src/core/database/schema.js';
import { permissions } from '../src/modules/permissions/permissions.js';
export const migrationName = '202610290001-initial.js';
export async function up(db) {
  const qi = db.sequelize.getQueryInterface();
  // DDL MySQL : commits implicites, jamais de fausse promesse de rollback.
  for (const [table, currentAttributes] of Object.entries(definitions)) {
    // Les fonctionnalités suivantes appartiennent aux migrations 002 à 005.
    if (table === 'Payments') continue;
    const attributes = Object.fromEntries(
      Object.entries(currentAttributes).filter(
        ([field]) =>
          table !== 'Settings' || !['paymentMethods', 'defaultCalendarView'].includes(field),
      ),
    );
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
    const rows = permissions
      .filter((name) => !name.startsWith('payments.'))
      .map((name) => ({ ...stamp(), name }));
    await qi.bulkInsert('Permissions', rows, { transaction });
    await qi.bulkInsert(
      'RolePermissions',
      rows.map((p) => ({ ...stamp(), roleId, permissionId: p.id })),
      { transaction },
    );
    await qi.bulkInsert('SequelizeMeta', [{ name: migrationName }], { transaction });
  });
}
export async function down(db) {
  const qi = db.sequelize.getQueryInterface();
  // Ordre inverse des dépendances, sans désactiver les clés étrangères.
  const tables = await qi.showAllTables();
  for (const table of [
    'IdempotencyKeys',
    'AuditLogs',
    'Settings',
    'Patients',
    'LoginAttempts',
    'Sessions',
    'RolePermissions',
    'UserRoles',
    'Permissions',
    'Roles',
    'Users',
    'Locks',
    'SequelizeMeta',
  ]) {
    if (tables.some((name) => name.toLowerCase() === table.toLowerCase()))
      await qi.dropTable(table);
  }
}
