import { useAuth } from '../auth/AuthContext.jsx';
import { usePagination, useResource, ResourceState, Pagination } from '../components/shared.jsx';
import { paymentMethods, formatMoney } from '../payments/money.js';
import PaymentMethodIcon from '../payments/PaymentMethodIcon.jsx';
import PaymentDepositBadge from '../payments/PaymentDepositBadge.jsx';
export default function PatientPayments({ id }) {
  const { can } = useAuth();
  const { page, setPage, limit, setLimit } = usePagination(5);
  const resource = useResource(
    '/patients/' + id + '/payments',
    { page, limit },
    can('payments.read'),
  );
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
            <table className="data-table payment-deposits-table">
              <caption className="visually-hidden">Paiements du patient</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Type de paiement</th>
                  <th scope="col">Montant</th>
                  <th scope="col">Dépôt</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.items.map((payment) => (
                  <tr key={payment.id}>
                    <td data-label="Date">{payment.date.split('-').reverse().join('/')}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
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
