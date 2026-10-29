import bcrypt from 'bcrypt';
import { createEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/core/database/database.js';
import { checkSchema } from '../src/core/database/migrations.js';
import { withTransaction } from '../src/core/database/transaction.js';
import { bootstrapInput } from '../src/routes/registry.js';
import { parse } from '../src/core/validation.js';
import { assert } from '../src/core/errors.js';
import { recordAudit } from '../src/modules/audit/audit.service.js';
let db;
try {
  const config = createEnvironment();
  createEnvironment(process.env, { databaseOnly: true });
  const input = parse(bootstrapInput, {
    email: process.env.ADMIN_EMAIL,
    firstName: process.env.ADMIN_FIRST_NAME,
    lastName: process.env.ADMIN_LAST_NAME,
    password: process.env.ADMIN_PASSWORD,
  });
  db = createDatabase(config);
  await checkSchema(db);
  const hash = await bcrypt.hash(input.password, 12);
  const result = await withTransaction(db, async (transaction) => {
    const adminRole = await db.models.Roles.findOne({
      where: { name: 'ADMIN', system: true },
      transaction,
    });
    assert(adminRole, 'Rôle système absent.', 409);
    const existing = await db.models.UserRoles.count({
      where: { roleId: adminRole.id },
      transaction,
    });
    if (existing) {
      const user = await db.models.Users.findOne({
        where: { email: input.email },
        include: [db.models.Roles],
        transaction,
      });
      assert(
        user?.Roles.some((r) => r.id === adminRole.id),
        'Un administrateur existe déjà. Aucune modification effectuée.',
        409,
      );
      return 'Administrateur déjà présent : aucun changement.';
    }
    assert(
      (await db.models.Users.count({ transaction })) === 0,
      'Des utilisateurs existent : reprise manuelle requise.',
      409,
    );
    const values = { email: input.email, firstName: input.firstName, lastName: input.lastName };
    const user = await db.models.Users.create({ ...values, passwordHash: hash }, { transaction });
    await user.addRole(adminRole, { transaction });
    await recordAudit(
      db,
      { actorId: user.id, action: 'users.bootstrap', entity: 'user', entityId: user.id },
      transaction,
    );
    return 'Premier administrateur créé.';
  });
  process.stdout.write(result + '\n');
} catch (error) {
  process.stderr.write(
    error.status
      ? error.message + '\n'
      : 'Création impossible : vérifier ADMIN_*, configuration et schéma.\n',
  );
  process.exitCode = 1;
} finally {
  delete process.env.ADMIN_PASSWORD;
  if (db) await db.sequelize.close();
}
