import { Sequelize } from 'sequelize';
import { createDatabaseLoggingOptions } from '../logger/database-logging.js';
import { requireTransaction } from './transaction.js';
import { definitions, baseAttributes, indexes } from './schema.js';

export function createDatabase(config) {
  const d = config.database;
  const sequelize = new Sequelize(d.name, d.user, d.password, {
    host: d.host,
    port: d.port,
    dialect: 'mysql',
    ...createDatabaseLoggingOptions(config),
    timezone: '+00:00',
    pool: { min: 0, max: 5 },
    dialectOptions: { connectTimeout: 5000 },
    define: { freezeTableName: true, engine: 'InnoDB' },
  });
  const models = Object.fromEntries(
    Object.entries(definitions).map(([table, attributes]) => [
      table,
      sequelize.define(
        table,
        {
          id: baseAttributes().id,
          ...Object.fromEntries(
            Object.entries(attributes).map(([key, attr]) => [
              key,
              { ...attr, ...(attr.references ? { references: { ...attr.references } } : {}) },
            ]),
          ),
        },
        {
          indexes: indexes[table] || [],
          hooks: {
            beforeSave: (_row, options) => requireTransaction(options.transaction),
            beforeDestroy: (_row, options) => requireTransaction(options.transaction),
            beforeBulkCreate: (_rows, options) => requireTransaction(options.transaction),
            beforeBulkUpdate: (options) => requireTransaction(options.transaction),
            beforeBulkDestroy: (options) => requireTransaction(options.transaction),
          },
        },
      ),
    ]),
  );
  const { Users, Roles, Permissions, UserRoles, RolePermissions } = models;
  Users.belongsToMany(Roles, { through: UserRoles, foreignKey: 'userId', otherKey: 'roleId' });
  Roles.belongsToMany(Permissions, {
    through: RolePermissions,
    foreignKey: 'roleId',
    otherKey: 'permissionId',
  });
  models.Payments.belongsTo(models.Patients, {
    as: 'patient',
    foreignKey: 'patientId',
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  });
  return { sequelize, models };
}
