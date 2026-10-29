import { useEffect, useId, useRef, useState } from 'react';
import BootstrapForm, { FormControl } from '../components/BootstrapForm.jsx';
import {
  Field,
  Pagination,
  usePagination,
  ResourceState,
  useResource,
  useTask,
} from '../components/shared.jsx';
import { api } from '../api/client.js';
import { createRequestId } from '../api/request-id.js';
import { paymentMethods, parseMoney } from './money.js';
export default function PaymentModal({ date, acceptedMethods, onCancel, onSaved }) {
  const titleId = useId();
  const dialog = useRef(null);
  const key = useRef(null);
  if (!key.current) key.current = createRequestId();
  const pending = useRef(false);
  const task = useTask();
  const [values, setValues] = useState({
    patientId: '',
    date,
    method: acceptedMethods[0] || '',
    amountCents: '',
  });
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const { page, setPage, limit, setLimit } = usePagination(25);
  const patients = useResource('/payments/patients', { search: query, page, limit });
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, setPage]);
  const change = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
    key.current = createRequestId();
  };
  return (
    <dialog
      ref={dialog}
      className="payment-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending.current) onCancel();
      }}
    >
      <div className="d-flex align-items-center justify-content-between gap-3 mb-3">
        <h2 id={titleId} className="mb-0">
          Enregistrer un paiement
        </h2>
        <button
          type="button"
          className="btn-close"
          aria-label="Fermer la saisie du paiement"
          disabled={task.busy}
          onClick={onCancel}
        />
      </div>
      <BootstrapForm
        errors={task.fieldErrors}
        validate={() =>
          parseMoney(values.amountCents) === null
            ? {
                amountCents:
                  'Saisissez un montant positif, avec deux décimales maximum (999 999,99 € maximum).',
              }
            : {}
        }
        onSubmit={async () => {
          if (pending.current) return;
          pending.current = true;
          try {
            const result = await task.run(
              () =>
                api.post(
                  '/payments',
                  { ...values, amountCents: parseMoney(values.amountCents) },
                  { headers: { 'Idempotency-Key': key.current } },
                ),
              'Paiement enregistré.',
            );
            if (result) onSaved(result);
          } finally {
            pending.current = false;
          }
        }}
      >
        <fieldset disabled={task.busy}>
          <legend className="visually-hidden">Informations du paiement</legend>
          <Field
            label="Rechercher un patient"
            name="patientSearch"
            type="search"
            maxLength={100}
            value={search}
            onChange={(_, value) => {
              setSearch(value);
              change('patientId', '');
            }}
          />
          <ResourceState resource={patients} />
          <div className="field">
            <label htmlFor={titleId + '-patient'}>Patient *</label>
            <FormControl
              as="select"
              id={titleId + '-patient'}
              name="patientId"
              required
              value={values.patientId}
              onChange={(event) => change('patientId', event.target.value)}
              disabled={patients.loading || Boolean(patients.error)}
            >
              <option value="">Choisir un patient actif</option>
              {!patients.loading &&
                !patients.error &&
                patients.data?.items.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.lastName} {patient.firstName}
                  </option>
                ))}
            </FormControl>
          </div>
          <Pagination
            limit={limit}
            setLimit={setLimit}
            disabled={patients.loading || task.busy}
            itemLabel="patient(s)"
            data={patients.data?.pagination}
            page={page}
            setPage={(next) => {
              setPage(next);
              change('patientId', '');
            }}
          />
          {!patients.loading && !patients.error && patients.data?.items.length === 0 && (
            <p className="muted">Aucun patient actif trouvé.</p>
          )}
          <Field
            label="Date du paiement"
            name="date"
            type="date"
            min="1000-01-01"
            max="9999-12-31"
            required
            value={values.date}
            onChange={change}
          />
          <Field
            label="Montant en euros"
            name="amountCents"
            required
            inputMode="decimal"
            autoComplete="off"
            maxLength={9}
            value={values.amountCents}
            onChange={change}
            placeholder="Ex. : 60,00"
          />
          <div className="field">
            <label htmlFor={titleId + '-method'}>Moyen de paiement *</label>
            <FormControl
              as="select"
              id={titleId + '-method'}
              name="method"
              required
              value={values.method}
              onChange={(event) => change('method', event.target.value)}
            >
              <option value="">Choisir un moyen de paiement</option>
              {paymentMethods
                .filter((method) => acceptedMethods.includes(method.code))
                .map((method) => (
                  <option value={method.code} key={method.code}>
                    {method.label}
                  </option>
                ))}
            </FormControl>
          </div>
          {acceptedMethods.length === 0 && (
            <p className="alert alert-warning">
              Aucun moyen de paiement accepté. Configurez-les dans le paramétrage.
            </p>
          )}
          <div className="actions">
            <button
              type="submit"
              className="btn btn-success"
              disabled={patients.loading || Boolean(patients.error) || acceptedMethods.length === 0}
            >
              Enregistrer le paiement
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
              Annuler
            </button>
          </div>
        </fieldset>
      </BootstrapForm>
    </dialog>
  );
}
