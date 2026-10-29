import { act, render, screen, fireEvent } from '@testing-library/react';
import { test, expect, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext.jsx';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), csrf: vi.fn() }));
vi.mock('../api/client.js', () => ({
  api: { get: mocks.get, post: mocks.post },
  setCsrfToken: mocks.csrf,
}));
const identity = { firstName: 'Fictif', permissions: ['dashboard.read'] };
function Consumer() {
  const { user } = useAuth();
  return <p>{user ? 'Connecté' : 'Déconnecté'}</p>;
}
test('la rotation ne remet pas à zéro l’inactivité et le délai révoque la session', async () => {
  vi.useFakeTimers();
  mocks.get.mockResolvedValue({ user: identity, csrfToken: 'csrf-test' });
  mocks.post.mockImplementation(async (path) =>
    path === '/auth/refresh' ? { user: { ...identity } } : {},
  );
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
  await act(async () => {});
  expect(screen.getByText('Connecté')).toBeInTheDocument();
  await act(async () => {
    vi.advanceTimersByTime(60000);
  });
  fireEvent.pointerDown(window);
  await act(async () => {
    vi.advanceTimersByTime(4 * 60000);
  });
  expect(mocks.post).toHaveBeenCalledWith('/auth/refresh');
  await act(async () => {
    vi.advanceTimersByTime(11 * 60000);
  });
  expect(mocks.post).toHaveBeenCalledWith('/auth/logout');
  expect(screen.getByText('Déconnecté')).toBeInTheDocument();
  vi.useRealTimers();
});
