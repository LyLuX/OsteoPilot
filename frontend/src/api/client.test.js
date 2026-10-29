import { afterEach, expect, test, vi } from 'vitest';
const send = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { create: () => ({ request: send }) } }));
import { request } from './client.js';
afterEach(() => send.mockReset());
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
