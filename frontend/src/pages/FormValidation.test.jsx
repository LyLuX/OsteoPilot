import { NotificationProvider } from '../notifications/Notifications.jsx';
import { render as renderComponent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, test, expect } from 'vitest';
import LoginPage from './LoginPage.jsx';
import PatientFormPage from '../patients/PatientFormPage.jsx';
import SettingsPage from '../administration/SettingsPage.jsx';
import UsersPage from '../administration/UsersPage.jsx';
const mocks = vi.hoisted(() => ({ login: vi.fn(), post: vi.fn(), put: vi.fn(), get: vi.fn() }));
vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({ user: null, login: mocks.login, can: () => true }),
}));
vi.mock('../api/client.js', async (original) => {
  const actual = await original();
  return { ...actual, api: { post: mocks.post, put: mocks.put, get: mocks.get } };
});
test('connexion vide : validation Bootstrap avant tout appel d’authentification', async () => {
  mocks.login.mockClear();
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole('button', { name: /Se connecter/ }));
  expect(screen.getByLabelText(/^Adresse email/)).toHaveClass('is-invalid');
  expect(screen.getByLabelText(/^Mot de passe/)).toHaveClass('is-invalid');
  expect(mocks.login).not.toHaveBeenCalled();
});
test('validation serveur affichée sous le champ de connexion', async () => {
  mocks.login.mockRejectedValue({
    response: {
      data: {
        error: {
          message: 'Les données transmises sont invalides.',
          details: [{ field: 'email', message: 'Vérifiez cette adresse email.' }],
        },
      },
    },
  });
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
  await userEvent.type(screen.getByLabelText(/^Adresse email/), 'test@example.invalid');
  await userEvent.type(screen.getByLabelText(/^Mot de passe/), 'test');
  await userEvent.click(screen.getByRole('button', { name: /Se connecter/ }));
  expect(await screen.findByText('Vérifiez cette adresse email.')).toHaveClass('invalid-feedback');
  expect(screen.getByLabelText(/^Adresse email/)).toHaveFocus();
  expect(screen.getByRole('alert')).not.toHaveTextContent('Champs :');
});
test('patient : nom et prénom obligatoires avant la création', async () => {
  mocks.post.mockClear();
  render(
    <MemoryRouter>
      <PatientFormPage />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la fiche' }));
  expect(screen.getByLabelText(/^Nom/)).toHaveClass('is-invalid');
  expect(screen.getByLabelText(/^Prénom/)).toHaveClass('is-invalid');
  expect(mocks.post).not.toHaveBeenCalled();
});
test('paramétrage : même présentation Bootstrap pour une adresse invalide', async () => {
  mocks.get.mockResolvedValue({
    name: 'Cabinet fictif',
    address: '',
    phone: '',
    email: '',
    timezone: 'Europe/Paris',
  });
  mocks.put.mockClear();
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
  const email = await screen.findByLabelText(/^Email/);
  await userEvent.type(email, 'invalide');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(email).toHaveClass('is-invalid');
  expect(screen.getByText('Saisissez une adresse email valide.')).toHaveClass('invalid-feedback');
  expect(mocks.put).not.toHaveBeenCalled();
});

test('utilisateur : sélection de rôle requise avec un seul message de groupe', async () => {
  mocks.get.mockImplementation(async (path) => ({
    items: path === '/roles' ? [{ id: 'reader', name: 'Lecteur', system: false }] : [],
    pagination: { page: 1, totalPages: 1, total: 0 },
  }));
  mocks.post.mockClear();
  render(
    <MemoryRouter>
      <UsersPage />
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '+ Créer un utilisateur' }));
  const role = await screen.findByRole('checkbox', { name: 'Lecteur' });
  await user.type(screen.getByLabelText(/^Prénom/), 'Fictif');
  await user.type(screen.getByLabelText(/^Nom/), 'Exemple');
  await user.type(screen.getByLabelText(/^Email/), 'test@example.invalid');
  await user.type(screen.getByLabelText(/^Mot de passe initial/), 'Phrase de test sûre 123');
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(screen.getAllByText('Sélectionnez au moins un rôle.')).toHaveLength(1);
  expect(role).toHaveClass('is-invalid');
  expect(mocks.post).not.toHaveBeenCalled();
  await user.click(role);
  expect(screen.queryByText('Sélectionnez au moins un rôle.')).not.toBeInTheDocument();
});

function render(ui) {
  return renderComponent(<NotificationProvider>{ui}</NotificationProvider>);
}
