import { useAuth } from '../auth/AuthContext.jsx';
import { usePagination, useResource, ResourceState, Pagination } from '../components/shared.jsx';
import { paymentMethods, formatMoney } from '../payments/money.js';
import PaymentMethodIcon from '../payments/PaymentMethodIcon.jsx';
import PaymentDepositControl from '../payments/PaymentDepositControl.jsx';
import PaymentDeleteControl from '../payments/PaymentDeleteControl.jsx';
export default function PatientPayments({ id }) {
  const { can } = useAuth();
  const { page, setPage, limit, setLimit } = usePagination(5);
  const resource = useResource(
    '/patients/' + id + '/payments',
    { page, limit },
    can('payments.read'),
  );
  const refresh = () => {
    setPage(1);
    resource.reload();
  };
  if (!can('payments.read')) return null;
  return (
    <>
      <h3>Paiements du patient</h3>
      <ResourceState resource={resource} />
      {resource.current && !resource.loading && !resource.error && resource.data && (
        <>
          <div className="patient-payment-summary">
            <p className="payment-day-total">
              Total : {formatMoney(resource.data.summary.totalCents)}
            </p>
            <dl className="payment-method-totals">
              {paymentMethods.map((method) => (
                <div key={method.code}>
                  <dt>
                    <span aria-hidden="true">
                      <PaymentMethodIcon method={method.code} />
                    </span>{' '}
                    {method.label}
                  </dt>
                  <dd>{formatMoney(resource.data.summary.methods[method.code])}</dd>
                </div>
              ))}
            </dl>
          </div>
          {resource.data.items.length === 0 ? (
            <p className="muted">Aucun paiement enregistré pour ce patient.</p>
          ) : (
            <ul className="payment-list" aria-label="Paiements du patient">
              {resource.data.items.map((payment) => (
                <li key={payment.id}>
                  <div className="payment-row-heading">
                    <div>
                      <strong>{payment.date.split('-').reverse().join('/')}</strong>
                      <span className="muted d-block">
                        {paymentMethods.find((method) => method.code === payment.method)?.label}
                      </span>
                    </div>
                    <div className="payment-row-actions">
                      <strong>{formatMoney(payment.amountCents)}</strong>
                      <PaymentDeleteControl
                        payment={payment}
                        canDelete={can('payments.delete')}
                        onDeleted={refresh}
                      />
                    </div>
                  </div>
                  <PaymentDepositControl
                    payment={payment}
                    canUpdate={payment.bankDeposited && can('payments.deposit.cancel')}
                    onSaved={resource.reload}
                  />
                </li>
              ))}
            </ul>
          )}
          <Pagination
            data={resource.data.pagination}
            page={page}
            setPage={setPage}
            limit={limit}
            setLimit={setLimit}
            disabled={resource.loading}
            itemLabel="paiement(s)"
            showPageSummary={false}
          />
        </>
      )}
    </>
  );
}
