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
let acceptedMethods;
beforeEach(() => {
  vi.clearAllMocks();
  records = [];
  acceptedMethods = ['cash', 'card'];
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
      return { days: [...days.values()], acceptedMethods };
    }
    if (path === '/payments/patients')
      return { items: [patient], pagination: { page: 1, total: 1, totalPages: 1 } };
    const filtered = records.filter((record) =>
      query.date
        ? record.date === query.date
        : record.date >= query.from && record.date <= query.to,
    );
    return {
      items: filtered
        .slice((query.page - 1) * query.limit, query.page * query.limit)
        .map((record) => ({ ...record, patient })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / query.limit)),
      },
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
  expect(screen.getByRole('heading', { name: 'novembre 2026', level: 2 })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Aujourd’hui' }));
  expect(screen.getByRole('heading', { name: 'octobre 2026' })).toBeInTheDocument();
  expect(
    within(screen.getByRole('group', { name: 'Calendrier mensuel' })).getAllByRole('button', {
      pressed: true,
    }),
  ).toHaveLength(1);
  expect(screen.queryByRole('button', { name: /rendez-vous/i })).not.toBeInTheDocument();
});

test('chaque jour vide affiche les moyens acceptés à zéro et le total, sélectionne la liste du jour', async () => {
  show();
  const today = screen.getByRole('button', { name: 'jeudi 29 octobre 2026' });
  await waitFor(() => expect(within(today).getAllByText(/^0\s*€$/)).toHaveLength(3));
  expect(screen.getByText('Aucun paiement enregistré pour ce jour.')).toBeInTheDocument();
  for (const [label, variant] of [
    ['Espèces', 'cash'],
    ['Carte', 'card'],
  ]) {
    const icon = within(today).getByTitle(label);
    expect(icon).toHaveClass('payment-method', 'payment-method--' + variant);
    expect(icon.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(within(icon).getByText(label)).toHaveClass('visually-hidden');
  }
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

test('moyens désactivés absents des cases et de la légende, historique conservé', async () => {
  acceptedMethods = ['cash'];
  records = [{ id: 'old', date: '2026-10-29', method: 'card', amountCents: 1234 }];
  show();
  const day = screen.getByRole('button', { name: 'jeudi 29 octobre 2026' });
  await waitFor(() => expect(within(day).getByText('Autres')).toBeInTheDocument());
  expect(within(day).queryByTitle('Carte')).not.toBeInTheDocument();
  expect(
    within(screen.getByLabelText('Légende des moyens de paiement')).queryByTitle('Carte'),
  ).not.toBeInTheDocument();
  expect(within(day).getAllByText(/12,34/)).toHaveLength(2);
  expect(screen.getByText('Total : 12,34 €', { exact: false })).toBeInTheDocument();
});
test('vues semaine et année : périodes, cumuls mensuels et détails du panneau', async () => {
  records = [
    { id: 'a', date: '2026-10-29', method: 'cash', amountCents: 101 },
    { id: 'b', date: '2026-10-30', method: 'card', amountCents: 202 },
    { id: 'c', date: '2026-11-01', method: 'cash', amountCents: 303 },
  ];
  show();
  await userEvent.click(screen.getByRole('button', { name: 'Semaine', exact: true }));
  expect(
    screen.getByRole('group', { name: 'Calendrier hebdomadaire' }).querySelectorAll('button'),
  ).toHaveLength(7);
  expect(screen.getAllByRole('heading', { name: 'Semaine 44 · 2026' })).toHaveLength(2);
  await waitFor(() =>
    expect(mocks.get).toHaveBeenCalledWith('/payments', {
      from: '2026-10-26',
      to: '2026-11-01',
      page: 1,
      limit: 10,
    }),
  );
  expect(await screen.findByText(/Total : 6,06/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'vendredi 30 octobre 2026' }));
  expect(await screen.findByRole('list', { name: 'Paiements du jour' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Toute la semaine' }));
  expect(await screen.findByRole('list', { name: 'Paiements de la période' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Année', exact: true }));
  const annual = screen.getByRole('group', { name: 'Calendrier annuel' });
  expect(within(annual).getAllByRole('button')).toHaveLength(12);
  await waitFor(() =>
    expect(mocks.get).toHaveBeenCalledWith('/payments/summary', {
      from: '2026-01-01',
      to: '2026-12-31',
    }),
  );
  const october = within(annual).getByRole('button', { name: 'octobre 2026' });
  await waitFor(() => expect(within(october).getByText(/3,03/)).toBeInTheDocument());
  await userEvent.click(october);
  await waitFor(() =>
    expect(mocks.get).toHaveBeenCalledWith('/payments', {
      from: '2026-10-01',
      to: '2026-10-31',
      page: 1,
      limit: 10,
    }),
  );
  expect(screen.getByRole('button', { name: 'Toute l’année' })).toBeInTheDocument();
  fireEvent.keyDown(october, { key: 'ArrowRight' });
  expect(within(annual).getByRole('button', { name: 'novembre 2026' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Mois', exact: true }));
  expect(screen.getByRole('group', { name: 'Calendrier mensuel' })).toBeInTheDocument();
  expect(mocks.get).toHaveBeenCalledWith('/payments', {
    from: '2026-11-01',
    to: '2026-11-30',
    page: 1,
    limit: 10,
  });
});

test('changement de vue et de période : retour à la première page, navigation annuelle', async () => {
  records = Array.from({ length: 12 }, (_, i) => ({
    id: 'p' + i,
    date: '2026-10-29',
    method: 'cash',
    amountCents: 100,
  }));
  show();
  const next = await screen.findByRole('button', { name: 'Suivant', exact: true });
  await waitFor(() => expect(next).toBeEnabled());
  await userEvent.click(next);
  await waitFor(() =>
    expect(mocks.get).toHaveBeenCalledWith('/payments', { date: '2026-10-29', page: 2, limit: 10 }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Année', exact: true }));
  await waitFor(() =>
    expect(mocks.get).toHaveBeenCalledWith('/payments', {
      from: '2026-01-01',
      to: '2026-12-31',
      page: 1,
      limit: 10,
    }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Année suivante' }));
  await waitFor(() =>
    expect(mocks.get).toHaveBeenCalledWith('/payments/summary', {
      from: '2027-01-01',
      to: '2027-12-31',
    }),
  );
  expect(screen.getAllByRole('heading', { name: '2027' })).toHaveLength(2);
  await userEvent.click(screen.getByRole('button', { name: 'Année précédente' }));
  await waitFor(() =>
    expect(mocks.get).toHaveBeenLastCalledWith('/payments', {
      from: '2026-01-01',
      to: '2026-12-31',
      page: 1,
      limit: 10,
    }),
  );
});
test('aucun moyen accepté : seulement le total à zéro', async () => {
  acceptedMethods = [];
  show();
  const day = screen.getByRole('button', { name: 'jeudi 29 octobre 2026' });
  await waitFor(() => expect(within(day).getByText(/^0\s*€$/)).toBeInTheDocument());
  expect(day.querySelector('.payment-method')).toBeNull();
});
