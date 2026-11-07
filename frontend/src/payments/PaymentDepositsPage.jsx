import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  PageTitle,
  Panel,
  ResourceState,
  useResource,
  Pagination,
  usePagination,
} from '../components/shared.jsx';
import PaymentDeleteControl from './PaymentDeleteControl.jsx';
import PaymentDepositBadge from './PaymentDepositBadge.jsx';
import PaymentMethodIcon from './PaymentMethodIcon.jsx';
import { formatMoney, paymentMethods } from './money.js';

const emptySelection = () => ({ method: null, all: false, ids: new Set(), excluded: new Set() });
const eligible = (payment) =>
  ['cash', 'cheque'].includes(payment.method) && payment.bankDeposited !== true;

export default function PaymentDepositsPage() {
  const { can } = useAuth();
  const { page, setPage, limit, setLimit } = usePagination(25);
  const [selection, setSelection] = useState(emptySelection);
  const [busy, setBusy] = useState(false);
  const resource = useResource('/payments', { page, limit }, can('payments.read'));
  const ready = resource.current && !resource.loading && !resource.error && resource.data;
  const selected = (payment) =>
    eligible(payment) &&
    selection.method === payment.method &&
    (selection.all ? !selection.excluded.has(payment.id) : selection.ids.has(payment.id));
  const selectPayment = (payment, checked) => {
    setSelection((previous) => {
      if (previous.method !== payment.method) {
        return checked
          ? { ...emptySelection(), method: payment.method, ids: new Set([payment.id]) }
          : previous;
      }
      if (previous.all) {
        const excluded = new Set(previous.excluded);
        if (checked) excluded.delete(payment.id);
        else excluded.add(payment.id);
        return { ...previous, excluded };
      }
      const ids = new Set(previous.ids);
      if (checked) ids.add(payment.id);
      else ids.delete(payment.id);
      return { ...previous, method: ids.size ? payment.method : null, ids };
    });
  };
  const onDeleted = () => {
    setSelection(emptySelection());
    setPage(1);
    resource.reload();
  };
  return (
    <>
      <PageTitle eyebrow="Gestion paiements" title="Déposer" />
      <Panel className="payment-selection-panel">
        <h2>Sélection des paiements à déposer</h2>
        <fieldset disabled={!ready || busy || !can('payments.deposit')}>
          <legend className="visually-hidden">Choisir un seul type de paiement</legend>
          <div className="payment-selection-options">
            {[
              ['cash', 'Paiements en espèces'],
              ['cheque', 'Paiements par chèque'],
            ].map(([method, label]) => (
              <label key={method} className="payment-selection-option">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={
                    selection.method === method && selection.all && selection.excluded.size === 0
                  }
                  ref={(node) => {
                    if (node)
                      node.indeterminate =
                        selection.method === method &&
                        ((selection.all && selection.excluded.size > 0) ||
                          (!selection.all && selection.ids.size > 0));
                  }}
                  onChange={(event) =>
                    setSelection(
                      event.target.checked
                        ? { ...emptySelection(), method, all: true }
                        : emptySelection(),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </Panel>
      <Panel>
        <ResourceState resource={resource} />
        {ready && (
          <>
            {resource.data.items.length === 0 ? (
              <p className="empty-state">Aucun paiement enregistré.</p>
            ) : (
              <table className="data-table payment-deposits-table">
                <caption className="visually-hidden">Tous les paiements</caption>
                <thead>
                  <tr>
                    <th scope="col" className="payment-selection-column">
                      Déposer
                    </th>
                    <th scope="col">Date</th>
                    <th scope="col">Patient</th>
                    <th scope="col">Type de paiement</th>
                    <th scope="col">Montant</th>
                    <th scope="col">Dépôt</th>
                    {can('payments.delete') && (
                      <th scope="col" className="payment-actions-column">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {resource.data.items.map((payment) => (
                    <tr key={payment.id}>
                      <td data-label="Déposer">
                        <label className="payment-selection-option">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            aria-label={
                              'Sélectionner le paiement de ' +
                              payment.patient?.lastName +
                              ' ' +
                              payment.patient?.firstName +
                              ' du ' +
                              payment.date.split('-').reverse().join('/') +
                              ' de ' +
                              formatMoney(payment.amountCents)
                            }
                            checked={selected(payment)}
                            disabled={busy || !can('payments.deposit') || !eligible(payment)}
                            onChange={(event) => selectPayment(payment, event.target.checked)}
                          />
                        </label>
                      </td>
                      <td data-label="Date">{payment.date.split('-').reverse().join('/')}</td>
                      <td data-label="Patient">
                        {payment.patient?.lastName} {payment.patient?.firstName}
                      </td>
                      <td data-label="Type de paiement">
                        <span className="payment-method-label">
                          <PaymentMethodIcon method={payment.method} />
                          <span>
                            {paymentMethods.find((method) => method.code === payment.method)?.label}
                          </span>
                        </span>
                      </td>
                      <td data-label="Montant">{formatMoney(payment.amountCents)}</td>
                      <td data-label="Dépôt">
                        {payment.method === 'card' ? (
                          'Sans objet'
                        ) : (
                          <PaymentDepositBadge payment={payment} />
                        )}
                      </td>
                      {can('payments.delete') && (
                        <td data-label="Actions">
                          <PaymentDeleteControl
                            payment={payment}
                            canDelete={true}
                            disabled={busy}
                            onBusyChange={setBusy}
                            onDeleted={onDeleted}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
        <Pagination
          data={resource.data?.pagination}
          page={page}
          setPage={setPage}
          limit={limit}
          setLimit={setLimit}
          disabled={!ready || busy}
          itemLabel="paiement(s)"
        />
      </Panel>
    </>
  );
}
