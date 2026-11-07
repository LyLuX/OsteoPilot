import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import ScrollableSelect from './ScrollableSelect.jsx';
import BootstrapForm from './BootstrapForm.jsx';
const options = [
  { value: 'a', label: 'Alice Exemple' },
  { value: 'b', label: 'Béatrice Fictive' },
  { value: 'c', label: 'Charles Fictif' },
];
function Form({ onSubmit = vi.fn(), disabled = false }) {
  const [value, setValue] = useState('');
  return (
    <BootstrapForm onSubmit={onSubmit}>
      <label htmlFor="patient">Patient</label>
      <ScrollableSelect
        id="patient"
        name="patientId"
        value={value}
        options={options}
        onChange={setValue}
        required
        disabled={disabled}
      />
      <label htmlFor="other">Autre champ</label>
      <input id="other" />
      <button type="submit">Valider</button>
    </BootstrapForm>
  );
}
test('choix à la souris, valeur conservée et fermeture du menu', async () => {
  const user = userEvent.setup();
  render(<Form />);
  const control = screen.getByRole('combobox', { name: 'Patient' });
  expect(control).toHaveAttribute('aria-expanded', 'false');
  await user.click(control);
  expect(screen.getByRole('listbox')).toHaveClass('scrollable-select-menu');
  await user.click(screen.getByRole('option', { name: 'Béatrice Fictive' }));
  expect(control).toHaveTextContent('Béatrice Fictive');
  expect(control).toHaveValue('b');
  expect(control).toHaveFocus();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  await user.click(control);
  expect(screen.getByRole('option', { name: 'Béatrice Fictive' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await user.click(screen.getByLabelText('Autre champ'));
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
test('clavier : flèches, début/fin, saisie de lettres, validation, Tab et Échap', async () => {
  const user = userEvent.setup();
  render(<Form />);
  const control = screen.getByRole('combobox', { name: 'Patient' });
  control.focus();
  fireEvent.keyDown(control, { key: 'ArrowDown' });
  expect(control).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(control, { key: 'End' });
  expect(control).toHaveAttribute('aria-activedescendant', 'patient-option-2');
  fireEvent.keyDown(control, { key: 'Home' });
  fireEvent.keyDown(control, { key: 'ArrowDown' });
  fireEvent.keyDown(control, { key: 'Enter' });
  expect(control).toHaveValue('b');
  fireEvent.keyDown(control, { key: 'c' });
  expect(control).toHaveAttribute('aria-activedescendant', 'patient-option-2');
  fireEvent.keyDown(control, { key: 'Escape' });
  expect(control).toHaveAttribute('aria-expanded', 'false');
  expect(control).toHaveValue('b');
  fireEvent.keyDown(control, { key: 'End' });
  expect(control).toHaveAttribute('aria-activedescendant', 'patient-option-2');
  fireEvent.keyDown(control, { key: 'Escape' });
  fireEvent.keyDown(control, { key: 'Home' });
  expect(control).toHaveAttribute('aria-activedescendant', 'patient-option-0');
  fireEvent.keyDown(control, { key: 'Escape' });
  fireEvent.keyDown(control, { key: 'ArrowUp' });
  await user.tab();
  expect(control).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByLabelText('Autre champ')).toHaveFocus();
});
test('champ obligatoire : validation Bootstrap, focus visible et correction après sélection', async () => {
  const submit = vi.fn(),
    user = userEvent.setup();
  render(<Form onSubmit={submit} />);
  await user.click(screen.getByRole('button', { name: 'Valider' }));
  const control = screen.getByRole('combobox', { name: 'Patient' });
  expect(control).toHaveClass('is-invalid');
  expect(control).toHaveFocus();
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByText('Ce champ est obligatoire.')).toHaveClass('invalid-feedback');
  await user.click(control);
  await user.click(screen.getByRole('option', { name: 'Alice Exemple' }));
  await waitFor(() => expect(control).not.toHaveClass('is-invalid'));
  await user.click(screen.getByRole('button', { name: 'Valider' }));
  expect(submit).toHaveBeenCalledOnce();
});
test('champ désactivé : aucune ouverture ; Échap ouvert ne remonte pas à la modale', () => {
  const parent = vi.fn();
  const view = render(<Form disabled />);
  const disabled = screen.getByRole('combobox', { name: 'Patient' });
  expect(disabled).toBeDisabled();
  fireEvent.click(disabled);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  view.unmount();
  render(
    <div onKeyDown={parent}>
      <Form />
    </div>,
  );
  const control = screen.getByRole('combobox', { name: 'Patient' });
  fireEvent.click(control);
  fireEvent.keyDown(control, { key: 'Escape' });
  expect(parent).not.toHaveBeenCalled();
});
