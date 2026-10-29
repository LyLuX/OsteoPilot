import { definitions, indexes } from './schema.js';
import { migrationName, up } from '../../../migrations/202610290001-initial.js';
import { assert } from '../errors.js';

export async function inspectDatabase(db) {
  const [server] = await db.sequelize.query('SELECT VERSION() AS version, DATABASE() AS db');
  const [tables] = await db.sequelize.query(
    'SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME',
  );
  let history = [];
  if (tables.some((t) => t.name.toLowerCase() === 'sequelizemeta')) {
    const [rows] = await db.sequelize.query('SELECT name FROM SequelizeMeta ORDER BY name');
    history = rows.map((r) => r.name);
  }
  return {
    database: server[0].db,
    serverVersion: server[0].version,
    tables,
    history,
    state: tables.length === 0 ? 'vide' : 'non vide',
  };
}
const typeName = (s) =>
  s
    .toUpperCase()
    .replace('INTEGER', 'INT')
    .replace(/(INT|BIGINT|TINYINT|SMALLINT|MEDIUMINT)\(\d+\)/g, '$1')
    .replace(/ BINARY/g, '');
export async function checkSchema(db) {
  const state = await inspectDatabase(db);
  assert(
    state.history.length === 1 && state.history[0] === migrationName,
    'Schéma : historique inconnu ou migrations en attente. Exécuter db:migrate:status.',
    409,
  );
  const qi = db.sequelize.getQueryInterface();
  for (const [table, attributes] of Object.entries(definitions)) {
    assert(
      state.tables.some(
        (t) => t.name.toLowerCase() === table.toLowerCase() && t.engine === 'InnoDB',
      ),
      'Schéma : table absente ou moteur invalide : ' + table,
      409,
    );
    const description = await qi.describeTable(table);
    const all = db.models[table].rawAttributes;
    for (const [field, attribute] of Object.entries(all)) {
      const actual = description[field];
      assert(actual, 'Schéma : colonne absente : ' + table + '.' + field, 409);
      const expected = attribute.type.toSql();
      let typeMatches = typeName(actual.type) === typeName(expected);
      if (expected === 'UUID') typeMatches = /CHAR\(36\)/i.test(actual.type);
      if (expected === 'BOOLEAN') typeMatches = /TINYINT/i.test(actual.type);
      if (expected === 'DATETIME') typeMatches = /^DATETIME/i.test(actual.type);
      assert(
        typeMatches &&
          actual.allowNull === attribute.allowNull &&
          Boolean(actual.primaryKey) === Boolean(attribute.primaryKey),
        'Schéma : type ou nullabilité divergente : ' +
          table +
          '.' +
          field +
          ' attendu=' +
          expected +
          '/' +
          attribute.allowNull +
          ' obtenu=' +
          actual.type +
          '/' +
          actual.allowNull,
        409,
      );
      if (
        attribute.defaultValue !== undefined &&
        typeof attribute.defaultValue !== 'function' &&
        ['string', 'number', 'boolean'].includes(typeof attribute.defaultValue)
      ) {
        assert(
          String(actual.defaultValue) === String(attribute.defaultValue) ||
            (actual.defaultValue !== null &&
              typeof attribute.defaultValue === 'boolean' &&
              Number(actual.defaultValue) === Number(attribute.defaultValue)),
          'Schéma : défaut divergent : ' + table + '.' + field,
          409,
        );
      }
    }
    const foundIndexes = await qi.showIndex(table);
    const wanted = [
      ...(indexes[table] || []),
      ...Object.entries(attributes)
        .filter(([, a]) => a.unique === true)
        .map(([field]) => ({ unique: true, fields: [field] })),
    ];
    for (const index of wanted) {
      assert(
        foundIndexes.some(
          (i) =>
            (!index.unique || i.unique) &&
            i.fields.map((f) => f.attribute).join(',') === index.fields.join(','),
        ),
        'Schéma : index absent : ' + table,
        409,
      );
    }
    const refs = await qi.getForeignKeyReferencesForTable(table);
    for (const [field, attr] of Object.entries(attributes))
      if (attr.references) {
        assert(
          refs.some(
            (r) =>
              r.columnName === field &&
              r.referencedTableName.toLowerCase() === attr.references.model.toLowerCase() &&
              r.referencedColumnName === attr.references.key,
          ),
          'Schéma : clé étrangère absente : ' + table + '.' + field,
          409,
        );
      }
  }
  const lock = await db.models.Locks.count({ where: { name: 'writes' } });
  assert(
    lock === 1 && (await db.models.Settings.count()) === 1,
    'Schéma : données de référence manquantes.',
    409,
  );
  return state;
}
export async function migrate(db) {
  // Verrou consultatif conservé par une connexion dédiée pendant les DDL.
  const connection = await db.sequelize.connectionManager.getConnection();
  const query = (sql) =>
    new Promise((resolve, reject) =>
      connection.query(sql, (error, rows) => (error ? reject(error) : resolve(rows))),
    );
  let acquired = false;
  try {
    const rows = await query(
      "SELECT GET_LOCK(CONCAT(DATABASE(), ':osteopilot:migrate'), 0) AS acquired",
    );
    assert(rows[0].acquired === 1, 'Une migration est déjà en cours.', 409);
    acquired = true;
    const state = await inspectDatabase(db);
    if (state.history.length === 1 && state.history[0] === migrationName) return checkSchema(db);
    assert(
      state.tables.length === 0,
      'Schéma : base non vide sans historique reconnu. Diagnostic, sauvegarde et validation humaine obligatoires ; aucune reprise automatique.',
      409,
    );
    await up(db);
    return checkSchema(db);
  } finally {
    if (acquired) await query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':osteopilot:migrate'))");
    await db.sequelize.connectionManager.releaseConnection(connection);
  }
}
