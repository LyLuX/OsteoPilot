import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { NotificationProvider } from '../notifications/Notifications.jsx';
import HistoryPage from './HistoryPage.jsx';
const mocks = vi.hoisted(() => ({
  get: vi.fn(async () => ({ items: [], pagination: { total: 0, totalPages: 1 } })),
}));
vi.mock('../api/client.js', async (original) => ({
  ...(await original()),
  api: { get: mocks.get },
}));
test('historique : composant partagé, validation des dates conservée et application des filtres', async () => {
  render(
    <NotificationProvider>
      <HistoryPage />
    </NotificationProvider>,
  );
  expect(screen.getByRole('region', { name: 'Recherche et filtres' })).toBeInTheDocument();
  await screen.findByText('Aucune action pour ces filtres.');
  mocks.get.mockClear();
  fireEvent.change(screen.getByLabelText('Du (UTC)'), { target: { value: '2026-10-29' } });
  fireEvent.change(screen.getByLabelText('Au (UTC)'), { target: { value: '2026-10-28' } });
  await userEvent.click(screen.getByRole('button', { name: 'Filtrer' }));
  expect(screen.getByLabelText('Au (UTC)')).toHaveClass('is-invalid');
  expect(mocks.get).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Au (UTC)'), { target: { value: '2026-10-30' } });
  await userEvent.click(screen.getByRole('button', { name: 'Filtrer' }));
  expect(mocks.get).toHaveBeenLastCalledWith(
    '/history',
    expect.objectContaining({ from: '2026-10-29', to: '2026-10-30', page: 1 }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Effacer' }));
  expect(screen.getByLabelText('Du (UTC)')).toHaveValue('');
  expect(mocks.get).toHaveBeenLastCalledWith('/history', { page: 1, limit: 25 });
});
