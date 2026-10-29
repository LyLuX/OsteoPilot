import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { Guard } from '../App.jsx';
const state = vi.hoisted(() => ({ user: { id: 'test' }, loading: false, can: () => false }));
vi.mock('./AuthContext.jsx', () => ({ useAuth: () => state }));
test('route interdite reste inaccessible même via URL directe', () => {
  render(
    <MemoryRouter>
      <Guard permission="patients.export">
        <p>Données interdites</p>
      </Guard>
    </MemoryRouter>,
  );
  expect(screen.getByRole('heading', { name: 'Accès réservé' })).toBeInTheDocument();
  expect(screen.queryByText('Données interdites')).not.toBeInTheDocument();
});
test('session absente redirigée vers connexion', () => {
  state.user = null;
  render(
    <MemoryRouter initialEntries={['/private']}>
      <Routes>
        <Route
          path="/private"
          element={
            <Guard>
              <p>Privé</p>
            </Guard>
          }
        />
        <Route path="/login" element={<p>Connexion requise</p>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByText('Connexion requise')).toBeInTheDocument();
  state.user = { id: 'test' };
});
