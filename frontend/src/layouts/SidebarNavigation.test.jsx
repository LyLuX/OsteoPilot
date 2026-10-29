import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import SidebarNavigation from './SidebarNavigation.jsx';
import AppLayout from './AppLayout.jsx';
const auth = vi.hoisted(() => ({ can: vi.fn() }));
vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({ can: auth.can, user: { firstName: 'Compte', lastName: 'Fictif' } }),
}));
beforeEach(() => auth.can.mockImplementation(() => true));

test('groupe actif ouvert et un seul groupe déplié ; clavier Entrée et Espace', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/patients/new']}>
      <SidebarNavigation />
    </MemoryRouter>,
  );
  const patients = screen.getByRole('button', { name: 'Gestion patientèle' });
  const administration = screen.getByRole('button', { name: 'Administration' });
  expect(patients).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('link', { name: /Création d’un patient/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getByRole('link', { name: 'Patientèle' })).not.toHaveAttribute('aria-current');
  expect(screen.queryByRole('link', { name: /Utilisateurs/ })).not.toBeInTheDocument();
  administration.focus();
  await user.keyboard('{Enter}');
  expect(administration).toHaveAttribute('aria-expanded', 'true');
  expect(patients).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('link', { name: 'Patientèle' })).not.toBeInTheDocument();
  expect(document.getElementById(administration.getAttribute('aria-controls'))).toContainElement(
    screen.getByRole('link', { name: /Utilisateurs/ }),
  );
  await user.keyboard(' ');
  expect(administration).toHaveAttribute('aria-expanded', 'false');
});

test('droits : groupes vides absents et lien export accessible avec son droit dédié', async () => {
  auth.can.mockImplementation((p) => p === 'patients.export' || p === 'dashboard.read');
  render(
    <MemoryRouter initialEntries={['/patients/transfer']}>
      <SidebarNavigation />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('button', { name: 'Administration' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Patientèle' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Importer/ })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: /Tableau de bord/ })).toBeVisible();
});

test('changement de route : ouverture du groupe correspondant, y compris fiche et édition', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/administration/users']}>
      <SidebarNavigation />
      <Link to="/patients/fiche-fictive/edit">Changer de page</Link>
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('link', { name: 'Changer de page' }));
  expect(screen.getByRole('button', { name: 'Administration' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(screen.getByRole('button', { name: 'Gestion patientèle' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(screen.getByRole('link', { name: 'Patientèle' })).toBeVisible();
});

test('menu mobile : identifiants uniques, ouverture des groupes et fermeture après navigation', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AppLayout />
    </MemoryRouter>,
  );
  const menu = screen.getByRole('button', { name: /Menu/ });
  await user.click(menu);
  const dialog = screen.getByRole('dialog', { name: 'Navigation principale' });
  const group = within(dialog).getByRole('button', { name: 'Gestion patientèle' });
  const targets = [...document.querySelectorAll('.nav-group-toggle')].map((button) =>
    button.getAttribute('aria-controls'),
  );
  expect(new Set(targets).size).toBe(targets.length);
  await user.click(group);
  await user.click(within(dialog).getByRole('link', { name: 'Patientèle' }));
  await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
  expect(menu).toHaveFocus();
});
