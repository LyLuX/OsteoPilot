import { requireTransaction } from '../../core/database/transaction.js';
export async function recordAudit(
  db,
  { actorId = null, action, entity, entityId = null, count = 1 },
  transaction,
) {
  requireTransaction(transaction);
  // Liste blanche : aucun objet métier, secret ni ancienne/nouvelle valeur.
  return db.models.AuditLogs.create({ actorId, action, entity, entityId, count }, { transaction });
}
