import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, test, expect } from 'vitest';
import DashboardPage from './DashboardPage.jsx';
vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { firstName: 'Fictif' }, can: () => true }),
}));
test('jour courant, mois précédent/suivant, aujourd’hui et clavier', () => {
  render(
    <MemoryRouter>
      <DashboardPage now={new Date('2026-10-29T12:00:00Z')} />
    </MemoryRouter>,
  );
  const today = screen.getByRole('button', { name: 'jeudi 29 octobre 2026' });
  expect(today).toHaveAttribute('aria-current', 'date');
  expect(today).toHaveAttribute('tabindex', '0');
  fireEvent.keyDown(today, { key: 'ArrowRight' });
  expect(screen.getByRole('button', { name: 'vendredi 30 octobre 2026' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }));
  expect(screen.getByRole('heading', { name: 'novembre 2026' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Aujourd’hui' }));
  expect(screen.getByRole('heading', { name: 'octobre 2026' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: /rendez-vous/i })).not.toBeInTheDocument();
});
