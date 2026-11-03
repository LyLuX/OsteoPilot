import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import SettingsPage from './SettingsPage.jsx';
import { NotificationProvider } from '../notifications/Notifications.jsx';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  can: vi.fn(),
}));
vi.mock('../api/client.js', async (original) => ({
  ...(await original()),
  api: { get: mocks.get, put: mocks.put, patch: mocks.patch, post: mocks.post },
}));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ can: mocks.can }) }));
let settings;
beforeEach(() => {
  vi.clearAllMocks();
  settings = {
    name: 'Cabinet fictif',
    address: '',
    phone: '',
    email: '',
    timezone: 'Europe/Paris',
    paymentMethods: ['cash', 'card'],
    defaultCalendarView: 'month',
    tariffs: [
      { id: 'child', label: 'Consultation enfant/nourrisson', amountCents: 4500, version: 1 },
      { id: 'adult', label: 'Consultation adulte', amountCents: 5500, version: 1 },
    ],
  };
  mocks.can.mockReturnValue(true);
  mocks.get.mockImplementation(async () => settings);
  mocks.put.mockImplementation(async (_, values) => {
    settings = { ...settings, ...values };
    return settings;
  });
  mocks.post.mockImplementation(async (_, values) => {
    const tariff = { ...values, id: 'added', version: 1 };
    settings = { ...settings, tariffs: [...settings.tariffs, tariff] };
    return tariff;
  });
  mocks.patch.mockImplementation(async (path, values) => {
    if (path.startsWith('/settings/tariffs/')) {
      const id = path.split('/').pop();
      const tariff = { ...values, id, version: values.version + 1 };
      settings = {
        ...settings,
        tariffs: settings.tariffs.map((item) => (item.id === id ? tariff : item)),
      };
      return tariff;
    }
    const { method, accepted, defaultCalendarView } = values;
    if (path === '/settings/calendar') {
      settings = { ...settings, defaultCalendarView };
      return { defaultCalendarView };
    }
    const selected = new Set(settings.paymentMethods);
    if (accepted) selected.add(method);
    else selected.delete(method);
    settings = { ...settings, paymentMethods: [...selected] };
    return { paymentMethods: settings.paymentMethods };
  });
});
function show() {
  return render(
    <NotificationProvider>
      <SettingsPage />
    </NotificationProvider>,
  );
}

