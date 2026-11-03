import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import PaymentDeleteControl from './PaymentDeleteControl.jsx';
import { NotificationProvider } from '../notifications/Notifications.jsx';
const mocks = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock('../api/client.js', async (original) => ({
  ...(await original()),
  api: { delete: mocks.remove },
}));
const payment = {
  id: 'paiement-fictif',
  date: '2026-11-03',
  amountCents: 5000,
  method: 'cash',
  version: 2,
  bankDeposited: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.remove.mockResolvedValue({ id: payment.id });
});
const show = (props = {}) =>
  render(
    <NotificationProvider>
      <PaymentDeleteControl payment={payment} canDelete={true} onDeleted={vi.fn()} {...props} />
    </NotificationProvider>,
  );
test('suppression : confirmation détaillée, annulation, version et notification rouge', async () => {
  const onDeleted = vi.fn();
  show({ onDeleted });
  const button = screen.getByRole('button', { name: /Supprimer le paiement/ });
  expect(button).toHaveAttribute('title', 'Supprimer ce paiement');
  expect(button).not.toHaveTextContent('Supprimer');
  expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  fireEvent.click(button);
  let dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('50');
  expect(dialog).toHaveTextContent('03/11/2026');
  expect(dialog).toHaveTextContent('définitive');
  expect(dialog).toHaveTextContent('déposé en banque');
  expect(mocks.remove).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Supprimer le paiement/ }));
  dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmer' }));
  await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
  expect(mocks.remove).toHaveBeenCalledWith('/payments/' + payment.id, {
    version: 2,
    confirmed: true,
  });
  expect(screen.getByRole('alert')).toHaveClass('bg-danger-subtle');
});
test('permission absente : aucune commande de suppression', () => {
  const { container } = show({ canDelete: false });
  expect(container).toBeEmptyDOMElement();
});
test('double validation : une seule suppression et confirmation bloquée pendant l’envoi', async () => {
  let resolve;
  mocks.remove.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  show();
  fireEvent.click(screen.getByRole('button', { name: /Supprimer le paiement/ }));
  const confirm = screen.getByRole('button', { name: 'Confirmer' });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(mocks.remove).toHaveBeenCalledOnce();
  expect(confirm).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
  await act(async () => resolve({ id: payment.id }));
});
test.each([404, 409])(
  'conflit %s : fermeture et rechargement sans succès annoncé',
  async (status) => {
    const onDeleted = vi.fn();
    mocks.remove.mockRejectedValue({
      response: { status, data: { error: { message: 'Paiement modifié ou absent.' } } },
    });
    show({ onDeleted });
    fireEvent.click(screen.getByRole('button', { name: /Supprimer le paiement/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Paiement supprimé.')).not.toBeInTheDocument();
  },
);
test('échec serveur : confirmation conservée et nouvelle tentative possible', async () => {
  mocks.remove.mockRejectedValueOnce({ response: { status: 500 } });
  show();
  fireEvent.click(screen.getByRole('button', { name: /Supprimer le paiement/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmer' })).not.toBeDisabled());
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
