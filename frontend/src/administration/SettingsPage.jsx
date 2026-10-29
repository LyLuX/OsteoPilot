import BootstrapForm from '../components/BootstrapForm.jsx';
import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  Alert,
  Field,
  Panel,
  PageTitle,
  ResourceState,
  useResource,
  useTask,
} from '../components/shared.jsx';
function SettingsForm({ settings }) {
  const [values, setValues] = useState(
    Object.fromEntries(
      ['name', 'address', 'phone', 'email', 'timezone'].map((key) => [key, settings[key]]),
    ),
  );
  const { can } = useAuth();
  const task = useTask();
  const change = (key, value) => setValues({ ...values, [key]: value });
  return (
    <BootstrapForm
      errors={task.fieldErrors}
      onSubmit={(e) => {
        e.preventDefault();
        task.run(() => api.put('/settings', values), 'Paramètres enregistrés.');
      }}
    >
      <Alert>{task.error}</Alert>
      <Alert success>{task.message}</Alert>
      <fieldset disabled={!can('settings.update') || task.busy}>
        <legend className="visually-hidden">Informations du cabinet</legend>
        <div className="form-grid">
          <Field
            label="Nom du cabinet"
            name="name"
            value={values.name}
            onChange={change}
            maxLength={100}
            required
          />
          <Field
            label="Adresse"
            name="address"
            value={values.address}
            onChange={change}
            maxLength={300}
          />
          <Field
            label="Téléphone"
            name="phone"
            type="tel"
            value={values.phone}
            onChange={change}
            maxLength={30}
          />
          <Field
            label="Email"
            name="email"
            type="email"
            value={values.email}
            onChange={change}
            maxLength={254}
          />
        </div>
        <p className="muted">
          Fuseau du cabinet : Europe/Paris. Les horodatages sont conservés en UTC.
        </p>
        {can('settings.update') && <button className="btn btn-primary">Enregistrer</button>}
      </fieldset>
    </BootstrapForm>
  );
}
export default function SettingsPage() {
  const resource = useResource('/settings');
  return (
    <>
      <PageTitle eyebrow="Administration" title="Paramétrage" />
      <Panel>
        <h2>Votre cabinet</h2>
        <ResourceState resource={resource} />
        {resource.data && <SettingsForm settings={resource.data} />}
      </Panel>
    </>
  );
}
