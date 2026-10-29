import { DataTypes as D } from 'sequelize';
export const patientAttributes = {
  firstName: { type: D.STRING(100), allowNull: false },
  lastName: { type: D.STRING(100), allowNull: false },
  phone: { type: D.STRING(30), allowNull: false, defaultValue: '' },
  email: { type: D.STRING(254), allowNull: false, defaultValue: '' },
  address: { type: D.STRING(300), allowNull: false, defaultValue: '' },
  archived: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
  version: { type: D.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  duplicateKey: { type: D.STRING(64), allowNull: false, unique: true },
};
