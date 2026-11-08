import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import PatientDetailPage from './PatientDetailPage.jsx';
import { NotificationProvider } from '../notifications/Notifications.jsx';
const mocks = vi.hoisted(() => ({ get: vi.fn(), remove: vi.fn(), can: vi.fn() }));
vi.mock('../api/client.js', async (original) => ({
  ...(await original()),
  api: { get: mocks.get, delete: mocks.remove },
}));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ can: mocks.can }) }));
const patient = {
  id: 'patient-fictif',
  firstName: 'Fictif',
  lastName: 'Exemple',
  archived: false,
  version: 1,
  phone: '',
  email: '',
  address: '',
};
const payment = {
  id: 'paiement-fictif',
  patientId: patient.id,
  date: '2026-11-03',
  method: 'card',
  amountCents: 5000,
  version: 1,
};
let deleted;
beforeEach(() => {
  vi.clearAllMocks();
  deleted = false;
  mocks.can.mockImplementation((permission) =>
    ['patients.read', 'payments.read', 'payments.delete'].includes(permission),
  );
  mocks.get.mockImplementation(async (path) =>
    path.endsWith('/payments')
      ? {
          items: deleted ? [] : [payment],
          pagination: { page: 1, limit: 5, total: deleted ? 0 : 1, totalPages: 1 },
          summary: {
            totalCents: deleted ? 0 : 5000,
            methods: { cash: 0, card: deleted ? 0 : 5000, cheque: 0, transfer: 0 },
          },
        }
      : patient,
  );
  mocks.remove.mockImplementation(async () => {
    deleted = true;
    return { id: payment.id };
  });
});
function show() {
  render(
    <NotificationProvider>
      <MemoryRouter initialEntries={['/patients/' + patient.id]}>
        <Routes>
          <Route path="/patients/:id" element={<PatientDetailPage />} />
        </Routes>
      </MemoryRouter>
    </NotificationProvider>,
  );
}
test('onglets : informations initiales, navigation clavier et chargement différé des paiements', async () => {
  show();
  const information = await screen.findByRole('tab', { name: 'Informations' });
  expect(information).toHaveAttribute('aria-selected', 'true');
  expect(mocks.get).not.toHaveBeenCalledWith(
    expect.stringContaining('/payments'),
    expect.anything(),
  );
  fireEvent.keyDown(information, { key: 'ArrowRight' });
  const payments = screen.getByRole('tab', { name: 'Paiements' });
  expect(payments).toHaveFocus();
  expect(payments).toHaveAttribute('aria-selected', 'true');
  await screen.findByText('03/11/2026');
  expect(mocks.get).toHaveBeenCalledWith('/patients/' + patient.id + '/payments', {
    page: 1,
    limit: 5,
  });
  const panel = screen.getByRole('tabpanel', { name: 'Paiements' });
  expect(panel).toHaveTextContent('Total : 50');
  expect(within(panel).getByText('Espèces', { selector: 'dt' })).toBeInTheDocument();
  expect(within(panel).getAllByText('0 €').length).toBe(3);
  fireEvent.keyDown(payments, { key: 'Home' });
  expect(information).toHaveFocus();
  expect(screen.getByRole('tabpanel', { name: 'Informations' })).toBeVisible();
});
test('droit de lecture absent : onglet et requête de paiements absents', async () => {
  mocks.can.mockImplementation((permission) => permission === 'patients.read');
  show();
  await screen.findByRole('tab', { name: 'Informations' });
  expect(screen.queryByRole('tab', { name: 'Paiements' })).not.toBeInTheDocument();
  expect(mocks.get).not.toHaveBeenCalledWith(
    expect.stringContaining('/payments'),
    expect.anything(),
  );
});
test('lecture seule : récapitulatif sans suppression', async () => {
  mocks.can.mockImplementation((permission) =>
    ['patients.read', 'payments.read'].includes(permission),
  );
  show();
  fireEvent.click(await screen.findByRole('tab', { name: 'Paiements' }));
  await screen.findByText('03/11/2026');
  expect(screen.queryByRole('button', { name: /Supprimer/ })).not.toBeInTheDocument();
});
test('rechargement en erreur : aucun ancien total visible, nouvelle tentative proposée', async () => {
  mocks.get.mockImplementation(async (path) => {
    if (path.endsWith('/payments')) throw new Error('Réseau indisponible');
    return patient;
  });
  show();
  fireEvent.click(await screen.findByRole('tab', { name: 'Paiements' }));
  await screen.findByRole('button', { name: 'Réessayer' });
  expect(screen.getByRole('tabpanel', { name: 'Paiements' })).not.toHaveTextContent('Total :');
});

test('tableau des paiements toujours consultatif, même avec tous les droits', async () => {
  mocks.can.mockReturnValue(true);
  const get = mocks.get.getMockImplementation();
  mocks.get.mockImplementation(async (path) => {
    const result = await get(path);
    return path.endsWith('/payments')
      ? {
          ...result,
          items: [
            { ...payment, id: 'pending', method: 'cheque', bankDeposited: false },
            { ...payment, id: 'deposited', method: 'cash', bankDeposited: true },
            { ...payment, id: 'transfer', method: 'transfer', bankDeposited: null },
            payment,
          ],
        }
      : result;
  });
  show();
  fireEvent.click(await screen.findByRole('tab', { name: 'Paiements' }));
  const table = await screen.findByRole('table', { name: 'Paiements du patient' });
  expect(table).toHaveClass('data-table', 'payment-deposits-table');
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent),
  ).toEqual(['Date', 'Type de paiement', 'Montant', 'Dépôt']);
  expect(within(table).getAllByRole('row')).toHaveLength(5);
  for (const label of ['À déposer', 'Déposé', 'Sur le compte', 'Sans objet']) {
    expect(within(table).getByText(label)).toBeInTheDocument();
  }
  expect(within(table).queryByRole('button')).not.toBeInTheDocument();
  expect(within(table).queryByRole('checkbox')).not.toBeInTheDocument();
  expect(within(table).queryByRole('link')).not.toBeInTheDocument();
  expect(mocks.remove).not.toHaveBeenCalled();
});
