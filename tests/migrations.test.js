import { jest } from '@jest/globals';
import { undoMigration } from '../src/core/database/migrations.js';

const database = (mode, name = 'osteopilot') => ({
  mode,
  sequelize: {
    getDatabaseName: () => name,
    connectionManager: { getConnection: jest.fn() },
  },
});
test('down : production et tests sans isolation refusés avant toute connexion', async () => {
  for (const db of [
    database('production'),
    database('test'),
    database(undefined),
    database('test', 'osteopilot_test_0123456789abcdef'),
  ]) {
    await expect(
      undoMigration(db, { confirmDatabase: db.sequelize.getDatabaseName() }),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.sequelize.connectionManager.getConnection).not.toHaveBeenCalled();
  }
});
test('down : confirmation du nom exact obligatoire en développement', async () => {
  const db = database('development');
  for (const options of [undefined, {}, { confirmDatabase: 'autre_base' }]) {
    await expect(undoMigration(db, options)).rejects.toMatchObject({ status: 422 });
  }
  expect(db.sequelize.connectionManager.getConnection).not.toHaveBeenCalled();
});