test('panneau indépendant : sauvegarde immédiate malgré des informations générales invalides, puis relecture', async () => {
  const user = userEvent.setup();
  const view = show();
  expect(await screen.findByRole('checkbox', { name: 'Espèces' })).toBeChecked();
  const panel = screen.getByRole('heading', { name: 'Moyens de paiement' }).closest('section');
  expect(within(panel).queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
  expect(within(panel).getByRole('checkbox', { name: 'Carte' }).closest('form')).toBeNull();
  await user.clear(screen.getByLabelText(/Nom du cabinet/));
  await user.click(screen.getByRole('checkbox', { name: 'Carte' }));
  expect(mocks.patch).toHaveBeenCalledWith('/settings/payment-methods', {
    method: 'card',
    accepted: false,
  });
  expect(mocks.put).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/Nom du cabinet/)).toHaveValue('');
  expect(settings.name).toBe('Cabinet fictif');
  expect(screen.getByRole('checkbox', { name: 'Carte' })).not.toBeChecked();
  expect(screen.getByText('Moyens de paiement mis à jour.').closest('.toast')).toHaveClass(
    'bg-danger-subtle',
  );
  await user.click(screen.getByRole('checkbox', { name: 'Virement' }));
  expect(mocks.patch).toHaveBeenLastCalledWith('/settings/payment-methods', {
    method: 'transfer',
    accepted: true,
  });
  view.unmount();
  show();
  expect(await screen.findByRole('checkbox', { name: 'Virement' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Carte' })).not.toBeChecked();
});

test('les informations générales s’enregistrent séparément sans renvoyer les moyens de paiement', async () => {
  show();
  await screen.findByRole('checkbox', { name: 'Espèces' });
  await userEvent.type(screen.getByLabelText(/Adresse/), 'Adresse fictive');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(mocks.put).toHaveBeenCalledWith('/settings', {
    name: 'Cabinet fictif',
    address: 'Adresse fictive',
    phone: '',
    email: '',
    timezone: 'Europe/Paris',
  });
  expect(mocks.patch).not.toHaveBeenCalled();
  expect(settings.paymentMethods).toEqual(['cash', 'card']);
});

test('désélectionner le dernier moyen est enregistré sans bouton ni option implicite', async () => {
  settings.paymentMethods = ['cash'];
  show();
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Espèces' }));
  expect(settings.paymentMethods).toEqual([]);
  expect(mocks.patch).toHaveBeenCalledWith('/settings/payment-methods', {
    method: 'cash',
    accepted: false,
  });
  expect(mocks.put).not.toHaveBeenCalled();
});

test('paramètres en lecture seule : cases désactivées et aucune mutation', async () => {
  mocks.can.mockReturnValue(false);
  show();
  await screen.findByRole('checkbox', { name: 'Espèces' });
  for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
  expect(mocks.patch).not.toHaveBeenCalled();
  expect(mocks.put).not.toHaveBeenCalled();
});

test('requête en cours : cases verrouillées, puis retour à l’état confirmé en cas d’erreur', async () => {
  let reject;
  mocks.patch.mockImplementationOnce(
    () =>
      new Promise((_, failed) => {
        reject = failed;
      }),
  );
  show();
  const cash = await screen.findByRole('checkbox', { name: 'Espèces' });
  await userEvent.click(cash);
  expect(cash).not.toBeChecked();
  expect(cash).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Carte' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Carte' }));
  expect(mocks.patch).toHaveBeenCalledTimes(1);
  await act(async () =>
    reject({
      response: {
        data: {
          error: {
            message: 'Sauvegarde impossible.',
            details: [{ field: 'method', message: 'Vérifiez ce moyen de paiement.' }],
          },
        },
      },
    }),
  );
  expect(cash).toBeChecked();
  expect(cash).toBeEnabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Sauvegarde impossible.');
  expect(screen.getByText('Vérifiez ce moyen de paiement.')).toHaveClass('invalid-feedback');
  expect(screen.getAllByText('Vérifiez ce moyen de paiement.')).toHaveLength(1);
  expect(mocks.put).not.toHaveBeenCalled();
});

