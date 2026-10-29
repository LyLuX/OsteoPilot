import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, vi, test, expect } from 'vitest';
import DashboardPage from './DashboardPage.jsx';
import userEvent from '@testing-library/user-event';
import { NotificationProvider } from '../notifications/Notifications.jsx';
const patient = {
  id: '4a9fb270-9222-4e80-bf91-408c00df25a2',
  lastName: 'Exemple',
  firstName: 'Fictif',
};
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), can: vi.fn() }));
vi.mock('../api/client.js', async (original) => ({
  ...(await original()),
  api: { get: mocks.get, post: mocks.post },
}));
let records;
beforeEach(() => {
  vi.clearAllMocks();
  records = [];
  mocks.can.mockReturnValue(true);
  mocks.get.mockImplementation(async (path, query) => {
    if (path === '/payments/summary') {
      const days = new Map();
      for (const record of records) {
        const day = days.get(record.date) || {
          date: record.date,
          methods: { cash: 0, card: 0, cheque: 0, transfer: 0 },
          totalCents: 0,
        };
        day.methods[record.method] += record.amountCents;
        day.totalCents += record.amountCents;
        days.set(record.date, day);
      }
      return { days: [...days.values()], acceptedMethods: ['cash', 'card'] };
    }
    if (path === '/payments/patients')
      return { items: [patient], pagination: { page: 1, total: 1, totalPages: 1 } };
    return {
      items: records
        .filter((record) => record.date === query.date)
        .map((record) => ({ ...record, patient })),
      pagination: { page: 1, total: records.length, totalPages: 1 },
    };
  });
  mocks.post.mockImplementation(async (_, values) => {
    const payment = { ...values, id: 'payment-' + records.length };
    records.push(payment);
    return payment;
  });
});
function show() {
  return render(
    <NotificationProvider>
      <MemoryRouter>
        <DashboardPage now={new Date('2026-10-29T12:00:00Z')} />
      </MemoryRouter>
    </NotificationProvider>,
  );
}
async function openPayment() {
  const button = await screen.findByRole('button', { name: 'Enregistrer un paiement' });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  return screen.getByRole('dialog', { name: 'Enregistrer un paiement' });
}
vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { firstName: 'Fictif' }, can: mocks.can }),
}));
test('jour courant, mois précédent/suivant, aujourd’hui et clavier', () => {
  render(
    <MemoryRouter>
      <DashboardPage now={new Date('2026-10-29T12:00:00Z')} />
    </MemoryRouter>,
  );
  const today = screen.getByRole('button', { name: 'jeudi 29 octobre 2026' });
  expect(today).toHaveAttribute('aria-current', 'date');
  expect(today).toHaveAttribute('tabindex', '0');
  fireEvent.keyDown(today, { key: 'ArrowRight' });
  expect(screen.getByRole('button', { name: 'vendredi 30 octobre 2026' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }));
  expect(screen.getByRole('heading', { name: 'novembre 2026' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Aujourd’hui' }));
  expect(screen.getByRole('heading', { name: 'octobre 2026' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: /rendez-vous/i })).not.toBeInTheDocument();
});

test('chaque jour vide affiche les quatre montants à zéro et le total, sélectionne la liste du jour', async () => {
  show();
  const today = screen.getByRole('button', { name: 'jeudi 29 octobre 2026' });
  await waitFor(() => expect(within(today).getAllByText(/^0\s*€$/)).toHaveLength(5));
  expect(screen.getByText('Aucun paiement enregistré pour ce jour.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'vendredi 30 octobre 2026' }));
  expect(mocks.get).toHaveBeenLastCalledWith('/payments', {
    date: '2026-10-30',
    page: 1,
    limit: 10,
  });
});

test('modale : patient obligatoire, montant en centimes et actualisation calendrier/liste après création', async () => {
  show();
  const dialog = await openPayment();
  await within(dialog).findByRole('option', { name: 'Exemple Fictif' });
  expect(within(dialog).getByLabelText(/Date du paiement/)).toHaveValue('2026-10-29');
  expect(within(dialog).queryByRole('option', { name: 'Chèque' })).not.toBeInTheDocument();
  await userEvent.selectOptions(
    within(dialog).getByRole('combobox', { name: 'Patient *' }),
    patient.id,
  );
  await userEvent.type(within(dialog).getByLabelText(/Montant en euros/), '60,50');
  await userEvent.selectOptions(
    within(dialog).getByRole('combobox', { name: 'Moyen de paiement *' }),
    'card',
  );
  await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le paiement' }));
  expect(mocks.post).toHaveBeenCalledWith(
    '/payments',
    { patientId: patient.id, date: '2026-10-29', method: 'card', amountCents: 6050 },
    { headers: { 'Idempotency-Key': expect.stringMatching(/^[a-f0-9-]{36}$/) } },
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(
    await within(screen.getByRole('list', { name: 'Paiements du jour' })).findByText(
      'Exemple Fictif',
    ),
  ).toBeInTheDocument();
  const today = screen.getByRole('button', { name: 'jeudi 29 octobre 2026' });
  await waitFor(() => expect(within(today).getAllByText(/^60,50\s*€$/)).toHaveLength(2));
  expect(screen.getByText('Paiement enregistré.').closest('.toast')).toHaveClass(
    'bg-success-subtle',
  );
});

test('modale : validation Bootstrap et annulation sans création', async () => {
  show();
  const dialog = await openPayment();
  await within(dialog).findByRole('option', { name: 'Exemple Fictif' });
  await userEvent.type(within(dialog).getByLabelText(/Montant en euros/), '0');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le paiement' }));
  expect(within(dialog).getByRole('combobox', { name: 'Patient *' })).toHaveClass('is-invalid');
  expect(within(dialog).getByLabelText(/Montant en euros/)).toHaveClass('is-invalid');
  expect(mocks.post).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('paiement refusé : formulaire conservé, erreur de champ et reprise avec la même clé', async () => {
  mocks.post.mockRejectedValueOnce({
    response: { data: { error: { message: 'Enregistrement indisponible.' } } },
  });
  show();
  const dialog = await openPayment();
  await within(dialog).findByRole('option', { name: 'Exemple Fictif' });
  await userEvent.selectOptions(
    within(dialog).getByRole('combobox', { name: 'Patient *' }),
    patient.id,
  );
  await userEvent.type(within(dialog).getByLabelText(/Montant en euros/), '10');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le paiement' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enregistrement indisponible.');
  expect(within(dialog).getByLabelText(/Montant en euros/)).toHaveValue('10');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le paiement' }));
  expect(mocks.post.mock.calls[1][2]).toEqual(mocks.post.mock.calls[0][2]);
});

test('droits : ni requêtes ni montants ni bouton de création sans accès aux paiements', () => {
  mocks.can.mockImplementation((permission) => permission === 'dashboard.read');
  show();
  expect(screen.queryByRole('button', { name: 'Enregistrer un paiement' })).not.toBeInTheDocument();
  expect(
    screen.getByText('Vous ne disposez pas du droit de consulter les paiements.'),
  ).toBeInTheDocument();
  expect(mocks.get).not.toHaveBeenCalled();
});
