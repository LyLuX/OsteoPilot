import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import BootstrapForm, { FormControl } from './BootstrapForm.jsx';
import { Field } from './shared.jsx';
import PasswordInput from './PasswordInput.jsx';

function Example({ submit = () => {}, errors, disabled = false }) {
  const [values, setValues] = useState({ email: '', password: '', choice: '' });
  const change = (name, value) => setValues((previous) => ({ ...previous, [name]: value }));
  return (
    <BootstrapForm errors={errors} onSubmit={submit}>
      <Field
        label="Email"
        name="email"
        type="email"
        required
        value={values.email}
        onChange={change}
      />
      <PasswordInput
        name="password"
        label="Mot de passe"
        required
        minLength={14}
        value={values.password}
        onChange={(e) => change('password', e.target.value)}
      />
      <label>
        Rôle
        <FormControl
          as="select"
          name="choice"
          required
          value={values.choice}
          onChange={(e) => change('choice', e.target.value)}
        >
          <option value="">Choisir</option>
          <option value="reader">Lecture</option>
        </FormControl>
      </label>
      <fieldset disabled={disabled}>
        <Field
          label="Information facultative au parcours"
          name="extra"
          required={!disabled}
          value=""
          onChange={() => {}}
        />
      </fieldset>
      <button>Enregistrer</button>
      <button type="reset">Effacer</button>
    </BootstrapForm>
  );
}
test('champs requis rouges, feedback associé et focus sans soumission', async () => {
  const submit = vi.fn();
  render(<Example submit={submit} disabled />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
  const email = screen.getByLabelText(/^Email/);
  expect(email).toHaveClass('is-invalid');
  expect(email).toHaveAttribute('aria-invalid', 'true');
  expect(document.getElementById(email.getAttribute('aria-describedby'))).toHaveTextContent(
    'Ce champ est obligatoire.',
  );
  expect(email).toHaveFocus();
  expect(screen.getByRole('combobox')).toHaveClass('is-invalid');
  expect(submit).not.toHaveBeenCalled();
});
test('correction des valeurs retire les erreurs et autorise une seule soumission', async () => {
  const submit = vi.fn();
  render(<Example submit={submit} disabled />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await user.type(screen.getByLabelText(/^Email/), 'test@example.invalid');
  await user.type(screen.getByLabelText(/^Mot de passe/), 'Phrase de test sûre');
  await user.selectOptions(screen.getByRole('combobox'), 'reader');
  expect(screen.getByLabelText(/^Email/)).not.toHaveClass('is-invalid');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(submit).toHaveBeenCalledTimes(1);
});
test('erreur de longueur en français et œil conservé dans le groupe invalide', async () => {
  render(<Example disabled />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^Mot de passe/), 'court');
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(screen.getByText('Saisissez au moins 14 caractères.')).toHaveClass('invalid-feedback');
  await user.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }));
  expect(screen.getByLabelText(/^Mot de passe/)).toHaveAttribute('type', 'text');
  expect(screen.getByLabelText(/^Mot de passe/)).toHaveClass('is-invalid');
});
test('erreurs serveur distinctes, focus et correction du seul champ édité', async () => {
  const { rerender } = render(<Example disabled />);
  rerender(
    <Example disabled errors={{ email: 'Adresse refusée.', password: 'Mot de passe invalide.' }} />,
  );
  const email = screen.getByLabelText(/^Email/);
  const password = screen.getByLabelText(/^Mot de passe/);
  expect(email).toHaveFocus();
  expect(screen.getByText('Adresse refusée.')).toHaveClass('invalid-feedback');
  await userEvent.type(email, 'a');
  expect(email).not.toHaveClass('is-invalid');
  expect(password).toHaveClass('is-invalid');
});
test('réinitialisation des messages et champs désactivés exclus', async () => {
  render(<Example disabled />);
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(screen.getByLabelText(/^Information facultative/)).not.toHaveClass('is-invalid');
  await userEvent.click(screen.getByRole('button', { name: 'Effacer' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByLabelText(/^Email/)).not.toHaveClass('is-invalid');
});
