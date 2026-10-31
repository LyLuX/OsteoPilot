import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
const send = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { create: () => ({ request: send }) } }));
import { AuthProvider, useAuth } from '../auth/AuthContext.jsx';
import { useResource } from '../components/shared.jsx';
function Resources() {
  const settings = useResource('/settings');
  const calendar = useResource('/settings/calendar');
  const totals = useResource('/payments/summary', { from: '2026-10-01', to: '2026-10-31' });
  const payments = useResource('/payments', { date: '2026-10-31', page: 1, limit: 5 });
  return (
    <p>
      {[settings, calendar, totals, payments].every(
        (resource) => resource.current && !resource.loading,
      )
        ? 'Prêt'
        : 'Chargement'}
    </p>
  );
}
function Gate() {
  const { user } = useAuth();
  return user ? <Resources /> : <p>Session</p>;
}
test('StrictMode : une seule requête réseau par lecture au montage de la session et des ressources', async () => {
  send.mockImplementation(async ({ url }) => ({
    data: {
      data:
        url === '/auth/me'
          ? {
              user: { firstName: 'Fictif', permissions: ['dashboard.read'] },
              csrfToken: 'jeton-fictif',
            }
          : { loaded: true },
    },
  }));
  const view = render(
    <StrictMode>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </StrictMode>,
  );
  expect(await screen.findByText('Prêt')).toBeInTheDocument();
  expect(send).toHaveBeenCalledTimes(5);
  for (const path of [
    '/auth/me',
    '/settings',
    '/settings/calendar',
    '/payments/summary',
    '/payments',
  ])
    expect(send.mock.calls.filter(([config]) => config.url === path)).toHaveLength(1);
  view.unmount();
});
