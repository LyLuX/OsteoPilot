import BootstrapForm, { FormControl } from '../components/BootstrapForm.jsx';
import { useId, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  Field,
  Panel,
  PageTitle,
  ResourceState,
  useResource,
  useTask,
} from '../components/shared.jsx';
const paymentMethods = [
  { code: 'cash', label: 'Espèces' },
  { code: 'card', label: 'Carte' },
  { code: 'cheque', label: 'Chèque' },
  { code: 'transfer', label: 'Virement' },
];
function SettingsForm({ settings }) {
  const [values, setValues] = useState({
    ...Object.fromEntries(
      ['name', 'address', 'phone', 'email', 'timezone'].map((key) => [key, settings[key]]),
    ),
  });
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
        {can('settings.update') && <button className="btn btn-outline-success">Enregistrer</button>}
      </fieldset>
    </BootstrapForm>
  );
}
function PaymentMethodsForm({ settings }) {
  const feedbackId = useId();
  const { can } = useAuth();
  const task = useTask();
  const pending = useRef(false);
  const [selected, setSelected] = useState(settings.paymentMethods ?? []);
  const error = task.fieldErrors.method || task.fieldErrors.accepted;
  const toggle = async (method, accepted) => {
    if (pending.current || !can('settings.update')) return;
    pending.current = true;
    const previous = selected;
    setSelected(accepted ? [...previous, method] : previous.filter((code) => code !== method));
    try {
      const result = await task.run(
        () => api.patch('/settings/payment-methods', { method, accepted }),
        'Moyens de paiement mis à jour.',
        accepted ? 'success' : 'danger',
      );
      setSelected(result?.paymentMethods ?? previous);
    } finally {
      pending.current = false;
    }
  };
  return (
    <fieldset
      disabled={!can('settings.update') || task.busy}
      aria-busy={task.busy}
      aria-describedby={error ? feedbackId : undefined}
    >
      <legend className="visually-hidden">Moyens de règlement acceptés</legend>
      <div className="form-grid">
        {paymentMethods.map(({ code, label }) => (
          <label className="check-label" key={code}>
            <FormControl
              type="checkbox"
              name="method"
              value={code}
              checked={selected.includes(code)}
              error={error}
              feedbackId={feedbackId}
              showFeedback={false}
              onChange={(event) => toggle(code, event.target.checked)}
            />
            {label}
          </label>
        ))}
      </div>
      {error && (
        <div id={feedbackId} className="invalid-feedback d-block">
          {error}
        </div>
      )}
    </fieldset>
  );
}
function CalendarSettingsForm({ settings }) {
  const id = useId();
  const { can } = useAuth();
  const task = useTask();
  const pending = useRef(false);
  const [selected, setSelected] = useState(settings.defaultCalendarView ?? 'month');
  const change = async (defaultCalendarView) => {
    if (pending.current || !can('settings.update') || defaultCalendarView === selected) return;
    pending.current = true;
    const previous = selected;
    setSelected(defaultCalendarView);
    try {
      const result = await task.run(
        () => api.patch('/settings/calendar', { defaultCalendarView }),
        'Vue par défaut du calendrier mise à jour.',
        'warning',
      );
      setSelected(result?.defaultCalendarView ?? previous);
    } finally {
      pending.current = false;
    }
  };
  return (
    <fieldset disabled={!can('settings.update') || task.busy} aria-busy={task.busy}>
      <legend className="visually-hidden">Affichage du calendrier</legend>
      <label className="form-label" htmlFor={id}>
        Vue par défaut
      </label>
      <FormControl
        as="select"
        name="defaultCalendarView"
        id={id}
        value={selected}
        error={task.fieldErrors.defaultCalendarView}
        onChange={(event) => change(event.target.value)}
      >
        <option value="week">Semaine</option>
        <option value="month">Mois</option>
        <option value="year">Année</option>
      </FormControl>
      <p className="muted mt-2 mb-0">
        Enregistrement automatique. Cette vue sera utilisée à l’ouverture du dashboard.
      </p>
    </fieldset>
  );
}
export default function SettingsPage() {
  const resource = useResource('/settings');
  return (
    <>
      <PageTitle eyebrow="Administration" title="Paramétrage" />
      <Panel>
        <h2>Informations générales</h2>
        <ResourceState resource={resource} />
        {resource.data && <SettingsForm settings={resource.data} />}
      </Panel>
      {resource.data && (
        <div className="settings-options-grid">
          <Panel>
            <h2>Moyens de paiement</h2>
            <PaymentMethodsForm settings={resource.data} />
          </Panel>
          <Panel>
            <h2>Calendrier</h2>
            <CalendarSettingsForm settings={resource.data} />
          </Panel>
        </div>
      )}
    </>
  );
}
