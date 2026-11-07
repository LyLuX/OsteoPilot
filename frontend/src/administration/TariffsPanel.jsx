import { useRef, useState } from 'react';
import BootstrapForm from '../components/BootstrapForm.jsx';
import { Field, Panel, useTask } from '../components/shared.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import { parseMoney } from '../payments/money.js';
function TariffForm({ tariff, onSaved }) {
  const { can } = useAuth();
  const task = useTask();
  const pending = useRef(false);
  const [values, setValues] = useState({
    label: tariff?.label ?? '',
    amountCents: tariff ? (tariff.amountCents / 100).toFixed(2).replace('.', ',') : '',
  });
  const change = (name, value) => setValues((current) => ({ ...current, [name]: value }));
  return (
    <BootstrapForm
      errors={task.fieldErrors}
      validate={() =>
        parseMoney(values.amountCents) === null
          ? { amountCents: 'Saisissez un montant positif, avec deux décimales maximum.' }
          : {}
      }
      onSubmit={async () => {
        if (pending.current || !can('settings.update')) return;
        pending.current = true;
        try {
          const input = { label: values.label, amountCents: parseMoney(values.amountCents) };
          const result = await task.run(
            () =>
              tariff
                ? api.patch('/settings/tariffs/' + tariff.id, { ...input, version: tariff.version })
                : api.post('/settings/tariffs', input),
            tariff ? 'Tarif mis à jour.' : 'Tarif ajouté.',
            tariff ? 'warning' : 'success',
          );
          if (result) {
            onSaved(result);
            if (!tariff) setValues({ label: '', amountCents: '' });
          }
        } finally {
          pending.current = false;
        }
      }}
    >
      <fieldset disabled={!can('settings.update') || task.busy} className="tariff-form">
        <legend>{tariff ? tariff.label : 'Ajouter un tarif'}</legend>
        <div className="form-grid">
          <Field
            label="Libellé du tarif"
            name="label"
            required
            maxLength={100}
            value={values.label}
            onChange={change}
          />
          <Field
            label="Montant en euros"
            name="amountCents"
            required
            inputMode="decimal"
            maxLength={9}
            value={values.amountCents}
            onChange={change}
          />
        </div>
        {can('settings.update') && (
          <button
            type="submit"
            className={'btn ' + (tariff ? 'btn-outline-warning' : 'btn-outline-success')}
          >
            {tariff ? 'Enregistrer ce tarif' : 'Ajouter le tarif'}
          </button>
        )}
      </fieldset>
    </BootstrapForm>
  );
}
export default function TariffsPanel({ settings }) {
  const { can } = useAuth();
  const [tariffs, setTariffs] = useState(settings.tariffs ?? []);
  const saved = (tariff) =>
    setTariffs((current) =>
      current.some((item) => item.id === tariff.id)
        ? current.map((item) => (item.id === tariff.id ? tariff : item))
        : [...current, tariff],
    );
  return (
    <Panel className="tariffs-panel">
      <h2>Tarifs</h2>
      <div className="tariffs-grid">
        {tariffs.map((tariff) => (
          <TariffForm key={tariff.id + ':' + tariff.version} tariff={tariff} onSaved={saved} />
        ))}
        {can('settings.update') && tariffs.length < 100 && <TariffForm onSaved={saved} />}
      </div>
    </Panel>
  );
}
