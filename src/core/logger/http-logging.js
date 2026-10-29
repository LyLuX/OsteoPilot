import { performance } from 'node:perf_hooks';
import { STATUS_CODES } from 'node:http';

export function supportsLogColor(output = process.stdout, environment = process.env) {
  return Boolean(output.isTTY && !('NO_COLOR' in environment) && environment.TERM !== 'dumb');
}

export function formatHttpLog(
  { method, route, status, durationMs },
  { color = false, time = new Date() } = {},
) {
  const clock = time.toLocaleTimeString('fr-FR', { hour12: false });
  const statusLabel = (status + ' ' + (STATUS_CODES[status] ?? '')).padEnd(26);
  const statusColor = status >= 500 ? 31 : status >= 400 ? 33 : status >= 300 ? 36 : 32;
  const paint = (value, code) => (color ? '\x1b[' + code + 'm' + value + '\x1b[0m' : value);
  return (
    paint(clock, 90) +
    '  ' +
    paint(method.padEnd(7), 36) +
    '  ' +
    route.padEnd(48) +
    '  ' +
    paint(statusLabel, statusColor) +
    '  ' +
    durationMs.toFixed(1).padStart(8) +
    ' ms'
  );
}

/** Development traces contain registered templates only, never URLs or request values. */
export function developmentHttpLogging(emit = (line) => process.stdout.write(line + '\n')) {
  return (request, response, next) => {
    const started = performance.now();
    response.once('finish', () => {
      const route =
        typeof request.route?.path === 'string' ? request.route.path : '[route inconnue]';
      const method = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(
        request.method,
      )
        ? request.method
        : 'UNKNOWN';
      try {
        emit(
          formatHttpLog(
            { method, route, status: response.statusCode, durationMs: performance.now() - started },
            { color: supportsLogColor() },
          ),
        );
      } catch {
        /* A technical logging failure never changes an HTTP response. */
      }
    });
    next();
  };
}
