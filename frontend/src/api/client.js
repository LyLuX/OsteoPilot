import axios from 'axios';
const client = axios.create({ baseURL: '/api/v1', withCredentials: true, timeout: 30000 });
let csrfToken = '';
let queue = Promise.resolve();
const pendingReads = new Map();
let readRevision = 0;
const invalidateReads = () => {
  readRevision += 1;
  pendingReads.clear();
};
function readKey(method, url, data, options) {
  if (
    method !== 'get' ||
    data !== undefined ||
    Object.keys(options).some((key) => !['params', 'responseType'].includes(key))
  )
    return null;
  if (options.params != null && Object.getPrototypeOf(options.params) !== Object.prototype)
    return null;
  return JSON.stringify(
    [url, options.params ?? {}, options.responseType ?? 'json', readRevision],
    (_, value) =>
      value && Object.getPrototypeOf(value) === Object.prototype
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
        : value,
  );
}
export const setCsrfToken = (value) => {
  const next = value || '';
  if (next !== csrfToken) invalidateReads();
  csrfToken = next;
};
export function request(method, url, data, options = {}) {
  if (!['get', 'head', 'options'].includes(method)) invalidateReads();
  const key = readKey(method, url, data, options);
  if (key && pendingReads.has(key)) return pendingReads.get(key);
  // Ordre conservé, notamment entre rotation de session et écriture métier.
  const run = () =>
    client
      .request({
        method,
        url,
        data,
        ...options,
        headers: { 'X-CSRF-Token': csrfToken, ...options.headers },
      })
      .then((res) => (options.responseType === 'blob' ? res.data : res.data.data))
      .catch((error) => {
        if (error.response?.status === 401 && !['/auth/login', '/auth/me'].includes(url))
          window.dispatchEvent(new Event('osteopilot:session-expired'));
        throw error;
      });
  const pending = queue.then(run, run);
  queue = pending.catch(() => {});
  if (!key) return pending;
  const shared = pending.finally(() => {
    if (pendingReads.get(key) === shared) pendingReads.delete(key);
  });
  pendingReads.set(key, shared);
  return shared;
}
export const api = {
  get: (url, params) => request('get', url, undefined, { params }),
  post: (url, data = {}, options) => request('post', url, data, options),
  patch: (url, data) => request('patch', url, data),
  put: (url, data) => request('put', url, data),
};
export function errorMessage(error, { includeFields = true } = {}) {
  const message = error.response?.data?.error?.message || 'Connexion impossible. Réessayez.';
  const details = error.response?.data?.error?.details;
  const fields = Array.isArray(details)
    ? [...new Set(details.map((d) => d.field).filter(Boolean))]
    : [];
  const retry = error.response?.headers?.['retry-after'];
  return (
    message +
    (includeFields && fields.length ? ' Champs : ' + fields.join(', ') + '.' : '') +
    (retry ? ' Réessayez dans ' + retry + ' secondes.' : '')
  );
}
