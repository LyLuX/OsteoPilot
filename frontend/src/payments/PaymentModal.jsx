import ScrollableSelect from '../components/ScrollableSelect.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import BootstrapForm, { FormControl } from '../components/BootstrapForm.jsx';
import { Field, ResourceState, useResource, useTask } from '../components/shared.jsx';
import { usePaymentPatients } from './usePaymentPatients.js';
import { api } from '../api/client.js';
import { createRequestId } from '../api/request-id.js';
import { paymentMethods, formatMoney } from './money.js';
import { dateKey, todayInParis } from '../dashboard/calendar.js';
export default function PaymentModal({
  date,
  acceptedMethods,
  onCancel,
  onSaved,
  today = dateKey(todayInParis()),
}) {
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
    tariffId: '',
    amountCents: 0,
    chequeNumber: '',
  });
  const futureDate = values.date > today;
  const dateError = 'La date du paiement ne peut pas être postérieure à aujourd’hui.';
  const tariffs = useResource('/settings/tariffs');
  const patients = usePaymentPatients();
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);
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
          tariffs.data?.tariffs.some((tariff) => tariff.id === values.tariffId)
            ? {}
            : { tariffId: 'Choisissez un tarif disponible.' }
        }
        onSubmit={async () => {
          if (pending.current || futureDate) return;
          pending.current = true;
          try {
            const result = await task.run(async () => {
              try {
                const { chequeNumber, ...paymentValues } = values;
                const payload =
                  values.method === 'cheque' && chequeNumber.trim()
                    ? { ...paymentValues, chequeNumber: chequeNumber.trim() }
                    : paymentValues;
                return await api.post('/payments', payload, {
                  headers: { 'Idempotency-Key': key.current },
                });
              } catch (error) {
                if (
                  error.response?.status === 409 &&
                  error.response?.data?.error?.details?.some(
                    (detail) => detail.field === 'tariffId',
                  )
                ) {
                  tariffs.reload();
                  change('tariffId', '');
                  change('amountCents', 0);
                }
                throw error;
              }
            }, 'Paiement enregistré.');
            if (result) onSaved(result);
          } finally {
            pending.current = false;
          }
        }}
      >
        <fieldset disabled={task.busy}>
          <legend className="visually-hidden">Informations du paiement</legend>
          <ResourceState resource={patients} />
          <div className="field">
            <label htmlFor={titleId + '-patient'}>Patient *</label>
            <ScrollableSelect
              id={titleId + '-patient'}
              name="patientId"
              required
              value={values.patientId}
              placeholder="Choisir un patient actif"
              onChange={(value) => change('patientId', value)}
              disabled={task.busy || patients.loading || Boolean(patients.error)}
              options={
                !patients.loading && !patients.error
                  ? (patients.data?.items ?? []).map((patient) => ({
                      value: patient.id,
                      label: patient.lastName + ' ' + patient.firstName,
                    }))
                  : []
              }
            />
          </div>
          {!patients.loading && !patients.error && patients.data?.items.length === 0 && (
            <p className="muted">Aucun patient actif trouvé.</p>
          )}
          <Field
            label="Date du paiement"
            name="date"
            type="date"
            min="1000-01-01"
            max={today}
            error={futureDate ? dateError : undefined}
            required
            value={values.date}
            onChange={change}
          />
          <ResourceState resource={tariffs} />
          <div className="field">
            <label htmlFor={titleId + '-tariff'}>Tarif *</label>
            <FormControl
              as="select"
              id={titleId + '-tariff'}
              name="tariffId"
              required
              value={values.tariffId}
              disabled={tariffs.loading || Boolean(tariffs.error)}
              onChange={(event) => {
                const tariff = tariffs.data?.tariffs.find((item) => item.id === event.target.value);
                change('tariffId', event.target.value);
                change('amountCents', tariff?.amountCents ?? 0);
              }}
            >
              <option value="">Choisir un tarif</option>
              {tariffs.current &&
                !tariffs.loading &&
                !tariffs.error &&
                tariffs.data?.tariffs.map((tariff) => (
                  <option key={tariff.id} value={tariff.id}>
                    {tariff.label} — {formatMoney(tariff.amountCents)}
                  </option>
                ))}
            </FormControl>
          </div>
          {tariffs.current &&
            !tariffs.loading &&
            !tariffs.error &&
            tariffs.data?.tariffs.length === 0 && (
              <p className="alert alert-warning">
                Aucun tarif configuré. Ajoutez un tarif dans le paramétrage.
              </p>
            )}
          <div className="field">
            <label htmlFor={titleId + '-method'}>Moyen de paiement *</label>
            <FormControl
              as="select"
              id={titleId + '-method'}
              name="method"
              required
              value={values.method}
              onChange={(event) => {
                change('method', event.target.value);
                change('chequeNumber', '');
              }}
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
          {values.method === 'cheque' && (
            <Field
              label="Numéro de chèque"
              name="chequeNumber"
              value={values.chequeNumber}
              onChange={change}
              inputMode="numeric"
              pattern="[0-9]{1,30}"
              maxLength={30}
              autoComplete="off"
            />
          )}
          {acceptedMethods.length === 0 && (
            <p className="alert alert-warning">
              Aucun moyen de paiement accepté. Configurez-les dans le paramétrage.
            </p>
          )}
          <div className="actions">
            <button
              type="submit"
              className="btn btn-outline-success"
              disabled={
                patients.loading ||
                Boolean(patients.error) ||
                acceptedMethods.length === 0 ||
                futureDate ||
                tariffs.loading ||
                Boolean(tariffs.error) ||
                !tariffs.current ||
                !values.tariffId
              }
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
