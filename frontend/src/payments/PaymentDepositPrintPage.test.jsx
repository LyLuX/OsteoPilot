import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import PaymentDepositPrintPage from './PaymentDepositPrintPage.jsx';
import { NotificationProvider } from '../notifications/Notifications.jsx';
const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../api/client.js', async (original) => ({
  ...(await original()),
  api: { post: mocks.post },
}));
const data = {
  method: 'cash',
  cabinetName: 'Cabinet de test',
  totalCents: 303,
  items: [
    {
      id: 'payment-a',
      version: 1,
      date: '2026-11-07',
      amountCents: 101,
      patient: { firstName: 'Fictif', lastName: 'Exemple' },
    },
    {
      id: 'payment-b',
      version: 2,
      date: '2026-11-06',
      amountCents: 202,
      patient: { firstName: 'Fictive', lastName: 'Test' },
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.post.mockResolvedValue({ ids: ['payment-a', 'payment-b'], totalCents: 303 });
  vi.spyOn(window, 'print').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
const show = (props = {}) =>
  render(
    <NotificationProvider>
      <PaymentDepositPrintPage data={data} onBack={vi.fn()} canDeposit canReprint {...props} />
    </NotificationProvider>,
  );

test('aperçu sans mutation : noms, dates, montants et total ; retour sans dépôt', () => {
  const onBack = vi.fn();
  show({ onBack });
  expect(screen.getByRole('table', { name: 'Paiements du bordereau' })).toHaveTextContent(
    'Exemple Fictif',
  );
  expect(screen.getByRole('table')).toHaveTextContent('07/11/2026');
  expect(screen.getByText(/3,03/)).toBeInTheDocument();
  expect(screen.getByText('Nombre de paiements').querySelector('strong')).toHaveTextContent('2');
  expect(mocks.post).not.toHaveBeenCalled();
  expect(window.print).not.toHaveBeenCalled();
  expect(document.querySelector('.deposit-printable')).not.toHaveTextContent('Exemple Fictif');
  fireEvent.click(screen.getByRole('button', { name: 'Retour aux paiements' }));
  expect(onBack).toHaveBeenCalledOnce();
});

test('impression après commit uniquement, versions exactes, réimpression sans nouvelle mutation', async () => {
  let resolve;
  mocks.post.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  show();
  const button = screen.getByRole('button', { name: 'Imprimer' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(mocks.post).toHaveBeenCalledOnce();
  expect(window.print).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Retour aux paiements' })).toBeDisabled();
  await act(async () => resolve({ ids: ['payment-a', 'payment-b'], totalCents: 303 }));
  expect(window.print).toHaveBeenCalledOnce();
  expect(document.querySelector('.deposit-printable')).toHaveTextContent('Exemple Fictif');
  expect(document.querySelector('.deposit-printable .deposit-print-count')).toHaveTextContent(
    'Nombre de paiements 2',
  );
  expect(mocks.post).toHaveBeenCalledWith(
    '/payments/deposits',
    {
      method: 'cash',
      items: [
        { id: 'payment-a', version: 1 },
        { id: 'payment-b', version: 2 },
      ],
    },
    { headers: { 'Idempotency-Key': expect.any(String) } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Réimprimer' }));
  await waitFor(() => expect(window.print).toHaveBeenCalledTimes(2));
  expect(mocks.post).toHaveBeenCalledOnce();
});

test('conflit : aucune impression, retour exigé pour une sélection à jour', async () => {
  mocks.post.mockRejectedValue({
    response: { status: 409, data: { error: { message: 'La sélection a changé.' } } },
  });
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Imprimer' }));
  await screen.findByRole('alert');
  expect(window.print).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Imprimer' })).toBeDisabled();
});

test('échec réseau : aucune impression et reprise avec la même clé idempotente', async () => {
  mocks.post.mockRejectedValueOnce(new Error('Réseau indisponible'));
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Imprimer' }));
  await screen.findByRole('alert');
  expect(window.print).not.toHaveBeenCalled();
  const key = mocks.post.mock.calls[0][2].headers['Idempotency-Key'];
  fireEvent.click(screen.getByRole('button', { name: 'Imprimer' }));
  await waitFor(() => expect(window.print).toHaveBeenCalledOnce());
  expect(mocks.post.mock.calls[1][2].headers['Idempotency-Key']).toBe(key);
});

test('boîte d’impression indisponible : dépôt conservé, réimpression possible', async () => {
  window.print.mockImplementationOnce(() => {
    throw new Error('Imprimante indisponible');
  });
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Imprimer' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Le dépôt est enregistré.');
  fireEvent.click(screen.getByRole('button', { name: 'Réimprimer' }));
  await waitFor(() => expect(window.print).toHaveBeenCalledTimes(2));
  expect(mocks.post).toHaveBeenCalledOnce();
});

test('bordereau chèques : nom du cabinet, numéros avec zéros initiaux et numéro absent', async () => {
  show({
    data: {
      ...data,
      method: 'cheque',
      items: [
        { ...data.items[0], chequeNumber: '0012345' },
        { ...data.items[1], chequeNumber: null },
      ],
    },
  });
  const table = screen.getByRole('table', { name: 'Paiements du bordereau' });
  expect(table).toHaveTextContent('0012345');
  expect(table).toHaveTextContent('—');
  expect(screen.getByRole('columnheader', { name: 'Numéro de chèque' })).toBeInTheDocument();
  expect(document.querySelector('.deposit-print-header')).toHaveTextContent('Cabinet de test');
  expect(document.querySelector('.deposit-print-footer')).toHaveTextContent('Cabinet de test');
  expect(document.querySelector('.deposit-print-preview')).not.toHaveTextContent('OstéoPilot');
  expect(document.title).toBe('Bordereau de dépôt - Cabinet de test');
  fireEvent.click(screen.getByRole('button', { name: 'Imprimer' }));
  await waitFor(() => expect(window.print).toHaveBeenCalledOnce());
  const printed = document.querySelector('.deposit-printable');
  expect(printed).toHaveTextContent('Cabinet de test');
  expect(printed).toHaveTextContent('0012345');
  expect(printed).not.toHaveTextContent('OstéoPilot');
});

test('bordereau espèces sans colonne de numéro de chèque', () => {
  show();
  expect(screen.queryByRole('columnheader', { name: 'Numéro de chèque' })).not.toBeInTheDocument();
});

test('bordereau archivé : réimpression en lecture seule, même si le dépôt a été annulé', async () => {
  show({
    data: { ...data, reconstructed: true, createdAt: '2026-11-07T12:00:00Z' },
    readOnly: true,
    backLabel: 'Retour à l’historique',
  });
  expect(screen.getByRole('table')).toHaveTextContent('Bordereau reconstitué');
  expect(document.querySelector('.deposit-printable')).toHaveTextContent('Exemple Fictif');
  expect(screen.queryByText(/Le bouton Imprimer valide/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Réimprimer' }));
  await waitFor(() => expect(window.print).toHaveBeenCalledOnce());
  expect(mocks.post).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Retour à l’historique' })).toBeInTheDocument();
});
test('la première impression utilise le document archivé renvoyé par le serveur', async () => {
  mocks.post.mockResolvedValue({
    slip: {
      ...data,
      cabinetName: 'Cabinet au dépôt',
      items: [{ ...data.items[0], patient: { firstName: 'Nom validé', lastName: 'Archive' } }],
    },
  });
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Imprimer' }));
  await waitFor(() => expect(window.print).toHaveBeenCalledOnce());
  expect(document.querySelector('.deposit-printable')).toHaveTextContent('Cabinet au dépôt');
  expect(document.querySelector('.deposit-printable')).toHaveTextContent('Archive Nom validé');
});

test('sans droit de réimpression, seule la première impression du dépôt reste possible', async () => {
  show({ canReprint: false });
  fireEvent.click(screen.getByRole('button', { name: 'Imprimer' }));
  await waitFor(() => expect(window.print).toHaveBeenCalledOnce());
  expect(screen.queryByRole('button', { name: 'Réimprimer' })).not.toBeInTheDocument();
});
test('document historique sans droit de réimpression : aucune commande d’impression', () => {
  show({ readOnly: true, canReprint: false });
  expect(screen.queryByRole('button', { name: 'Réimprimer' })).not.toBeInTheDocument();
  expect(mocks.post).not.toHaveBeenCalled();
  expect(window.print).not.toHaveBeenCalled();
});
