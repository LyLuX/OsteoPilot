import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { NotificationProvider } from '../notifications/Notifications.jsx';
import PaymentDepositsPage from './PaymentDepositsPage.jsx';
const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), remove: vi.fn(), can: vi.fn() }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ can: mocks.can }) }));
vi.mock('../api/client.js', async (original) => ({
  ...(await original()),
  api: { get: mocks.get, patch: mocks.patch, delete: mocks.remove },
}));
let records;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.can.mockReturnValue(true);
  records = Array.from({ length: 26 }, (_, index) => ({
    id: 'payment-' + index,
    date: index === 0 ? '2020-01-01' : '2026-10-29',
    patient: { firstName: 'Fictif', lastName: 'Patient ' + index },
    method: ['cash', 'cheque', 'card', 'transfer'][index % 4],
    amountCents: 4500,
    bankDeposited: false,
    version: 1,
  }));
  mocks.remove.mockImplementation(async (path) => {
    records = records.filter((payment) => path !== '/payments/' + payment.id);
    return { id: path.split('/').at(-1) };
  });
  mocks.get.mockImplementation(async (_path, { page, limit }) => ({
    items: structuredClone(records.slice((page - 1) * limit, page * limit)),
    pagination: {
      page,
      limit,
      total: records.length,
      totalPages: Math.max(1, Math.ceil(records.length / limit)),
    },
  }));
});
const show = () =>
  render(
    <NotificationProvider>
      <PaymentDepositsPage />
    </NotificationProvider>,
  );

test('tous les paiements sans dates imposées, pagination serveur et changement de taille à la première page', async () => {
  show();
  const table = await screen.findByRole('table', { name: 'Tous les paiements' });
  expect(within(table).getByText('01/01/2020')).toBeInTheDocument();
  expect(within(table).getAllByText('Sans objet')).toHaveLength(6);
  expect(within(table).getAllByText('Sur le compte')).toHaveLength(6);
  expect(mocks.get).toHaveBeenCalledWith('/payments', { page: 1, limit: 25 });
  fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
  await waitFor(() =>
    expect(mocks.get).toHaveBeenLastCalledWith('/payments', { page: 2, limit: 25 }),
  );
  expect(await screen.findByText('Patient 25 Fictif')).toBeInTheDocument();
  expect(screen.queryByText('Patient 0 Fictif')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Nombre d’éléments par page'), { target: { value: '5' } });
  await waitFor(() =>
    expect(mocks.get).toHaveBeenLastCalledWith('/payments', { page: 1, limit: 5 }),
  );
});

test('colonne Dépôt : statuts sans bouton, y compris avec le droit de dépôt', async () => {
  records = [records[0], { ...records[1], bankDeposited: true }, records[2], records[3]];
  show();
  const table = await screen.findByRole('table');
  const rows = within(table).getAllByRole('row').slice(1);
  for (const [index, status] of ['À déposer', 'Déposé', 'Sans objet', 'Sur le compte'].entries()) {
    const cell = within(rows[index]).getAllByRole('cell')[5];
    expect(cell).toHaveTextContent(status);
    expect(within(cell).queryByRole('button')).not.toBeInTheDocument();
    if (status !== 'Sans objet') expect(within(cell).getByText(status)).toHaveClass('badge');
  }
  expect(within(table).queryByRole('button', { name: 'Déposer' })).not.toBeInTheDocument();
  expect(mocks.patch).not.toHaveBeenCalled();
});

test('lecture seule sans droit de dépôt', async () => {
  mocks.can.mockImplementation((permission) => permission === 'payments.read');
  show();
  await screen.findByRole('table');
  expect(screen.getAllByText('À déposer').length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: 'Déposer' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Supprimer le paiement/ })).not.toBeInTheDocument();
  for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeDisabled();
});

