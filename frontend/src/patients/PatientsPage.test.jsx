import { render, screen, within, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import PatientsPage from './PatientsPage.jsx';
import { NotificationProvider } from '../notifications/Notifications.jsx';
const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), can: vi.fn() }));
vi.mock('../api/client.js', async (original) => ({
  ...(await original()),
  api: { get: mocks.get, patch: mocks.patch },
}));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ can: mocks.can }) }));
let patient;
beforeEach(() => {
  vi.clearAllMocks();
  patient = {
    id: 'patient-fictif',
    firstName: 'Fictif',
    lastName: 'Exemple',
    archived: false,
    version: 1,
  };
  mocks.can.mockReturnValue(true);
  mocks.get.mockImplementation(async () => ({
    items: [{ ...patient }],
    pagination: { page: 1, totalPages: 1, total: 1 },
  }));
  mocks.patch.mockImplementation(async (_, values) => {
    patient = { ...patient, archived: !values.active, version: patient.version + 1 };
    return patient;
  });
});
function show() {
  render(
    <NotificationProvider>
      <MemoryRouter>
        <PatientsPage />
      </MemoryRouter>
    </NotificationProvider>,
  );
}

test('désactiver puis activer : confirmation, couleur, version et actualisation du bouton', async () => {
  const user = userEvent.setup();
  show();
  const disable = await screen.findByRole('button', { name: 'Désactiver Exemple Fictif' });
  expect(disable).toHaveClass('btn-outline-danger');
  expect(screen.getByRole('combobox', { name: 'Statut' })).toHaveValue('all');
  await user.click(disable);
  let dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('button', { name: 'Confirmer' })).toHaveClass('btn-danger');
  await user.click(within(dialog).getByRole('button', { name: 'Confirmer' }));
  expect(mocks.patch).toHaveBeenCalledWith('/patients/patient-fictif/status', {
    active: false,
    version: 1,
  });
  const enable = await screen.findByRole('button', { name: 'Activer Exemple Fictif' });
  expect(enable).toHaveClass('btn-outline-success');
  expect(screen.getByText('Inactif')).toBeInTheDocument();
  expect(screen.getByText('Patient désactivé.').closest('.toast')).toHaveClass('bg-danger-subtle');
  await user.click(enable);
  dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('button', { name: 'Confirmer' })).toHaveClass('btn-success');
  await user.click(within(dialog).getByRole('button', { name: 'Confirmer' }));
  expect(mocks.patch).toHaveBeenLastCalledWith('/patients/patient-fictif/status', {
    active: true,
    version: 2,
  });
  expect(
    await screen.findByRole('button', { name: 'Désactiver Exemple Fictif' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Patient activé.').closest('.toast')).toHaveClass('bg-success-subtle');
});

test('annulation : aucun appel de mutation', async () => {
  show();
  await userEvent.click(await screen.findByRole('button', { name: 'Désactiver Exemple Fictif' }));
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }),
  );
  expect(mocks.patch).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('lecture seule : aucun bouton de statut pour un compte sans droit', async () => {
  mocks.can.mockImplementation((p) => p === 'patients.read');
  show();
  expect(await screen.findByRole('link', { name: 'Ouvrir' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Désactiver|Activer/ })).not.toBeInTheDocument();
});

test('erreur serveur : le statut reste inchangé et le message est rouge', async () => {
  mocks.patch.mockRejectedValueOnce({
    response: {
      data: { error: { message: 'Cette fiche a changé. Rechargez-la avant de modifier.' } },
    },
  });
  show();
  await userEvent.click(await screen.findByRole('button', { name: 'Désactiver Exemple Fictif' }));
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmer' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Cette fiche a changé.');
  expect(screen.getByRole('alert')).toHaveClass('bg-danger-subtle');
  expect(patient.archived).toBe(false);
});

test('recherche dynamique : dernière saisie après 300 ms, effacement et aucun bouton Rechercher', async () => {
  vi.useFakeTimers();
  try {
    show();
    await act(async () => {});
    const field = screen.getByRole('searchbox', { name: 'Rechercher un patient' });
    expect(screen.queryByRole('button', { name: 'Rechercher' })).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'Ex' } });
    await act(async () => vi.advanceTimersByTime(150));
    fireEvent.change(field, { target: { value: 'Exemple' } });
    await act(async () => vi.advanceTimersByTime(299));
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1));
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/patients',
      expect.objectContaining({ search: 'Exemple', page: 1 }),
    );
    fireEvent.change(field, { target: { value: '' } });
    await act(async () => vi.advanceTimersByTime(300));
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/patients',
      expect.objectContaining({ search: '', page: 1 }),
    );
  } finally {
    vi.useRealTimers();
  }
});

test('sélecteurs immédiats : page 1 et prise en compte de la recherche en cours', async () => {
  mocks.get.mockImplementation(async (_, query) => ({
    items: [{ ...patient }],
    pagination: { page: query.page, totalPages: 3, total: 60 },
  }));
  vi.useFakeTimers();
  try {
    show();
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await act(async () => {});
    expect(mocks.get).toHaveBeenLastCalledWith('/patients', expect.objectContaining({ page: 2 }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Fictif' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Tri' }), {
      target: { value: 'firstName' },
    });
    await act(async () => {});
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/patients',
      expect.objectContaining({ page: 1, search: 'Fictif', sort: 'firstName' }),
    );
    const count = mocks.get.mock.calls.length;
    await act(async () => vi.advanceTimersByTime(300));
    expect(mocks.get).toHaveBeenCalledTimes(count);
    fireEvent.change(screen.getByRole('combobox', { name: 'Statut' }), {
      target: { value: 'true' },
    });
    await act(async () => {});
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/patients',
      expect.objectContaining({ archived: 'true', page: 1 }),
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Ordre' }), {
      target: { value: 'DESC' },
    });
    await act(async () => {});
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/patients',
      expect.objectContaining({ direction: 'DESC', page: 1 }),
    );
  } finally {
    vi.useRealTimers();
  }
});

test('une réponse ancienne ne remplace pas les résultats de la nouvelle recherche', async () => {
  let finishOld;
  mocks.get.mockImplementation(async (_, query) => {
    if (query.search === 'ancien')
      return new Promise((resolve) => {
        finishOld = resolve;
      });
    return {
      items: [{ ...patient, lastName: query.search === 'nouveau' ? 'Nouveau' : 'Initial' }],
      pagination: { page: 1, totalPages: 1, total: 1 },
    };
  });
  vi.useFakeTimers();
  try {
    show();
    await act(async () => {});
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ancien' } });
    await act(async () => vi.advanceTimersByTime(300));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nouveau' } });
    await act(async () => vi.advanceTimersByTime(300));
    expect(screen.getByText('Nouveau Fictif')).toBeInTheDocument();
    await act(async () =>
      finishOld({
        items: [{ ...patient, lastName: 'Ancien' }],
        pagination: { page: 1, totalPages: 1, total: 1 },
      }),
    );
    expect(screen.queryByText('Ancien Fictif')).not.toBeInTheDocument();
    expect(screen.getByText('Nouveau Fictif')).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
