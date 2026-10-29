import { StrictMode, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { NotificationProvider, useNotifications } from './Notifications.jsx';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function Sender({ sent, tone = 'success' }) {
  const notify = useNotifications();
  return (
    <button
      onClick={() => {
        notify({ message: 'Enregistrement terminé.', tone });
        sent?.();
      }}
    >
      Notifier
    </button>
  );
}
test('Toast Bootstrap réel : disparaît après 2 secondes', () => {
  render(
    <NotificationProvider>
      <Sender />
    </NotificationProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Notifier' }));
  expect(screen.getByRole('status')).toHaveClass('toast', 'show');
  act(() => vi.advanceTimersByTime(1999));
  expect(screen.getByText('Enregistrement terminé.')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByText('Enregistrement terminé.')).not.toBeInTheDocument();
});
test('croix pilotée par le JavaScript Bootstrap et aucun envoi de formulaire', () => {
  const submit = vi.fn((event) => event.preventDefault());
  render(
    <NotificationProvider>
      <form onSubmit={submit}>
        <Sender />
      </form>
    </NotificationProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Notifier' }));
  submit.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Fermer la notification' }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(submit).not.toHaveBeenCalled();
});
test('ne disparaît pas sous le focus clavier puis reprend le délai Bootstrap', () => {
  render(
    <NotificationProvider>
      <Sender />
    </NotificationProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Notifier' }));
  const toast = screen.getByRole('status');
  fireEvent.focusIn(toast);
  act(() => vi.advanceTimersByTime(3000));
  expect(toast).toBeInTheDocument();
  fireEvent.focusOut(toast);
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
test('message conservé après navigation, doublons simultanés évités puis nouveau message possible', () => {
  function Page() {
    const [visible, setVisible] = useState(true);
    return (
      <NotificationProvider>
        {visible ? <Sender sent={() => setVisible(false)} /> : <Sender />}
      </NotificationProvider>
    );
  }
  render(<Page />);
  fireEvent.click(screen.getByRole('button', { name: 'Notifier' }));
  fireEvent.click(screen.getByRole('button', { name: 'Notifier' }));
  expect(screen.getAllByRole('status')).toHaveLength(1);
  act(() => vi.advanceTimersByTime(2000));
  fireEvent.click(screen.getByRole('button', { name: 'Notifier' }));
  expect(screen.getAllByRole('status')).toHaveLength(1);
});
test('StrictMode nettoie les timers et les instances Bootstrap au démontage', () => {
  const result = render(
    <StrictMode>
      <NotificationProvider>
        <Sender />
      </NotificationProvider>
    </StrictMode>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Notifier' }));
  result.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
test('notification visible dans une confirmation native ouverte', () => {
  render(
    <NotificationProvider>
      <dialog open>
        <Sender />
      </dialog>
    </NotificationProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Notifier' }));
  expect(screen.getByRole('status').closest('dialog')).not.toBeNull();
});

test.each(['success', 'danger', 'warning', 'info'])(
  'notification %s : couleur sémantique, message seul et fermeture accessible',
  (tone) => {
    render(
      <NotificationProvider>
        <Sender tone={tone} />
      </NotificationProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Notifier' }));
    const toast = screen.getByRole(tone === 'danger' ? 'alert' : 'status');
    expect(toast).toHaveClass('bg-' + tone + '-subtle', 'text-' + tone + '-emphasis');
    expect(toast).toHaveTextContent('Enregistrement terminé.');
    expect(toast.querySelector('.toast-header')).toBeNull();
    expect(screen.queryByText(/^(Succès|Erreur|Attention|Information)$/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer la notification' }));
    expect(toast).not.toBeInTheDocument();
  },
);
