import { DataTypes as D } from 'sequelize';
import { patientAttributes } from '../../modules/patients/patient.model.js';
import { userAttributes } from '../../modules/users/user.model.js';
import { roleAttributes } from '../../modules/roles/role.model.js';
import { auditAttributes } from '../../modules/audit/audit.model.js';

const ref = (table) => ({
  type: D.UUID,
  allowNull: false,
  references: { model: table, key: 'id' },
  onDelete: 'RESTRICT',
  onUpdate: 'RESTRICT',
});
export const definitions = {
  Locks: { name: { type: D.STRING(30), allowNull: false, unique: true } },
  Users: userAttributes,
  Roles: roleAttributes,
  Permissions: { name: { type: D.STRING(80), allowNull: false, unique: true } },
  UserRoles: { userId: ref('Users'), roleId: ref('Roles') },
  RolePermissions: { roleId: ref('Roles'), permissionId: ref('Permissions') },
  Sessions: {
    userId: ref('Users'),
    tokenId: { type: D.UUID, allowNull: false, unique: true },
    csrfHash: { type: D.STRING(64), allowNull: false },
    lastActivityAt: { type: D.DATE, allowNull: false },
    expiresAt: { type: D.DATE, allowNull: false },
  },
  LoginAttempts: {
    keyHash: { type: D.STRING(64), allowNull: false, unique: true },
    attempts: { type: D.INTEGER.UNSIGNED, allowNull: false },
    windowAt: { type: D.DATE, allowNull: false },
  },
  Patients: patientAttributes,
  Settings: {
    name: { type: D.STRING(100), allowNull: false },
    address: { type: D.STRING(300), allowNull: false, defaultValue: '' },
    phone: { type: D.STRING(30), allowNull: false, defaultValue: '' },
    email: { type: D.STRING(254), allowNull: false, defaultValue: '' },
    timezone: { type: D.STRING(50), allowNull: false, defaultValue: 'Europe/Paris' },
  },
  AuditLogs: auditAttributes,
  IdempotencyKeys: {
    userId: ref('Users'),
    keyHash: { type: D.STRING(64), allowNull: false },
    requestHash: { type: D.STRING(64), allowNull: false },
    result: { type: D.JSON, allowNull: true },
  },
};
export const indexes = {
  UserRoles: [{ unique: true, fields: ['userId', 'roleId'] }],
  RolePermissions: [{ unique: true, fields: ['roleId', 'permissionId'] }],
  IdempotencyKeys: [{ unique: true, fields: ['userId', 'keyHash'] }],
  Patients: [{ fields: ['lastName', 'firstName'] }, { fields: ['archived'] }],
  Sessions: [{ fields: ['expiresAt'] }],
  AuditLogs: [
    { fields: ['createdAt', 'id'] },
    { fields: ['actorId'] },
    { fields: ['action', 'entity'] },
  ],
};
export const baseAttributes = () => ({
  id: { type: D.UUID, primaryKey: true, allowNull: false, defaultValue: D.UUIDV4 },
  createdAt: { type: D.DATE, allowNull: false },
  updatedAt: { type: D.DATE, allowNull: false },
});
