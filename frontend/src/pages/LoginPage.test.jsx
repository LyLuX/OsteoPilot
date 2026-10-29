import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, test, expect } from 'vitest';
import LoginPage from './LoginPage.jsx';
const login = vi.fn();
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: null, login, notice: '' }) }));
test('connexion avec labels et erreurs françaises', async () => {
  login.mockRejectedValue({
    response: { data: { error: { message: 'Adresse email ou mot de passe incorrect.' } } },
  });
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
  await userEvent.type(screen.getByLabelText(/Adresse email/), 'test@example.invalid');
  await userEvent.type(screen.getByLabelText(/Mot de passe/), 'test-password');
  await userEvent.click(screen.getByRole('button', { name: /Se connecter/ }));
  expect(login).toHaveBeenCalledWith('test@example.invalid', 'test-password');
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Adresse email ou mot de passe incorrect.',
  );
});

test('œil accessible : afficher et masquer sans perdre la saisie ni soumettre', async () => {
  login.mockClear();
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
  const input = screen.getByLabelText(/^Mot de passe/);
  await user.type(input, 'Phrase de test');
  expect(input).toHaveAttribute('type', 'password');
  const show = screen.getByRole('button', { name: 'Afficher le mot de passe' });
  expect(show).toHaveAttribute('aria-pressed', 'false');
  await user.click(show);
  expect(input).toHaveAttribute('type', 'text');
  const hide = screen.getByRole('button', { name: 'Masquer le mot de passe' });
  expect(hide).toHaveAttribute('aria-pressed', 'true');
  hide.focus();
  await user.keyboard(' ');
  expect(input).toHaveAttribute('type', 'password');
  expect(input).toHaveValue('Phrase de test');
  expect(login).not.toHaveBeenCalled();
});
