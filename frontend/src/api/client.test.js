import { afterEach, expect, test, vi } from 'vitest';
const send = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { create: () => ({ request: send }) } }));
import { api, request, setCsrfToken } from './client.js';
import { waitFor } from '@testing-library/react';
afterEach(() => {
  send.mockReset();
  setCsrfToken('');
});
test.each(['/auth/me', '/auth/login', '/patients'])(
  '401 sur %s : expiration seulement pour une session active',
  async (url) => {
    const expired = vi.fn();
    window.addEventListener('osteopilot:session-expired', expired);
    send.mockRejectedValue({ response: { status: 401 } });
    try {
      await expect(request('get', url)).rejects.toMatchObject({ response: { status: 401 } });
      expect(expired).toHaveBeenCalledTimes(url === '/patients' ? 1 : 0);
    } finally {
      window.removeEventListener('osteopilot:session-expired', expired);
    }
  },
);

test('GET simultanés identiques : un seul transport, paramètres ordonnés, aucune réponse mise en cache', async () => {
  let resolve;
  send.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const first = api.get('/payments', { page: 1, date: '2026-10-31' });
  const second = api.get('/payments', { date: '2026-10-31', page: 1 });
  expect(second).toBe(first);
  await waitFor(() => expect(send).toHaveBeenCalledOnce());
  resolve({ data: { data: { items: [] } } });
  await expect(first).resolves.toEqual({ items: [] });
  await expect(second).resolves.toEqual({ items: [] });
  send.mockResolvedValue({ data: { data: { items: ['nouveau'] } } });
  await expect(api.get('/payments', { page: 1, date: '2026-10-31' })).resolves.toEqual({
    items: ['nouveau'],
  });
  expect(send).toHaveBeenCalledTimes(2);
});
test('paramètres, URL et options propres à chaque appel ne sont pas confondus', async () => {
  send.mockResolvedValue({ data: { data: { ok: true } } });
  await Promise.all([
    api.get('/payments', { page: 1 }),
    api.get('/payments', { page: 2 }),
    api.get('/patients', { page: 1 }),
    request('get', '/payments', undefined, { headers: { 'X-Test': 'a' } }),
    request('get', '/payments', undefined, { headers: { 'X-Test': 'b' } }),
    request('get', '/payments', undefined, { signal: new AbortController().signal }),
    request('get', '/payments', undefined, { signal: new AbortController().signal }),
  ]);
  expect(send).toHaveBeenCalledTimes(7);
});
test('lecture après mutation : nouvelle réponse et ordre GET, PATCH, GET conservé', async () => {
  let version = 0;
  send.mockImplementation(async ({ method }) => {
    if (method === 'patch') version += 1;
    return { data: { data: { version } } };
  });
  const before = api.get('/settings/calendar');
  const change = api.patch('/settings/calendar', { defaultCalendarView: 'week' });
  const after = api.get('/settings/calendar');
  expect(after).not.toBe(before);
  expect(await before).toEqual({ version: 0 });
  await change;
  expect(await after).toEqual({ version: 1 });
  expect(send.mock.calls.map(([config]) => config.method)).toEqual(['get', 'patch', 'get']);
});
test('les écritures répétées ne sont jamais partagées', async () => {
  send.mockResolvedValue({ data: { data: { ok: true } } });
  await Promise.all([
    api.post('/patients', { firstName: 'Fictif' }),
    api.post('/patients', { firstName: 'Fictif' }),
  ]);
  expect(send).toHaveBeenCalledTimes(2);
});
test('changement de session : aucune lecture en cours réutilisée et nouveaux en-têtes', async () => {
  setCsrfToken('ancien');
  let resolve;
  send.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const before = api.get('/auth/me');
  await waitFor(() => expect(send).toHaveBeenCalledOnce());
  setCsrfToken('nouveau');
  send.mockResolvedValue({ data: { data: { session: 'nouvelle' } } });
  const after = api.get('/auth/me');
  expect(after).not.toBe(before);
  resolve({ data: { data: { session: 'ancienne' } } });
  expect(await before).toEqual({ session: 'ancienne' });
  expect(await after).toEqual({ session: 'nouvelle' });
  expect(send.mock.calls.map(([config]) => config.headers['X-CSRF-Token'])).toEqual([
    'ancien',
    'nouveau',
  ]);
});
test('échec partagé puis reprise : aucune erreur conservée', async () => {
  const error = { response: { status: 503 } };
  send.mockRejectedValueOnce(error);
  const results = await Promise.allSettled([api.get('/settings'), api.get('/settings')]);
  expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
  expect(send).toHaveBeenCalledOnce();
  send.mockResolvedValue({ data: { data: { ok: true } } });
  await expect(api.get('/settings')).resolves.toEqual({ ok: true });
  expect(send).toHaveBeenCalledTimes(2);
});
