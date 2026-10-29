import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, test, expect } from 'vitest';
import AppLayout from './AppLayout.jsx';
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
