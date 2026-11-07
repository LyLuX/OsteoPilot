import { Op } from 'sequelize';
import { definitions, baseAttributes, indexes } from '../src/core/database/schema.js';
import { finishDown } from '../src/core/database/migration-rollback.js';
import { recordAudit } from '../src/modules/audit/audit.service.js';
import { slipItems } from '../src/modules/payments/deposit-slip.js';
import { uuid } from '../src/core/validation.js';
export const migrationName = '202611070009-deposit-slips.js';
export async function up(db) {
  const qi = db.sequelize.getQueryInterface();
  if (!(await qi.showAllTables()).some((name) => name.toLowerCase() === 'depositslips'))
    await qi.createTable(
      'DepositSlips',
      { ...baseAttributes(), ...definitions.DepositSlips },
      {
        engine: 'InnoDB',
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
      },
    );
  const found = await qi.showIndex('DepositSlips');
  for (const index of indexes.DepositSlips)
    if (
      !found.some(
        (item) => item.fields.map((field) => field.attribute).join(',') === index.fields.join(','),
      )
    )
      await qi.addIndex('DepositSlips', index.fields, index);
  await db.sequelize.transaction(async (transaction) => {
    // Old batch responses contain exact payment IDs and total, but no original identities.
    const cabinet = await db.models.Settings.findOne({ attributes: ['name'], transaction });
    let after = null;
    while (cabinet?.name?.trim()) {
      const memos = await db.models.IdempotencyKeys.findAll({
        attributes: ['id', 'userId', 'createdAt', 'result'],
        ...(after ? { where: { id: { [Op.gt]: after } } } : {}),
        order: [['id', 'ASC']],
        limit: 100,
        transaction,
      });
      if (!memos.length) break;
      for (const memo of memos) {
        const result = memo.result;
        if (
          !result ||
          Object.keys(result).sort().join(',') !== 'ids,totalCents' ||
          !Array.isArray(result.ids) ||
          !result.ids.length ||
          result.ids.length > 5000 ||
          new Set(result.ids).size !== result.ids.length ||
          !result.ids.every((id) => uuid.safeParse(id).success) ||
          !Number.isSafeInteger(result.totalCents) ||
          result.totalCents < 1
        )
          continue;
        if (await db.models.DepositSlips.findByPk(memo.id, { attributes: ['id'], transaction }))
          continue;
        const rows = await db.models.Payments.findAll({
          attributes: [
            'id',
            'method',
            'date',
            'createdAt',
            'version',
            'amountCents',
            'chequeNumber',
          ],
          where: { id: { [Op.in]: result.ids } },
          include: [
            { model: db.models.Patients, as: 'patient', attributes: ['firstName', 'lastName'] },
          ],
          transaction,
        });
        const method = rows[0]?.method;
        if (
          rows.length !== result.ids.length ||
          !['cash', 'cheque'].includes(method) ||
          rows.some((row) => row.method !== method) ||
          rows.reduce((sum, row) => sum + row.amountCents, 0) !== result.totalCents
        )
          continue;
        await db.models.DepositSlips.create(
          {
            id: memo.id,
            createdBy: memo.userId,
            createdAt: memo.createdAt,
            updatedAt: memo.createdAt,
            cabinetName: cabinet.name,
            method,
            paymentCount: rows.length,
            totalCents: result.totalCents,
            items: slipItems(rows, method),
            reconstructed: true,
          },
          { transaction },
        );
        await recordAudit(
          db,
          {
            actorId: memo.userId,
            action: 'payments.deposit-slip.recover',
            entity: 'deposit-slip',
            entityId: memo.id,
            count: rows.length,
          },
          transaction,
        );
      }
      after = memos.at(-1).id;
    }
    await qi.bulkInsert('SequelizeMeta', [{ name: migrationName }], { transaction });
  });
}
export async function down(db) {
  const qi = db.sequelize.getQueryInterface();
  if ((await qi.showAllTables()).some((name) => name.toLowerCase() === 'depositslips'))
    await qi.dropTable('DepositSlips');
  await finishDown(db, migrationName);
}
