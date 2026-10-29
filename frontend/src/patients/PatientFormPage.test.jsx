import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import PatientFormPage from './PatientFormPage.jsx';
import TransferPage from './TransferPage.jsx';
import { NotificationProvider } from '../notifications/Notifications.jsx';
const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../api/client.js', async (original) => ({
  ...(await original()),
  api: { post: mocks.post },
}));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ can: () => true }) }));
afterEach(() => vi.restoreAllMocks());

test('création sur HTTP : formulaire, saisie et envoi sans crypto.randomUUID', async () => {
  vi.spyOn(crypto, 'randomUUID');
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
  mocks.post.mockResolvedValue({ id: 'test-created-id' });
  render(
    <NotificationProvider>
      <MemoryRouter initialEntries={['/patients/new']}>
        <Routes>
          <Route path="/patients/new" element={<PatientFormPage />} />
          <Route path="/patients/:id" element={<p>Fiche créée</p>} />
        </Routes>
      </MemoryRouter>
    </NotificationProvider>,
  );
  expect(screen.getByRole('heading', { name: 'Création d’un patient' })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText(/^Nom/), 'Exemple');
  await userEvent.type(screen.getByLabelText(/^Prénom/), 'Fictif');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la fiche' }));
  expect(await screen.findByText('Fiche créée')).toBeInTheDocument();
  expect(mocks.post).toHaveBeenCalledWith(
    '/patients',
    { lastName: 'Exemple', firstName: 'Fictif' },
    {
      headers: {
        'Idempotency-Key': expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
      },
    },
  );
});

test('import/export sur HTTP : la page reste accessible sans crypto.randomUUID', () => {
  vi.spyOn(crypto, 'randomUUID');
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
  render(
    <MemoryRouter>
      <TransferPage />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('heading', { name: 'Importer / Exporter une patientèle' }),
  ).toBeInTheDocument();
});
