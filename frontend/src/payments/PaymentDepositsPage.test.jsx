import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { NotificationProvider } from '../notifications/Notifications.jsx';
import PaymentDepositsPage from './PaymentDepositsPage.jsx';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  remove: vi.fn(),
  can: vi.fn(),
}));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ can: mocks.can }) }));
vi.mock('../api/client.js', async (original) => ({
  ...(await original()),
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.remove },
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
  mocks.get.mockImplementation(async (path, { page, limit, method }) => {
    if (path === '/payments/deposits/cancellable')
      return {
        method,
        items: records
          .filter((payment) => payment.method === method && payment.bankDeposited)
          .map(({ id, version }) => ({ id, version })),
      };
    return {
      depositedPayments: Object.fromEntries(
        ['cash', 'cheque'].map((method) => [
          method,
          records.filter((payment) => payment.method === method && payment.bankDeposited).length,
        ]),
      ),
      pendingDeposits: Object.fromEntries(
        ['cash', 'cheque'].map((method) => [
          method,
          records.filter((payment) => payment.method === method && !payment.bankDeposited).length,
        ]),
      ),
      items: structuredClone(records.slice((page - 1) * limit, page * limit)),
      pagination: {
        page,
        limit,
        total: records.length,
        totalPages: Math.max(1, Math.ceil(records.length / limit)),
      },
    };
  });
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
  expect(within(table).getAllByText('Sans objet')).toHaveLength(1);
  expect(within(table).getAllByText('Sur le compte')).toHaveLength(1);
  expect(mocks.get).toHaveBeenCalledWith('/payments', { page: 1, limit: 5 });
  expect(screen.getByLabelText('Nombre d’éléments par page')).toHaveValue('5');
  expect(within(table).getAllByRole('row')).toHaveLength(6);
  fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
  await waitFor(() =>
    expect(mocks.get).toHaveBeenLastCalledWith('/payments', { page: 2, limit: 5 }),
  );
  expect(await screen.findByText('Patient 5 Fictif')).toBeInTheDocument();
  expect(screen.queryByText('Patient 0 Fictif')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Nombre d’éléments par page'), {
    target: { value: '10' },
  });
  await waitFor(() =>
    expect(mocks.get).toHaveBeenLastCalledWith('/payments', { page: 1, limit: 10 }),
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
  expect(screen.getByRole('checkbox', { name: 'Paiements en espèces' })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Paiements par chèque' })).toBeDisabled();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('sélection globale exclusive, pages suivantes et ajustement individuel avec état partiel', async () => {
  records = records.slice(0, 6);
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
  await screen.findByText('Patient 5 Fictif');
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
  expect(checkboxes).toHaveLength(2);
  expect(within(table).getByRole('img', { name: 'Paiement déposé' })).toBeInTheDocument();
  const transferRow = within(table).getAllByRole('row').at(-1);
  expect(within(transferRow).queryByRole('checkbox')).not.toBeInTheDocument();
  expect(transferRow).toHaveTextContent('Sur le compte');
  for (const checkbox of checkboxes.slice(1)) expect(checkbox).toBeDisabled();
  const cash = screen.getByRole('checkbox', { name: 'Paiements en espèces' });
  fireEvent.click(cash);
  expect(checkboxes[0]).toBeChecked();
  fireEvent.click(cash);
  expect(checkboxes[0]).not.toBeChecked();
  expect(cash).not.toBeChecked();
});

test('suppression confirmée depuis Déposer : API versionnée, sélection effacée et retour page 1', async () => {
  records = records.slice(0, 6);
  show();
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Paiements par chèque' }));
  fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
  await screen.findByText('Patient 5 Fictif');
  fireEvent.click(screen.getByRole('button', { name: /Supprimer le paiement/ }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Patient 5 Fictif');
  expect(mocks.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  expect(await screen.findByText('Patient 0 Fictif')).toBeInTheDocument();
  expect(mocks.remove).toHaveBeenCalledWith('/payments/payment-5', {
    version: 1,
    confirmed: true,
  });
  expect(mocks.get).toHaveBeenLastCalledWith('/payments', { page: 1, limit: 5 });
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

test('Déposer ouvre le bordereau ; impression, coche verte puis annulation remplaçant la corbeille', async () => {
  records = [records[0], records[4]];
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  mocks.post.mockImplementation(async (path, input) => {
    if (path === '/payments/deposits/preview')
      return {
        method: input.method,
        cabinetName: 'Cabinet de test',
        items: structuredClone(records),
        totalCents: 9000,
      };
    for (const payment of records) {
      payment.bankDeposited = true;
      payment.version += 1;
    }
    return { ids: records.map((payment) => payment.id), totalCents: 9000 };
  });
  mocks.patch.mockImplementation(async (path, input) => {
    Object.assign(
      records.find((payment) => path === '/payments/' + payment.id + '/bank-deposit'),
      input,
      { version: input.version + 1 },
    );
    return {};
  });
  show();
  await screen.findByRole('table');
  expect(screen.getByRole('button', { name: 'Déposer' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Paiements en espèces' }));
  fireEvent.click(screen.getByRole('button', { name: 'Déposer' }));
  await screen.findByRole('heading', { name: 'Impression du dépôt' });
  expect(mocks.post).toHaveBeenCalledWith('/payments/deposits/preview', {
    method: 'cash',
    all: true,
    ids: [],
    excluded: [],
  });
  expect(print).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Imprimer' }));
  await waitFor(() => expect(print).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Retour aux paiements' }));
  const table = await screen.findByRole('table', { name: 'Tous les paiements' });
  expect(within(table).queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Paiements en espèces' })).toBeEnabled();
  expect(within(table).getAllByRole('img', { name: 'Paiement déposé' })).toHaveLength(2);
  expect(
    within(table).queryByRole('button', { name: /Supprimer le paiement/ }),
  ).not.toBeInTheDocument();
  const cancel = within(table).getAllByRole('button', { name: 'Annuler le dépôt' })[0];
  expect(cancel.querySelector('svg')).not.toBeNull();
  fireEvent.click(cancel);
  await waitFor(() =>
    expect(within(screen.getByRole('table')).getAllByRole('checkbox')).toHaveLength(1),
  );
  expect(screen.getByRole('checkbox', { name: 'Paiements en espèces' })).toBeEnabled();
  expect(mocks.patch).toHaveBeenCalledWith('/payments/payment-0/bank-deposit', {
    bankDeposited: false,
    version: 2,
  });
  print.mockRestore();
});

test('paiement déposé : annulation soumise au droit d’annulation, suppression toujours absente', async () => {
  records = [{ ...records[0], bankDeposited: true }];
  mocks.can.mockImplementation((permission) => permission !== 'payments.deposit.cancel');
  show();
  const table = await screen.findByRole('table');
  expect(within(table).getByRole('img', { name: 'Paiement déposé' })).toBeInTheDocument();
  expect(within(table).queryByRole('button')).not.toBeInTheDocument();
  expect(within(table).queryByRole('checkbox')).not.toBeInTheDocument();
});

test('annulation groupée désactivée sans type ou sans dépôt, y compris si un autre type est déposé', async () => {
  records[25].bankDeposited = true;
  show();
  await screen.findByRole('table');
  const button = screen.getByRole('button', { name: 'Annuler les dépôts' });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Paiements en espèces' }));
  await waitFor(() =>
    expect(mocks.get).toHaveBeenCalledWith('/payments/deposits/cancellable', { method: 'cash' }),
  );
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Paiements par chèque' }));
  await waitFor(() => expect(button).toBeEnabled());
  expect(mocks.post).not.toHaveBeenCalled();
});

test('annulation confirmée de tous les chèques sur toutes les pages, espèces préservées', async () => {
  records[0].bankDeposited = true;
  records[5].bankDeposited = true;
  records[25].bankDeposited = true;
  mocks.post.mockImplementation(async (path, input) => {
    if (path !== '/payments/deposits/cancel') throw new Error('Route inattendue');
    for (const { id, version } of input.items)
      Object.assign(
        records.find((payment) => payment.id === id),
        { bankDeposited: false, version: version + 1 },
      );
    return { count: input.items.length };
  });
  show();
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Paiements par chèque' }));
  const button = screen.getByRole('button', { name: 'Annuler les dépôts' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(screen.getByRole('dialog')).toHaveTextContent('par chèque');
  expect(screen.getByRole('dialog')).toHaveTextContent('2 paiement(s)');
  expect(mocks.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  await waitFor(() => expect(button).toBeDisabled());
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mocks.post).toHaveBeenCalledWith(
    '/payments/deposits/cancel',
    {
      method: 'cheque',
      items: [
        { id: 'payment-5', version: 1 },
        { id: 'payment-25', version: 1 },
      ],
      confirmed: true,
    },
    { headers: { 'Idempotency-Key': expect.any(String) } },
  );
  expect(records[0].bankDeposited).toBe(true);
  expect(records[5].bankDeposited).toBe(false);
  expect(records[25].bankDeposited).toBe(false);
  expect(records[1].version).toBe(1);
  expect(screen.getByRole('checkbox', { name: 'Paiements par chèque' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Paiements par chèque' })).not.toBePartiallyChecked();
  expect(screen.getByRole('button', { name: 'Déposer' })).toBeDisabled();
  for (const checkbox of within(screen.getByRole('table')).getAllByRole('checkbox'))
    expect(checkbox).not.toBeChecked();
  expect(screen.getByText('Dépôts annulés.').closest('.toast')).toHaveClass('bg-warning-subtle');
});

test('lecture des dépôts en échec : annulation désactivée jusqu’à une nouvelle tentative', async () => {
  records[0].bankDeposited = true;
  const normalGet = mocks.get.getMockImplementation();
  let failed = true;
  mocks.get.mockImplementation((path, query) => {
    if (path === '/payments/deposits/cancellable' && failed)
      return Promise.reject(new Error('Indisponible'));
    return normalGet(path, query);
  });
  show();
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Paiements en espèces' }));
  const retry = await screen.findByRole('button', { name: 'Réessayer' });
  const cancel = screen.getByRole('button', { name: 'Annuler les dépôts' });
  expect(cancel).toBeDisabled();
  failed = false;
  fireEvent.click(retry);
  await waitFor(() => expect(cancel).toBeEnabled());
});

test('conflit d’annulation : confirmation fermée et dépôts rechargés', async () => {
  records[0].bankDeposited = true;
  mocks.post.mockImplementation(async () => {
    records[0].bankDeposited = false;
    throw { response: { status: 409, data: { error: { message: 'Les dépôts ont changé.' } } } };
  });
  show();
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Paiements en espèces' }));
  const cancel = screen.getByRole('button', { name: 'Annuler les dépôts' });
  await waitFor(() => expect(cancel).toBeEnabled());
  fireEvent.click(cancel);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(cancel).toBeDisabled());
  expect(await screen.findByRole('alert')).toHaveTextContent('Les dépôts ont changé.');
});

test('annulation en cours : double clic ignoré, commandes désactivées et reprise avec la même clé', async () => {
  records[0].bankDeposited = true;
  let resolve;
  mocks.post.mockRejectedValueOnce(new Error('Réseau indisponible')).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  show();
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Paiements en espèces' }));
  const cancel = screen.getByRole('button', { name: 'Annuler les dépôts' });
  await waitFor(() => expect(cancel).toBeEnabled());
  fireEvent.click(cancel);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('checkbox', { name: 'Paiements en espèces' })).toBeChecked();
  const key = mocks.post.mock.calls[0][2].headers['Idempotency-Key'];
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  expect(mocks.post).toHaveBeenCalledTimes(2);
  expect(mocks.post.mock.calls[1][2].headers['Idempotency-Key']).toBe(key);
  expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled();
  for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeDisabled();
  await act(async () => {
    records[0].bankDeposited = false;
    resolve({ count: 1 });
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(cancel).toBeDisabled());
});

test('types désactivés sans paiement, disponibilité globale et type déposé encore sélectionnable', async () => {
  records = [
    { ...records[0], bankDeposited: true },
    ...records.filter((payment) => payment.method === 'transfer').slice(0, 5),
    records[4],
  ];
  show();
  await screen.findByRole('table');
  const cash = screen.getByRole('checkbox', { name: 'Paiements en espèces' });
  const cheque = screen.getByRole('checkbox', { name: 'Paiements par chèque' });
  expect(cash).toBeEnabled();
  expect(cheque).toBeDisabled();
  fireEvent.click(cash);
  expect(cash).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
  const row = (await screen.findByText('Patient 4 Fictif')).closest('tr');
  fireEvent.click(within(row).getByRole('button', { name: /Supprimer le paiement/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  await screen.findByText('Patient 0 Fictif');
  await waitFor(() => expect(cash).toBeEnabled());
  expect(cash).not.toBeChecked();
  expect(cheque).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Déposer' })).toBeDisabled();
});

test.each([
  ['cash', 'Paiements en espèces'],
  ['cheque', 'Paiements par chèque'],
])(
  'type %s entièrement déposé : sélection, annulation sur toutes les pages puis dépôt de nouveau disponible',
  async (method, label) => {
    records = records.slice(0, 6).map((payment) => ({ ...payment, method, bankDeposited: true }));
    mocks.post.mockImplementation(async (path, input) => {
      if (path !== '/payments/deposits/cancel') throw new Error('Route inattendue');
      for (const { id, version } of input.items)
        Object.assign(
          records.find((payment) => payment.id === id),
          {
            bankDeposited: false,
            version: version + 1,
          },
        );
      return { count: input.items.length };
    });
    show();
    const table = await screen.findByRole('table');
    expect(within(table).queryByRole('checkbox')).not.toBeInTheDocument();
    const type = screen.getByRole('checkbox', { name: label });
    expect(type).toBeEnabled();
    const deposit = screen.getByRole('button', { name: 'Déposer' });
    const cancel = screen.getByRole('button', { name: 'Annuler les dépôts' });
    fireEvent.click(type);
    await waitFor(() => expect(cancel).toBeEnabled());
    expect(type).toBeChecked();
    expect(deposit).toBeDisabled();
    fireEvent.click(deposit);
    expect(mocks.post).not.toHaveBeenCalled();
    fireEvent.click(cancel);
    expect(screen.getByRole('dialog')).toHaveTextContent('6 paiement(s)');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(type).toBeEnabled());
    expect(type).not.toBeChecked();
    expect(type).not.toBePartiallyChecked();
    expect(deposit).toBeDisabled();
    expect(cancel).toBeDisabled();
    for (const checkbox of within(screen.getByRole('table')).getAllByRole('checkbox'))
      expect(checkbox).not.toBeChecked();
    fireEvent.click(type);
    await waitFor(() => expect(deposit).toBeEnabled());
    await waitFor(() => expect(cancel).toBeDisabled());
    expect(records.every((payment) => !payment.bankDeposited)).toBe(true);
    expect(mocks.post).toHaveBeenCalledWith(
      '/payments/deposits/cancel',
      { method, items: records.map(({ id }) => ({ id, version: 1 })), confirmed: true },
      { headers: { 'Idempotency-Key': expect.any(String) } },
    );
  },
);

test('historique accessible sans sélection et avec le droit propre à l’historique, retour aux paiements', async () => {
  mocks.can.mockImplementation((permission) =>
    ['payments.read', 'payments.deposits.read'].includes(permission),
  );
  const get = mocks.get.getMockImplementation();
  mocks.get.mockImplementation((path, query) =>
    path === '/payments/deposits/history'
      ? Promise.resolve({ items: [], pagination: { page: 1, limit: 5, total: 0, totalPages: 1 } })
      : get(path, query),
  );
  show();
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('button', { name: 'Historique des dépôts' }));
  await screen.findByText('Aucun bordereau enregistré.');
  fireEvent.click(screen.getByRole('button', { name: 'Retour aux paiements' }));
  await screen.findByRole('table', { name: 'Tous les paiements' });
  expect(mocks.post).not.toHaveBeenCalled();
});

test('déposer et annuler sont commandés par des permissions distinctes', async () => {
  mocks.can.mockImplementation((permission) =>
    ['payments.read', 'payments.deposit.cancel'].includes(permission),
  );
  records[0].bankDeposited = true;
  show();
  await screen.findByRole('table');
  expect(screen.queryByRole('button', { name: 'Déposer' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Historique des dépôts' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Annuler le dépôt' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Paiements en espèces' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Annuler les dépôts' })).toBeEnabled(),
  );
});
test('déposant sans annulation : commande d’annulation absente, aucun chargement des dépôts annulables', async () => {
  mocks.can.mockImplementation((permission) =>
    ['payments.read', 'payments.deposit'].includes(permission),
  );
  records[0].bankDeposited = true;
  show();
  await screen.findByRole('table');
  expect(screen.getByRole('button', { name: 'Déposer' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Annuler les dépôts' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Annuler le dépôt' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Paiements en espèces' }));
  expect(mocks.get).not.toHaveBeenCalledWith('/payments/deposits/cancellable', expect.anything());
});
