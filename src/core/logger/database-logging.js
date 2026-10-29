const hiddenStatement = { operation: 'UNKNOWN', statement: '[REDACTED]' };
const operations = new Set([
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'REPLACE',
  'WITH',
  'SHOW',
  'DESCRIBE',
  'EXPLAIN',
  'SET',
  'START',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'SAVEPOINT',
  'RELEASE',
  'CREATE',
  'ALTER',
  'DROP',
  'TRUNCATE',
]);

/** Tokenize MySQL statements, retaining structure but never literal values or comments. */
export function describeStatement(value) {
  if (typeof value !== 'string' || value.length > 65536) return hiddenStatement;
  const sql = value.replace(/^(?:Executing|Executed) \([^\r\n)]*\):\s*/, '');
  const lexer =
    /(?<space>\s+)|(?<comment>--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/)|(?<literal>(?:[xXbBnN]|_[a-zA-Z0-9]+)?'(?:[^'\\]|\\[\s\S]|'')*'|"(?:[^"\\]|\\[\s\S]|"")*"|0[xX][\da-fA-F]+|0[bB][01]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|\$\d+|:[a-zA-Z_]\w*)|(?<identifier>\x60(?:[^\x60\\]|\\[\s\S]|\x60\x60)*\x60)|(?<word>[a-zA-Z_]\w*)|(?<symbol>[(),.*=<>!+\-/%&|^~?])|(?<end>;)/gy;
  const parts = [];
  let offset = 0;
  while (offset < sql.length) {
    lexer.lastIndex = offset;
    const token = lexer.exec(sql);
    if (!token || (sql.startsWith('/*', offset) && !token.groups.comment)) {
      return hiddenStatement;
    }
    offset = lexer.lastIndex;
    const { space, comment, literal, identifier, word, symbol, end } = token.groups;
    if (end) break; // Sequelize may append bound values after the SQL terminator.
    if (space || comment) continue;
    parts.push(
      literal || /^(?:NULL|TRUE|FALSE)$/i.test(word ?? '') ? '?' : identifier || word || symbol,
    );
  }
  const operation = parts[0]?.toUpperCase();
  if (!operations.has(operation)) return hiddenStatement;
  const statement = parts
    .join(' ')
    .replace(/\s+([,)])/g, '$1')
    .replace(/\s*\.\s*/g, '.');
  return { operation, statement: statement.slice(0, 2000) };
}

/** Only explicit development SQL logging is allowed. Values and bindings stay hidden. */
export function createDatabaseLoggingOptions(
  { mode, database },
  emit = (line) => process.stdout.write(line + '\n'),
) {
  if (mode !== 'development' || !database.logging)
    return { logging: false, logQueryParameters: false };
  return {
    benchmark: true,
    logQueryParameters: false,
    logging: (sql, durationMs) => {
      try {
        emit(
          JSON.stringify({
            event: 'database.statement',
            ...describeStatement(sql),
            ...(Number.isFinite(durationMs) && durationMs >= 0 ? { durationMs } : {}),
          }),
        );
      } catch {
        /* Technical traces cannot abort a business transaction. */
      }
    },
  };
}
