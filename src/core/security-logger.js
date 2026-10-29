// Aucun chemin, email, adresse IP, corps ni paramètre métier dans les traces.
const buckets = new Map();
export function logDenial(status, emit = (line) => process.stderr.write(line + '\n')) {
  const now = Date.now();
  const key = String(status);
  const bucket = buckets.get(key) || { count: 0, since: now };
  if (now - bucket.since > 60000) {
    bucket.count = 0;
    bucket.since = now;
  }
  bucket.count++;
  buckets.set(key, bucket);
  if (bucket.count % 5 === 0) {
    try {
      emit(JSON.stringify({ event: 'security.repeated_denial', status, count: bucket.count }));
    } catch {
      /* Une panne de log ne transforme jamais un refus en autorisation. */
    }
  }
}
