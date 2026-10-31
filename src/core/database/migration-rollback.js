// Les DDL MySQL sont séparés de la transaction des données et de l’historique.
export async function removeColumns(db, table, names) {
  const qi = db.sequelize.getQueryInterface();
  const columns = await qi.describeTable(table);
  for (const name of names) if (columns[name]) await qi.removeColumn(table, name);
}
export async function finishDown(db, name, permissions = [], cleanPayments = false) {
  await db.sequelize.transaction(async (transaction) => {
    const qi = db.sequelize.getQueryInterface();
    for (const permissionName of permissions) {
      const permission = await db.models.Permissions.findOne({
        where: { name: permissionName },
        transaction,
      });
      if (!permission) continue;
      await db.models.RolePermissions.destroy({
        where: { permissionId: permission.id },
        transaction,
      });
      await permission.destroy({ transaction });
    }
    if (cleanPayments) {
      // Les réponses mémorisées de création de patient sont conservées.
      await db.sequelize.query(
        "DELETE FROM IdempotencyKeys WHERE JSON_EXTRACT(result, '$.amountCents') IS NOT NULL",
        { transaction },
      );
    }
    await qi.bulkDelete('SequelizeMeta', { name }, { transaction });
  });
}
