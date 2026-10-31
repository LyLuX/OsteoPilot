import { render, screen, fireEvent, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { PageTitle } from '../components/shared.jsx';
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

test('libellé de page dans la topbar, date de Paris et synchronisation lors de la navigation', async () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<AppLayout now={new Date('2026-10-30T23:30:00Z')} />}>
          <Route
            path="/dashboard"
            element={
              <>
                <PageTitle eyebrow="Votre espace au quotidien" />
                <Link to="/administration/settings">Ouvrir le paramétrage</Link>
              </>
            }
          />
          <Route
            path="/administration/settings"
            element={<PageTitle eyebrow="Administration" title="Paramétrage" />}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  const topbar = document.querySelector('.topbar-label');
  expect(topbar).toHaveTextContent('Votre espace au quotidien · samedi 31 octobre 2026');
  expect(topbar.querySelector('time')).toHaveTextContent('samedi 31 octobre 2026');
  expect(topbar.querySelector('.topbar-separator')).toHaveAttribute('aria-hidden', 'true');
  const main = screen.getByRole('main');
  expect(main.querySelector('.eyebrow')).toBeNull();
  expect(main.querySelector('.page-heading')).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Ouvrir le paramétrage' }));
  expect(await within(main).findByRole('heading', { name: 'Paramétrage' })).toBeInTheDocument();
  expect(topbar).toHaveTextContent('Administration · samedi 31 octobre 2026');
  expect(topbar).not.toHaveTextContent('Votre espace au quotidien');
  expect(main.querySelector('.eyebrow')).toBeNull();
});
