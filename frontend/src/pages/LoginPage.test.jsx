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
