import { DataTypes as D } from 'sequelize';
export const roleAttributes = {
  name: { type: D.STRING(80), allowNull: false, unique: true },
  system: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
};
