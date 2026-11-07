import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import PaymentDepositHistoryPage from './PaymentDepositHistoryPage.jsx';
const mocks = vi.hoisted(() => ({ get: vi.fn(), remove: vi.fn(), can: vi.fn() }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ can: mocks.can }) }));
vi.mock('../api/client.js', async (original) => ({
  ...(await original()),
  api: { get: mocks.get, delete: mocks.remove },
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
  mocks.can.mockReturnValue(true);
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
  expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
  const button = screen.getByRole('button', { name: /Réimprimer le bordereau/ });
  expect(button).toHaveAttribute('title', 'Réimprimer le bordereau');
  expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  expect(button.textContent).toBe('');
  const row = screen.getByText('Reconstitué').closest('tr');
  const cells = within(row).getAllByRole('cell');
  expect(cells).toHaveLength(6);
  expect(within(cells[4]).queryByRole('button')).not.toBeInTheDocument();
  expect(within(cells[5]).getByRole('button', { name: /Réimprimer/ })).toBe(button);
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

test('statut Original sans suppression, même avec tous les droits', async () => {
  mocks.get.mockResolvedValue({
    items: [{ ...slip, reconstructed: false }],
    pagination: { page: 1, limit: 5, total: 1, totalPages: 1 },
  });
  render(<PaymentDepositHistoryPage onPrint={vi.fn()} onBack={vi.fn()} />);
  await screen.findByText('Original');
  expect(screen.queryByRole('button', { name: /Supprimer ce bordereau/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Réimprimer/ })).toBeInTheDocument();
});
test('suppression confirmée d’un reconstitué : requête explicite et actualisation du tableau', async () => {
  mocks.remove.mockImplementation(async () => {
    mocks.get.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 5, total: 0, totalPages: 1 },
    });
    return { id: slip.id };
  });
  render(<PaymentDepositHistoryPage onPrint={vi.fn()} onBack={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /Supprimer ce bordereau/ }));
  expect(screen.getByRole('dialog')).toHaveTextContent(
    'Les paiements et leurs statuts de dépôt seront conservés.',
  );
  expect(mocks.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  await screen.findByText('Aucun bordereau enregistré.');
  expect(mocks.remove).toHaveBeenCalledWith('/payments/deposits/history/' + slip.id, {
    confirmed: true,
  });
});
test('annuler la confirmation conserve le bordereau', async () => {
  render(<PaymentDepositHistoryPage onPrint={vi.fn()} onBack={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /Supprimer ce bordereau/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mocks.remove).not.toHaveBeenCalled();
});
test.each(['payments.deposits.reprint', 'payments.deposits.delete'])(
  'action masquée sans la permission %s',
  async (missing) => {
    mocks.can.mockImplementation((permission) => permission !== missing);
    render(<PaymentDepositHistoryPage onPrint={vi.fn()} onBack={vi.fn()} />);
    await screen.findByRole('table');
    expect(
      screen.queryByRole('button', {
        name: missing.endsWith('reprint') ? /Réimprimer/ : /Supprimer ce bordereau/,
      }),
    ).not.toBeInTheDocument();
  },
);
test('sans droit historique, aucun appel ni tableau', async () => {
  mocks.can.mockImplementation((permission) => permission !== 'payments.deposits.read');
  render(<PaymentDepositHistoryPage onPrint={vi.fn()} onBack={vi.fn()} />);
  await waitFor(() => expect(mocks.get).not.toHaveBeenCalled());
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
