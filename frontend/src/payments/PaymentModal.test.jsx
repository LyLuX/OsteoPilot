import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import PaymentModal from './PaymentModal.jsx';
import { NotificationProvider } from '../notifications/Notifications.jsx';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../api/client.js', async (original) => ({
  ...(await original()),
  api: { get: mocks.get, post: mocks.post },
}));
const patients = Array.from({ length: 151 }, (_, index) => ({
  id: 'patient-' + index,
  lastName: 'Exemple ' + String(index).padStart(3, '0'),
  firstName: 'Fictif',
}));
const tariff = { id: 'adult', label: 'Consultation adulte', amountCents: 5500, version: 1 };
let fail;
beforeEach(() => {
  vi.clearAllMocks();
  fail = false;
  mocks.get.mockImplementation(async (path, query) => {
    if (path === '/settings/tariffs') return { tariffs: [tariff] };
    if (fail && query.page === 2)
      throw {
        response: {
          status: 503,
          data: { error: { message: 'Chargement des patients indisponible.' } },
        },
      };
    return {
      items: patients.slice((query.page - 1) * query.limit, query.page * query.limit),
      pagination: { page: query.page, total: patients.length, totalPages: 2 },
    };
  });
  mocks.post.mockResolvedValue({ id: 'paiement-fictif' });
});
const show = (props = {}) =>
  render(
    <NotificationProvider>
      <PaymentModal
        date="2026-11-03"
        today="2026-11-03"
        acceptedMethods={['cash']}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
        {...props}
      />
    </NotificationProvider>,
  );
test('tous les patients au-delà du premier lot restent sélectionnables sans pagination visible', async () => {
  show();
  const select = screen.getByRole('combobox', { name: 'Patient *' });
  await waitFor(() => expect(select).toBeEnabled());
  fireEvent.click(select);
  await screen.findByRole('option', { name: 'Exemple 150 Fictif' });
  expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(151);
  expect(mocks.get).toHaveBeenCalledWith('/payments/patients', { page: 1, limit: 100 });
  expect(mocks.get).toHaveBeenCalledWith('/payments/patients', { page: 2, limit: 100 });
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('combobox', { name: 'Nombre d’éléments par page' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'Exemple 150 Fictif' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Tarif *' }), {
    target: { value: tariff.id },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
  await waitFor(() =>
    expect(mocks.post).toHaveBeenCalledWith(
      '/payments',
      expect.objectContaining({ patientId: 'patient-150', tariffId: tariff.id, amountCents: 5500 }),
      expect.anything(),
    ),
  );
});
test('erreur sur le second lot : aucune liste partielle puis rechargement complet', async () => {
  fail = true;
  show();
  const retry = await screen.findByRole('button', { name: 'Réessayer' });
  const select = screen.getByRole('combobox', { name: 'Patient *' });
  expect(select).toBeDisabled();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Enregistrer le paiement' })).toBeDisabled();
  fail = false;
  fireEvent.click(retry);
  await waitFor(() => expect(select).toBeEnabled());
  fireEvent.click(select);
  await screen.findByRole('option', { name: 'Exemple 150 Fictif' });
  expect(select).toBeEnabled();
  expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(151);
});
test('fermeture pendant le premier lot : aucune requête vers les pages suivantes', async () => {
  let resolve;
  mocks.get.mockImplementation((path) =>
    path === '/settings/tariffs'
      ? Promise.resolve({ tariffs: [tariff] })
      : new Promise((done) => {
          resolve = done;
        }),
  );
  const view = show();
  await waitFor(() => expect(resolve).toBeTypeOf('function'));
  view.unmount();
  await act(async () =>
    resolve({ items: patients.slice(0, 100), pagination: { page: 1, totalPages: 2 } }),
  );
  expect(mocks.get.mock.calls.filter(([path]) => path === '/payments/patients')).toHaveLength(1);
});

test('chèque : numéro facultatif, validation et conservation des zéros initiaux à la création', async () => {
  show({ acceptedMethods: ['cash', 'cheque'] });
  expect(screen.queryByLabelText('Numéro de chèque')).not.toBeInTheDocument();
  const patient = screen.getByRole('combobox', { name: 'Patient *' });
  await waitFor(() => expect(patient).toBeEnabled());
  fireEvent.click(patient);
  fireEvent.click(await screen.findByRole('option', { name: 'Exemple 000 Fictif' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Tarif *' }), {
    target: { value: tariff.id },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Moyen de paiement *' }), {
    target: { value: 'cheque' },
  });
  const number = screen.getByLabelText('Numéro de chèque');
  expect(number).toHaveAttribute('type', 'text');
  expect(number).toHaveAttribute('maxlength', '30');
  fireEvent.change(number, { target: { value: 'abc' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
  expect(mocks.post).not.toHaveBeenCalled();
  expect(number).toHaveAttribute('aria-invalid', 'true');
  fireEvent.change(number, { target: { value: '0012345' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
  await waitFor(() =>
    expect(mocks.post).toHaveBeenCalledWith(
      '/payments',
      expect.objectContaining({ method: 'cheque', chequeNumber: '0012345' }),
      expect.anything(),
    ),
  );
});

test('changer de moyen efface le numéro ; chèque sans numéro accepté', async () => {
  show({ acceptedMethods: ['cheque', 'cash'] });
  const patient = screen.getByRole('combobox', { name: 'Patient *' });
  await waitFor(() => expect(patient).toBeEnabled());
  fireEvent.click(patient);
  fireEvent.click(await screen.findByRole('option', { name: 'Exemple 000 Fictif' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Tarif *' }), {
    target: { value: tariff.id },
  });
  fireEvent.change(screen.getByLabelText('Numéro de chèque'), { target: { value: '0012345' } });
  const method = screen.getByRole('combobox', { name: 'Moyen de paiement *' });
  fireEvent.change(method, { target: { value: 'cash' } });
  expect(screen.queryByLabelText('Numéro de chèque')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledOnce());
  expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('chequeNumber');
  fireEvent.change(method, { target: { value: 'cheque' } });
  expect(screen.getByLabelText('Numéro de chèque')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
  expect(mocks.post.mock.calls[1][1]).toMatchObject({ method: 'cheque' });
  expect(mocks.post.mock.calls[1][1]).not.toHaveProperty('chequeNumber');
});
