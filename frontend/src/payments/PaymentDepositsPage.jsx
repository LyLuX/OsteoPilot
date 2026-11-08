import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  PageTitle,
  Panel,
  ResourceState,
  useResource,
  Pagination,
  usePagination,
  useTask,
  ConfirmDialog,
} from '../components/shared.jsx';
import { api } from '../api/client.js';
import { createRequestId } from '../api/request-id.js';
import PaymentDepositHistoryPage from './PaymentDepositHistoryPage.jsx';
import PaymentDepositPrintPage from './PaymentDepositPrintPage.jsx';
import PaymentDepositControl from './PaymentDepositControl.jsx';
import PaymentDeleteControl from './PaymentDeleteControl.jsx';
import PaymentDepositBadge from './PaymentDepositBadge.jsx';
import PaymentMethodIcon from './PaymentMethodIcon.jsx';
import { formatMoney, paymentMethods } from './money.js';

const emptySelection = () => ({ method: null, all: false, ids: new Set(), excluded: new Set() });
const eligible = (payment) =>
  ['cash', 'cheque'].includes(payment.method) && payment.bankDeposited !== true;

export default function PaymentDepositsPage() {
  const { can } = useAuth();
  const { page, setPage, limit, setLimit } = usePagination(5);
  const [selection, setSelection] = useState(emptySelection);
  const [actionBusy, setBusy] = useState(false);
  const [printData, setPrintData] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [cancelRequest, setCancelRequest] = useState(null);
  const cancelling = useRef(false);
  const task = useTask();
  const preparing = useRef(false);
  const busy = actionBusy || task.busy;
  const resource = useResource('/payments', { page, limit }, can('payments.read'));
  const cancellable = useResource(
    '/payments/deposits/cancellable',
    { method: selection.method },
    can('payments.read') &&
      can('payments.deposit.cancel') &&
      Boolean(selection.method) &&
      !printData,
  );
  const canCancel =
    cancellable.current &&
    !cancellable.loading &&
    !cancellable.error &&
    cancellable.data?.method === selection.method &&
    cancellable.data.items.length > 0;
  const ready = resource.current && !resource.loading && !resource.error && resource.data;
  const methodAvailable = (method) =>
    resource.data?.pendingDeposits?.[method] > 0 || resource.data?.depositedPayments?.[method] > 0;
  const selectedMethodUnavailable =
    Boolean(ready && selection.method) && !methodAvailable(selection.method);
  useEffect(() => {
    if (selectedMethodUnavailable) setSelection(emptySelection());
  }, [selectedMethodUnavailable]);
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
  if (printData)
    return (
      <PaymentDepositPrintPage
        data={printData}
        readOnly={Boolean(printData.archived)}
        canReprint={can('payments.deposits.reprint')}
        canDeposit={can('payments.deposit')}
        backLabel={printData.archived ? 'Retour à l’historique' : 'Retour aux paiements'}
        onBack={() => {
          setPrintData(null);
          if (!printData.archived) setSelection(emptySelection());
          resource.reload();
        }}
      />
    );
  if (historyOpen)
    return (
      <PaymentDepositHistoryPage
        onBack={() => setHistoryOpen(false)}
        onPrint={(data) => setPrintData({ ...data, archived: true })}
      />
    );
  return (
    <>
      <PageTitle eyebrow="Gestion paiements" title="Déposer" />
      <Panel className="payment-selection-panel">
        <h2>Sélection des paiements à déposer</h2>
        <fieldset disabled={!ready || busy}>
          <legend className="visually-hidden">Choisir un seul type de paiement</legend>
          <div className="payment-selection-row">
            <div className="payment-selection-options">
              {[
                ['cash', 'Paiements en espèces'],
                ['cheque', 'Paiements par chèque'],
              ].map(([method, label]) => (
                <label key={method} className="payment-selection-option">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    disabled={
                      !(can('payments.deposit') || can('payments.deposit.cancel')) ||
                      !methodAvailable(method)
                    }
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
            <div className="payment-selection-actions">
              {can('payments.deposit') && (
                <button
                  type="button"
                  className="btn btn-outline-success"
                  disabled={
                    !selection.method ||
                    !(resource.data?.pendingDeposits?.[selection.method] > 0) ||
                    (!selection.all && selection.ids.size === 0)
                  }
                  onClick={async () => {
                    if (preparing.current) return;
                    preparing.current = true;
                    try {
                      const result = await task.run(async () => {
                        try {
                          return await api.post('/payments/deposits/preview', {
                            method: selection.method,
                            all: selection.all,
                            ids: [...selection.ids],
                            excluded: [...selection.excluded],
                          });
                        } catch (error) {
                          if (error.response?.status === 409) {
                            setSelection(emptySelection());
                            resource.reload();
                          }
                          throw error;
                        }
                      });
                      if (result) setPrintData(result);
                    } finally {
                      preparing.current = false;
                    }
                  }}
                >
                  Déposer
                </button>
              )}
              {can('payments.deposit.cancel') && (
                <button
                  type="button"
                  className="btn btn-outline-warning"
                  disabled={!canCancel}
                  onClick={() => {
                    if (!canCancel) return;
                    setCancelRequest({
                      method: selection.method,
                      items: cancellable.data.items.map(({ id, version }) => ({ id, version })),
                      key: createRequestId(),
                    });
                  }}
                >
                  Annuler les dépôts
                </button>
              )}
              {can('payments.deposits.read') && (
                <button
                  type="button"
                  className="btn btn-outline-info"
                  onClick={() => setHistoryOpen(true)}
                >
                  Historique des dépôts
                </button>
              )}
            </div>
          </div>
        </fieldset>
        {selection.method && cancellable.error && <ResourceState resource={cancellable} />}
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
                    {(can('payments.delete') || can('payments.deposit.cancel')) && (
                      <th scope="col" className="payment-actions-column">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {resource.data.items.map((payment) => (
                    <tr key={payment.id}>
                      <td data-label="Déposer" className="payment-selection-column">
                        {payment.method === 'transfer' ||
                        (['cash', 'cheque'].includes(payment.method) && payment.bankDeposited) ? (
                          <span
                            className="payment-deposited-check"
                            role="img"
                            aria-label={
                              payment.method === 'transfer'
                                ? 'Virement sur le compte'
                                : 'Paiement déposé'
                            }
                          >
                            <svg
                              width="22"
                              height="22"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="m5 12 4 4L19 6" />
                            </svg>
                          </span>
                        ) : (
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
                        )}
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
                      {(can('payments.delete') || can('payments.deposit.cancel')) && (
                        <td data-label="Actions">
                          {['cash', 'cheque'].includes(payment.method) && payment.bankDeposited ? (
                            <PaymentDepositControl
                              payment={payment}
                              canUpdate={can('payments.deposit.cancel')}
                              compact
                              disabled={busy}
                              onBusyChange={setBusy}
                              onSaved={onDeleted}
                            />
                          ) : (
                            <PaymentDeleteControl
                              payment={payment}
                              canDelete={can('payments.delete')}
                              disabled={busy}
                              onBusyChange={setBusy}
                              onDeleted={onDeleted}
                            />
                          )}
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
      {cancelRequest && (
        <ConfirmDialog
          title="Annuler tous les dépôts ?"
          tone="warning"
          busy={busy}
          onCancel={(event) => {
            if (cancelling.current) event?.preventDefault();
            else setCancelRequest(null);
          }}
          onConfirm={async () => {
            if (cancelling.current) return;
            cancelling.current = true;
            try {
              const result = await task.run(
                async () => {
                  try {
                    return await api.post(
                      '/payments/deposits/cancel',
                      {
                        method: cancelRequest.method,
                        items: cancelRequest.items,
                        confirmed: true,
                      },
                      { headers: { 'Idempotency-Key': cancelRequest.key } },
                    );
                  } catch (error) {
                    if ([409, 422].includes(error.response?.status)) {
                      setCancelRequest(null);
                      resource.reload();
                      cancellable.reload();
                    }
                    throw error;
                  }
                },
                'Dépôts annulés.',
                'warning',
              );
              if (result) {
                setCancelRequest(null);
                setSelection(emptySelection());
                setPage(1);
                resource.reload();
                cancellable.reload();
              }
            } finally {
              cancelling.current = false;
            }
          }}
        >
          Tous les dépôts {cancelRequest.method === 'cash' ? 'en espèces' : 'par chèque'} seront
          annulés, sur toutes les pages ({cancelRequest.items.length} paiement(s)). Les paiements
          seront de nouveau à déposer.
        </ConfirmDialog>
      )}
    </>
  );
}