test('liste vide et erreur de lecture avec nouvelle tentative', async () => {
  records = [];
  mocks.get.mockRejectedValueOnce(new Error('Indisponible'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
  expect(await screen.findByText('Aucun paiement enregistré.')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('sélection globale exclusive, pages suivantes et ajustement individuel avec état partiel', async () => {
  show();
  const table = await screen.findByRole('table');
  const cash = screen.getByRole('checkbox', { name: 'Paiements en espèces' });
  const cheque = screen.getByRole('checkbox', { name: 'Paiements par chèque' });
  expect(screen.queryByText(/Tous les paiements, du plus récent/)).not.toBeInTheDocument();
  expect(within(table).getAllByRole('columnheader')[0]).toHaveTextContent('Déposer');
  fireEvent.click(cash);
  expect(cash).toBeChecked();
  expect(within(table).getAllByRole('checkbox')[0]).toBeChecked();
  expect(within(table).getAllByRole('checkbox')[1]).not.toBeChecked();
  fireEvent.click(cheque);
  expect(cash).not.toBeChecked();
  expect(cheque).toBeChecked();
  expect(within(table).getAllByRole('checkbox')[0]).not.toBeChecked();
  expect(within(table).getAllByRole('checkbox')[1]).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
  await screen.findByText('Patient 25 Fictif');
  const rowCheckbox = within(screen.getByRole('table')).getByRole('checkbox');
  expect(rowCheckbox).toBeChecked();
  fireEvent.click(rowCheckbox);
  expect(rowCheckbox).not.toBeChecked();
  expect(cheque).toBePartiallyChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));
  await screen.findByText('Patient 0 Fictif');
  const checkboxes = within(screen.getByRole('table')).getAllByRole('checkbox');
  expect(checkboxes[1]).toBeChecked();
  fireEvent.click(checkboxes[0]);
  expect(checkboxes[0]).toBeChecked();
  expect(checkboxes[1]).not.toBeChecked();
  expect(cash).toBePartiallyChecked();
  expect(cheque).not.toBeChecked();
  expect(cheque).not.toBePartiallyChecked();
  expect(mocks.patch).not.toHaveBeenCalled();
});

test('carte, virement et paiement déjà déposé non sélectionnables ; désélection globale', async () => {
  records = [records[0], { ...records[1], bankDeposited: true }, records[2], records[3]];
  show();
  const table = await screen.findByRole('table');
  const checkboxes = within(table).getAllByRole('checkbox');
  expect(checkboxes[0]).toBeEnabled();
  for (const checkbox of checkboxes.slice(1)) expect(checkbox).toBeDisabled();
  const cash = screen.getByRole('checkbox', { name: 'Paiements en espèces' });
  fireEvent.click(cash);
  expect(checkboxes[0]).toBeChecked();
  fireEvent.click(cash);
  expect(checkboxes[0]).not.toBeChecked();
  expect(cash).not.toBeChecked();
});

test('suppression confirmée depuis Déposer : API versionnée, sélection effacée et retour page 1', async () => {
  show();
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Paiements par chèque' }));
  fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
  await screen.findByText('Patient 25 Fictif');
  fireEvent.click(screen.getByRole('button', { name: /Supprimer le paiement/ }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Patient 25 Fictif');
  expect(mocks.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  expect(await screen.findByText('Patient 0 Fictif')).toBeInTheDocument();
  expect(mocks.remove).toHaveBeenCalledWith('/payments/payment-25', {
    version: 1,
    confirmed: true,
  });
  expect(mocks.get).toHaveBeenLastCalledWith('/payments', { page: 1, limit: 25 });
  expect(screen.getByRole('checkbox', { name: 'Paiements par chèque' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Paiements par chèque' })).not.toBePartiallyChecked();
  expect(await screen.findByRole('alert')).toHaveTextContent('Paiement supprimé.');
});

test('suppression en cours : sélection et pagination désactivées', async () => {
  let resolve;
  mocks.remove.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  show();
  await screen.findByRole('table');
  fireEvent.click(screen.getAllByRole('button', { name: /Supprimer le paiement/ })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled();
  expect(screen.getByLabelText('Nombre d’éléments par page')).toBeDisabled();
  for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeDisabled();
  await act(async () => resolve({ id: 'payment-0' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Suivant' })).toBeEnabled());
});
