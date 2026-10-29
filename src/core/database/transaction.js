import { Transaction } from 'sequelize';
export async function withTransaction(db, work) {
  return db.sequelize.transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
    async (transaction) => {
      // Sérialise les mutations de ce cabinet unique, y compris les changements de droits.
      const lock = await db.models.Locks.findOne({
        where: { name: 'writes' },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!lock) throw new Error('Migration initiale absente.');
      return work(transaction);
    },
  );
}
export function requireTransaction(transaction) {
  if (!transaction) throw new Error('Transaction explicite requise pour une écriture.');
}
