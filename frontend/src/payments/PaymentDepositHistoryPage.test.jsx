import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import PaymentDepositHistoryPage from './PaymentDepositHistoryPage.jsx';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../api/client.js', async (original) => ({
  ...(await original()),
  api: { get: mocks.get },
}));
const slip = {
  id: 'slip-a',
  method: 'cheque',
  createdAt: '2026-11-07T12:00:00.000Z',
  paymentCount: 2,
  totalCents: 11000,
  reconstructed: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation(async (path, query) =>
    path.endsWith('/slip-a')
      ? { ...slip, items: [] }
      : {
          items: [slip],
          pagination: { page: query.page, limit: query.limit, total: 6, totalPages: 2 },
        },
  );
});
test('liste paginée, document reconstitué et lecture du détail avant réimpression', async () => {
  const onPrint = vi.fn();
  const onBack = vi.fn();
  render(<PaymentDepositHistoryPage onPrint={onPrint} onBack={onBack} />);
  await screen.findByRole('table');
  expect(mocks.get).toHaveBeenCalledWith('/payments/deposits/history', { page: 1, limit: 5 });
  expect(screen.getByText('Reconstitué')).toBeInTheDocument();
  expect(screen.getByText('110 €')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
  await waitFor(() =>
    expect(mocks.get).toHaveBeenCalledWith('/payments/deposits/history', { page: 2, limit: 5 }),
  );
  fireEvent.click(await screen.findByRole('button', { name: /Réimprimer le bordereau/ }));
  await waitFor(() => expect(onPrint).toHaveBeenCalledWith({ ...slip, items: [] }));
  fireEvent.click(screen.getByRole('button', { name: 'Retour aux paiements' }));
  expect(onBack).toHaveBeenCalledOnce();
});
test('liste vide sans action de réimpression', async () => {
  mocks.get.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 5, total: 0, totalPages: 1 },
  });
  render(<PaymentDepositHistoryPage onPrint={vi.fn()} onBack={vi.fn()} />);
  await screen.findByText('Aucun bordereau enregistré.');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
test('erreur de lecture, nouvelle tentative et détail en échec sans ouverture', async () => {
  mocks.get.mockRejectedValueOnce(new Error('Indisponible'));
  const onPrint = vi.fn();
  render(<PaymentDepositHistoryPage onPrint={onPrint} onBack={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
  await screen.findByRole('table');
  mocks.get.mockRejectedValueOnce(new Error('Indisponible'));
  fireEvent.click(screen.getByRole('button', { name: /Réimprimer le bordereau/ }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Réimprimer le bordereau/ })).toBeEnabled(),
  );
  expect(onPrint).not.toHaveBeenCalled();
});
