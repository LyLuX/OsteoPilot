import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import PaymentDepositControl from './PaymentDepositControl.jsx';
import { NotificationProvider } from '../notifications/Notifications.jsx';
const mocks = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock('../api/client.js', async (original) => ({
  ...(await original()),
  api: { patch: mocks.patch },
}));
const payment = {
  id: '4a9fb270-9222-4e80-bf91-408c00df25a2',
  method: 'cash',
  bankDeposited: false,
  version: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.patch.mockResolvedValue({ ...payment, bankDeposited: true, version: 2 });
});
const show = (props = {}) =>
  render(
    <NotificationProvider>
      <PaymentDepositControl payment={payment} canUpdate={true} onSaved={vi.fn()} {...props} />
    </NotificationProvider>,
  );
test.each(['cash', 'cheque'])(
  'statut %s, marquage et annulation avec version et notification jaune',
  async (method) => {
    const onSaved = vi.fn();
    const view = show({ payment: { ...payment, method }, onSaved });
    expect(screen.getByText('À déposer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Marquer comme déposé' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(mocks.patch).toHaveBeenCalledWith('/payments/' + payment.id + '/bank-deposit', {
      bankDeposited: true,
      version: 1,
    });
    expect(
      screen.getByText('Paiement marqué comme déposé en banque.').closest('.toast'),
    ).toHaveClass('bg-warning-subtle');
    view.rerender(
      <NotificationProvider>
        <PaymentDepositControl
          payment={{ ...payment, method, bankDeposited: true, version: 2 }}
          canUpdate={true}
          onSaved={onSaved}
        />
      </NotificationProvider>,
    );
    expect(screen.getByText('Déposé en banque')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler le dépôt' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenLastCalledWith('/payments/' + payment.id + '/bank-deposit', {
        bankDeposited: false,
        version: 2,
      }),
    );
  },
);
test.each(['card', 'transfer'])('aucun suivi pour %s', (method) => {
  const { container } = show({ payment: { ...payment, method, bankDeposited: null } });
  expect(container).toBeEmptyDOMElement();
  expect(mocks.patch).not.toHaveBeenCalled();
});
test('lecture seule : statut visible sans commande', () => {
  show({ canUpdate: false });
  expect(screen.getByText('À déposer')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
test('échec : statut inchangé et message Bootstrap rouge', async () => {
  mocks.patch.mockRejectedValue({
    response: { status: 500, data: { error: { message: 'Dépôt indisponible.' } } },
  });
  const onSaved = vi.fn();
  show({ onSaved });
  fireEvent.click(screen.getByRole('button', { name: 'Marquer comme déposé' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Dépôt indisponible.');
  expect(screen.getByText('À déposer')).toBeInTheDocument();
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Marquer comme déposé' })).toBeEnabled();
});
test('conflit : actualisation demandée et erreur de concurrence conservée', async () => {
  mocks.patch.mockRejectedValue({
    response: { status: 409, data: { error: { message: 'Ce paiement a changé.' } } },
  });
  const onSaved = vi.fn();
  show({ onSaved });
  fireEvent.click(screen.getByRole('button', { name: 'Marquer comme déposé' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ce paiement a changé.');
  expect(onSaved).toHaveBeenCalledOnce();
});
test('requête en cours : commande désactivée et double clic sans doublon', async () => {
  let resolve;
  mocks.patch.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const onSaved = vi.fn();
  show({ onSaved });
  const button = screen.getByRole('button', { name: 'Marquer comme déposé' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(mocks.patch).toHaveBeenCalledOnce();
  await act(async () => resolve({ ...payment, bankDeposited: true, version: 2 }));
  expect(onSaved).toHaveBeenCalledOnce();
  expect(button).toBeEnabled();
});
