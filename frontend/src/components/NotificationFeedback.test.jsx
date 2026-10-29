import { fireEvent, render, screen, act } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { NotificationProvider } from '../notifications/Notifications.jsx';
import { Field, useTask, ResourceState } from './shared.jsx';
import BootstrapForm from './BootstrapForm.jsx';
function ErrorForm() {
  const [email, setEmail] = useState('test@example.invalid');
  const task = useTask();
  return (
    <BootstrapForm
      errors={task.fieldErrors}
      onSubmit={() =>
        task.run(async () => {
          throw {
            response: {
              data: {
                error: {
                  message: 'Validation refusée.',
                  details: [{ field: 'email', message: 'Adresse invalide.' }],
                },
              },
            },
          };
        })
      }
    >
      <Field
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={(_, value) => setEmail(value)}
      />
      <button>Enregistrer</button>
    </BootstrapForm>
  );
}
test('la notification disparaît mais les erreurs sous les champs restent corrigibles', async () => {
  vi.useFakeTimers();
  try {
    render(
      <NotificationProvider>
        <ErrorForm />
      </NotificationProvider>,
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })));
    expect(screen.getByRole('alert')).toHaveTextContent('Validation refusée.');
    expect(screen.getByText('Adresse invalide.')).toHaveClass('invalid-feedback');
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Adresse invalide.')).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
test('une erreur de chargement reste réessayable après la notification', () => {
  const reload = vi.fn();
  render(
    <MemoryRouter>
      <ResourceState resource={{ error: 'Erreur réseau', loading: false, reload }} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  expect(reload).toHaveBeenCalledTimes(1);
});