test('panneau Calendrier après les moyens de paiement : sauvegarde automatique indépendante et persistée', async () => {
  const view = show();
  const select = await screen.findByRole('combobox', { name: 'Vue par défaut' });
  const panel = screen.getByRole('heading', { name: 'Calendrier' }).closest('section');
  const methods = screen.getByRole('heading', { name: 'Moyens de paiement' }).closest('section');
  expect(panel).toHaveClass('panel');
  expect(panel.parentElement).toHaveClass('settings-options-grid');
  expect(methods.nextElementSibling).toBe(panel);
  expect(within(panel).queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
  expect(select).toHaveValue('month');
  await userEvent.clear(screen.getByLabelText(/Nom du cabinet/));
  await userEvent.selectOptions(select, 'year');
  expect(mocks.patch).toHaveBeenCalledWith('/settings/calendar', { defaultCalendarView: 'year' });
  expect(settings.name).toBe('Cabinet fictif');
  expect(settings.paymentMethods).toEqual(['cash', 'card']);
  expect(mocks.put).not.toHaveBeenCalled();
  expect(
    screen.getByText('Vue par défaut du calendrier mise à jour.').closest('.toast'),
  ).toHaveClass('bg-warning-subtle');
  view.unmount();
  show();
  expect(await screen.findByRole('combobox', { name: 'Vue par défaut' })).toHaveValue('year');
});
test('calendrier en lecture seule : choix désactivé', async () => {
  mocks.can.mockReturnValue(false);
  show();
  expect(await screen.findByRole('combobox', { name: 'Vue par défaut' })).toBeDisabled();
  expect(mocks.patch).not.toHaveBeenCalled();
});
test('calendrier : verrouillage en cours et retour au choix confirmé avec erreur Bootstrap', async () => {
  let reject;
  mocks.patch.mockImplementationOnce(
    () =>
      new Promise((_, failed) => {
        reject = failed;
      }),
  );
  show();
  const select = await screen.findByRole('combobox', { name: 'Vue par défaut' });
  await userEvent.selectOptions(select, 'week');
  expect(select).toBeDisabled();
  expect(select).toHaveValue('week');
  expect(screen.getByRole('checkbox', { name: 'Espèces' })).toBeEnabled();
  await act(async () =>
    reject({
      response: {
        data: {
          error: {
            message: 'Sauvegarde impossible.',
            details: [{ field: 'defaultCalendarView', message: 'Vérifiez la vue.' }],
          },
        },
      },
    }),
  );
  expect(select).toHaveValue('month');
  expect(select).toBeEnabled();
  expect(select).toHaveClass('is-invalid');
  expect(screen.getByText('Vérifiez la vue.')).toHaveClass('invalid-feedback');
});

test('tarifs : deux prix initiaux, modification et ajout indépendants des autres panneaux', async () => {
  const user = userEvent.setup();
  show();
  const child = await screen.findByRole('group', { name: 'Consultation enfant/nourrisson' });
  expect(within(child).getByLabelText('Montant en euros *')).toHaveValue('45,00');
  expect(
    within(screen.getByRole('group', { name: 'Consultation adulte' })).getByLabelText(
      'Montant en euros *',
    ),
  ).toHaveValue('55,00');
  await user.clear(screen.getByLabelText('Nom du cabinet *'));
  await user.type(screen.getByLabelText('Nom du cabinet *'), 'Brouillon à conserver');
  await user.clear(within(child).getByLabelText('Montant en euros *'));
  await user.type(within(child).getByLabelText('Montant en euros *'), '47,50');
  await user.click(within(child).getByRole('button', { name: 'Enregistrer ce tarif' }));
  expect(mocks.patch).toHaveBeenCalledWith('/settings/tariffs/child', {
    label: 'Consultation enfant/nourrisson',
    amountCents: 4750,
    version: 1,
  });
  expect(await screen.findByText('Tarif mis à jour.')).toBeInTheDocument();
  const add = screen.getByRole('group', { name: 'Ajouter un tarif' });
  await user.type(within(add).getByLabelText('Libellé du tarif *'), 'Consultation longue');
  await user.type(within(add).getByLabelText('Montant en euros *'), '70');
  await user.click(within(add).getByRole('button', { name: 'Ajouter le tarif' }));
  expect(mocks.post).toHaveBeenCalledWith('/settings/tariffs', {
    label: 'Consultation longue',
    amountCents: 7000,
  });
  expect(await screen.findByRole('group', { name: 'Consultation longue' })).toBeInTheDocument();
  expect(screen.getByLabelText('Nom du cabinet *')).toHaveValue('Brouillon à conserver');
  expect(mocks.put).not.toHaveBeenCalled();
  expect(settings.paymentMethods).toEqual(['cash', 'card']);
  expect(settings.defaultCalendarView).toBe('month');
});

test('tarifs : lecture seule et validation du montant avec Bootstrap', async () => {
  mocks.can.mockImplementation((permission) => permission === 'settings.read');
  show();
  const child = await screen.findByRole('group', { name: 'Consultation enfant/nourrisson' });
  expect(within(child).getByLabelText('Montant en euros *')).toBeDisabled();
  expect(screen.queryByRole('group', { name: 'Ajouter un tarif' })).not.toBeInTheDocument();
});

test('tarifs : erreur serveur visible sans perdre la saisie', async () => {
  const user = userEvent.setup();
  mocks.post.mockRejectedValueOnce({
    response: {
      data: {
        error: {
          message: 'Libellé déjà utilisé.',
          details: [{ field: 'label', message: 'Choisissez un libellé distinct.' }],
        },
      },
    },
  });
  show();
  const add = await screen.findByRole('group', { name: 'Ajouter un tarif' });
  await user.type(within(add).getByLabelText('Libellé du tarif *'), 'Consultation adulte');
  await user.type(within(add).getByLabelText('Montant en euros *'), '50');
  await user.click(within(add).getByRole('button', { name: 'Ajouter le tarif' }));
  expect(await within(add).findByText('Choisissez un libellé distinct.')).toHaveClass(
    'invalid-feedback',
  );
  expect(within(add).getByLabelText('Libellé du tarif *')).toHaveValue('Consultation adulte');
});
