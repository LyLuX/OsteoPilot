import { removeColumns, finishDown } from '../src/core/database/migration-rollback.js';
import { definitions } from '../src/core/database/schema.js';
export const migrationName = '202610310005-calendar-default-view.js';
export async function up(db) {
  const qi = db.sequelize.getQueryInterface();
  const columns = await qi.describeTable('Settings');
  if (!columns.defaultCalendarView)
    await qi.addColumn('Settings', 'defaultCalendarView', definitions.Settings.defaultCalendarView);
  await db.sequelize.transaction((transaction) =>
    qi.bulkInsert('SequelizeMeta', [{ name: migrationName }], { transaction }),
  );
}

export async function down(db) {
  await removeColumns(db, 'Settings', ['defaultCalendarView']);
  await finishDown(db, migrationName);
}
