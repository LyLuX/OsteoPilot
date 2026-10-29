import { DataTypes as D } from 'sequelize';
export const auditAttributes = {
  actorId: { type: D.UUID, allowNull: true },
  action: { type: D.STRING(80), allowNull: false },
  entity: { type: D.STRING(40), allowNull: false },
  entityId: { type: D.UUID, allowNull: true },
  count: { type: D.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
};
