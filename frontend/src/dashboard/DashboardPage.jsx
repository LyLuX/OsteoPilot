import { useId, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { PageTitle, Panel, Pagination, ResourceState, useResource } from '../components/shared.jsx';
import PaymentModal from '../payments/PaymentModal.jsx';
import { paymentMethods, formatMoney } from '../payments/money.js';
import { dateKey, todayInParis, monthDays, moveDays } from './calendar.js';
export default function DashboardPage({ now }) {
  const { can } = useAuth();
  const today = todayInParis(now);
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const grid = useRef(null);
  const days = monthDays(month);
  const cellPrefix = useId();
  const [page, setPage] = useState(1);
  const [paymentModal, setPaymentModal] = useState(false);
  const canReadPayments = can('payments.read');
  const summary = useResource(
    '/payments/summary',
    { from: dateKey(days[0]), to: dateKey(days[41]) },
    canReadPayments,
  );
  const payments = useResource(
    '/payments',
    { date: dateKey(selected), page, limit: 10 },
    canReadPayments,
  );
  const totals = new Map(summary.data?.days?.map((day) => [day.date, day]) ?? []);
  const summaryAvailable =
    canReadPayments && !summary.loading && !summary.error && Boolean(summary.data);
  const dayTotal = totals.get(dateKey(selected))?.totalCents ?? 0;
  const label = (d) =>
    d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const select = (date, focus = false) => {
    setSelected(date);
    setPage(1);
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    if (focus)
      requestAnimationFrame(() =>
        grid.current?.querySelector('[data-date="' + dateKey(date) + '"]')?.focus(),
      );
  };
  const changeMonth = (delta) => select(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  const keydown = (e, date) => {
    const offsets = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -((date.getDay() + 6) % 7),
      End: 6 - ((date.getDay() + 6) % 7),
    };
    if (Object.hasOwn(offsets, e.key)) {
      e.preventDefault();
      select(moveDays(date, offsets[e.key]), true);
    }
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      select(
        new Date(date.getFullYear(), date.getMonth() + (e.key === 'PageUp' ? -1 : 1), 1),
        true,
      );
    }
  };
  return (
    <>
      <PageTitle eyebrow="Votre espace au quotidien">
        <span className="today-label">{label(today)}</span>
      </PageTitle>
      <div className="dashboard-grid">
        <Panel className="calendar-panel">
          <div className="calendar-heading">
            <div>
              <h2 aria-live="polite">
                {month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </h2>
            </div>
            <div className="calendar-controls">
              <button
                className="btn btn-light"
                aria-label="Mois précédent"
                onClick={() => changeMonth(-1)}
              >
                ‹
              </button>
              <button className="btn btn-outline-secondary" onClick={() => select(today)}>
                Aujourd’hui
              </button>
              <button
                className="btn btn-light"
                aria-label="Mois suivant"
                onClick={() => changeMonth(1)}
              >
                ›
              </button>
            </div>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          {canReadPayments && <ResourceState resource={summary} />}
          <div className="calendar-days" role="group" aria-label="Calendrier mensuel" ref={grid}>
            {days.map((d) => (
              <button
                key={dateKey(d)}
                data-date={dateKey(d)}
                aria-label={label(d)}
                aria-describedby={canReadPayments ? cellPrefix + dateKey(d) : undefined}
                aria-current={dateKey(d) === dateKey(today) ? 'date' : undefined}
                aria-pressed={dateKey(d) === dateKey(selected)}
                tabIndex={dateKey(d) === dateKey(selected) ? 0 : -1}
                className={
                  'calendar-day ' +
                  (d.getMonth() !== month.getMonth() ? 'adjacent ' : '') +
                  (dateKey(d) === dateKey(today) ? 'today' : '')
                }
                onClick={() => select(d)}
                onKeyDown={(e) => keydown(e, d)}
              >
                <span className="day-number">{d.getDate()}</span>
                {canReadPayments && (
                  <span className="calendar-day-payments" id={cellPrefix + dateKey(d)}>
                    {paymentMethods.map((method) => (
                      <span className="calendar-payment-line" key={method.code}>
                        <span>
                          <span className="visually-hidden">{method.label}</span>
                          <abbr title={method.label} aria-hidden="true">
                            {method.short}
                          </abbr>
                        </span>
                        <span>
                          {summaryAvailable
                            ? formatMoney(totals.get(dateKey(d))?.methods[method.code] ?? 0)
                            : '…'}
                        </span>
                      </span>
                    ))}
                    <span className="calendar-payment-line calendar-payment-total">
                      <span>Total</span>
                      <span>
                        {summaryAvailable
                          ? formatMoney(totals.get(dateKey(d))?.totalCents ?? 0)
                          : '…'}
                      </span>
                    </span>
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="calendar-foot">
            <span>
              <i aria-hidden="true" /> Aujourd’hui
            </span>
          </div>
        </Panel>
        <div className="dashboard-aside">
          <Panel className="quiet-panel">
            <h3>{label(selected)}</h3>
            {canReadPayments ? (
              <>
                <p className="payment-day-total">
                  Total : {summaryAvailable ? formatMoney(dayTotal) : '…'}
                </p>
                <ResourceState resource={payments} />
                {!payments.loading && !payments.error && payments.data && (
                  <>
                    {payments.data.items.length === 0 ? (
                      <p className="muted">Aucun paiement enregistré pour ce jour.</p>
                    ) : (
                      <ul className="payment-list" aria-label="Paiements du jour">
                        {payments.data.items.map((payment) => (
                          <li key={payment.id}>
                            <div>
                              <strong>
                                {payment.patient?.lastName} {payment.patient?.firstName}
                              </strong>
                              <span className="muted d-block">
                                {
                                  paymentMethods.find((method) => method.code === payment.method)
                                    ?.label
                                }
                              </span>
                            </div>
                            <strong>{formatMoney(payment.amountCents)}</strong>
                          </li>
                        ))}
                      </ul>
                    )}
                    <Pagination data={payments.data.pagination} page={page} setPage={setPage} />
                  </>
                )}
                {can('payments.create') && (
                  <button
                    className="btn btn-success w-100 mt-3"
                    disabled={!summaryAvailable}
                    onClick={() => setPaymentModal(true)}
                  >
                    Enregistrer un paiement
                  </button>
                )}
              </>
            ) : (
              <p className="muted">Vous ne disposez pas du droit de consulter les paiements.</p>
            )}
          </Panel>
        </div>
      </div>
      {paymentModal && (
        <PaymentModal
          date={dateKey(selected)}
          acceptedMethods={summary.data?.acceptedMethods ?? []}
          onCancel={() => setPaymentModal(false)}
          onSaved={(payment) => {
            const [year, monthNumber, day] = payment.date.split('-').map(Number);
            select(new Date(year, monthNumber - 1, day));
            setPaymentModal(false);
            summary.reload();
            payments.reload();
          }}
        />
      )}
    </>
  );
}
