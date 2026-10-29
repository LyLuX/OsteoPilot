import { DataTypes as D } from 'sequelize';
export const userAttributes = {
  firstName: { type: D.STRING(100), allowNull: false },
  lastName: { type: D.STRING(100), allowNull: false },
  email: { type: D.STRING(254), allowNull: false, unique: true },
  passwordHash: { type: D.STRING(100), allowNull: false },
  active: { type: D.BOOLEAN, allowNull: false, defaultValue: true },
};
export const publicUser = (u) => ({
  id: u.id,
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email,
  active: u.active,
  roleIds: (u.Roles || []).map((r) => r.id),
  roles: (u.Roles || []).map((r) => r.name),
  permissions: [
    ...new Set((u.Roles || []).flatMap((r) => (r.Permissions || []).map((p) => p.name))),
  ],
});
