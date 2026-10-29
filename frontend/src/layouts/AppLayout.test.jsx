import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, test, expect } from 'vitest';
import AppLayout from './AppLayout.jsx';
import { NotificationProvider } from '../notifications/Notifications.jsx';
vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: { firstName: 'Compte', lastName: 'Fictif' },
    can: (p) => p === 'dashboard.read',
    logout: vi.fn(),
  }),
}));
test('navigation filtre les droits ; menu mobile accessible', async () => {
  render(
    <MemoryRouter>
      <AppLayout />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: /Tableau de bord/ })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Patientèle' })).not.toBeInTheDocument();
  const menu = screen.getByRole('button', { name: /Menu/ });
  menu.click();
  expect(await screen.findByRole('dialog', { name: 'Navigation principale' })).toBeInTheDocument();
});

test('déconnexion réussie : bouton et notification rouges sans titre d’état', async () => {
  render(
    <NotificationProvider>
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>
    </NotificationProvider>,
  );
  const button = screen.getByRole('button', { name: 'Déconnexion' });
  expect(button).toHaveClass('btn-outline-danger');
  fireEvent.click(button);
  const toast = await screen.findByRole('alert');
  expect(toast).toHaveTextContent('Vous êtes déconnecté.');
  expect(toast).toHaveClass('bg-danger-subtle');
  expect(screen.queryByText('Erreur')).not.toBeInTheDocument();
});
