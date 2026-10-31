import { useId, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  PageTitle,
  Panel,
  Pagination,
  usePagination,
  ResourceState,
  useResource,
} from '../components/shared.jsx';
import PaymentModal from '../payments/PaymentModal.jsx';
import PaymentDepositControl from '../payments/PaymentDepositControl.jsx';
import PaymentMethodIcon from '../payments/PaymentMethodIcon.jsx';
import { paymentMethods, formatMoney } from '../payments/money.js';
import {
  dateKey,
  todayInParis,
  moveDays,
  isoWeek,
  calendarPeriod,
  aggregatePayments,
} from './calendar.js';

const label = (d) =>
  d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
const monthLabel = (d) => d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const viewNames = { week: 'Semaine', month: 'Mois', year: 'Année' };
function PaymentTotals({ totals, methods, available, id }) {
  const historical =
    totals.totalCents - methods.reduce((sum, method) => sum + totals.methods[method.code], 0);
  return (
    <span className="calendar-day-payments" id={id}>
      {methods.map((method) => (
        <span className="calendar-payment-line" key={method.code}>
          <PaymentMethodIcon method={method.code} />
          <span>{available ? formatMoney(totals.methods[method.code]) : '…'}</span>
        </span>
      ))}
      {available && historical > 0 && (
        <span
          className="calendar-payment-line"
          title="Paiements enregistrés avec des moyens désormais désactivés"
        >
          <span>Autres</span>
          <span>{formatMoney(historical)}</span>
        </span>
      )}
      <span className="calendar-payment-line calendar-payment-total">
        <span>Total</span>
        <span>{available ? formatMoney(totals.totalCents) : '…'}</span>
      </span>
    </span>
  );
}
export default function DashboardPage(props) {
  const settings = useResource('/settings/calendar');
  if (settings.loading || settings.error || !settings.data)
    return (
      <>
        <PageTitle eyebrow="Votre espace au quotidien" />
        <ResourceState resource={settings} />
      </>
    );
  return <DashboardCalendar {...props} defaultView={settings.data.defaultCalendarView} />;
}
function DashboardCalendar({ now, defaultView }) {
  const { can } = useAuth();
  const today = todayInParis(now);
  const [selected, setSelected] = useState(() =>
    defaultView === 'year' ? new Date(today.getFullYear(), today.getMonth(), 1) : today,
  );
  const [view, setView] = useState(defaultView);
  const [detail, setDetail] = useState('cell');
  const grid = useRef(null);
  const period = calendarPeriod(view, selected);
  const cellPrefix = useId();
  const { page, setPage, limit, setLimit } = usePagination(5);
  const [paymentModal, setPaymentModal] = useState(false);
  const canReadPayments = can('payments.read');
  const summary = useResource(
    '/payments/summary',
    { from: dateKey(period.from), to: dateKey(period.to) },
    canReadPayments,
  );
  const periodFrom =
    view === 'month' ? new Date(selected.getFullYear(), selected.getMonth(), 1) : period.from;
  const periodTo =
    view === 'month' ? new Date(selected.getFullYear(), selected.getMonth() + 1, 0) : period.to;
  const detailFrom = detail === 'period' ? periodFrom : selected;
  const detailTo =
    detail === 'period'
      ? periodTo
      : view === 'year'
        ? new Date(selected.getFullYear(), selected.getMonth() + 1, 0)
        : selected;
  const singleDay = dateKey(detailFrom) === dateKey(detailTo);
  const payments = useResource(
    '/payments',
    {
      ...(singleDay
        ? { date: dateKey(detailFrom) }
        : { from: dateKey(detailFrom), to: dateKey(detailTo) }),
      page,
      limit,
    },
    canReadPayments,
  );
  const summaryAvailable =
    canReadPayments &&
    summary.current &&
    !summary.loading &&
    !summary.error &&
    Boolean(summary.data);
  const methods = summaryAvailable
    ? paymentMethods.filter((method) => summary.data.acceptedMethods.includes(method.code))
    : [];
  const week = isoWeek(selected);
  const periodTitle =
    view === 'year'
      ? String(selected.getFullYear())
      : view === 'week'
        ? 'Semaine ' + week.number + ' · ' + week.year
        : monthLabel(selected);
  const detailTitle =
    detail === 'period' ? periodTitle : view === 'year' ? monthLabel(selected) : label(selected);
  const allLabel =
    view === 'week' ? 'Toute la semaine' : view === 'year' ? 'Toute l’année' : 'Tout le mois';
  const select = (date, focus = false) => {
    setSelected(date);
    setDetail('cell');
    setPage(1);
    if (focus)
      requestAnimationFrame(() =>
        grid.current?.querySelector('[data-date="' + dateKey(date) + '"]')?.focus(),
      );
  };
  const changePeriod = (delta) => {
    setSelected(
      view === 'week'
        ? moveDays(selected, delta * 7)
        : view === 'year'
          ? new Date(selected.getFullYear() + delta, selected.getMonth(), 1)
          : new Date(selected.getFullYear(), selected.getMonth() + delta, 1),
    );
    setDetail('cell');
    setPage(1);
  };
  const keydown = (e, date) => {
    const wide = window.matchMedia?.('(min-width: 600px)').matches ?? true;
    const columns = view === 'year' ? (wide ? 3 : 2) : view === 'week' && !wide ? 2 : 7;
    const offsets =
      view === 'year'
        ? {
            ArrowLeft: -1,
            ArrowRight: 1,
            ArrowUp: -columns,
            ArrowDown: columns,
            Home: -date.getMonth(),
            End: 11 - date.getMonth(),
          }
        : {
            ArrowLeft: -1,
            ArrowRight: 1,
            ArrowUp: -columns,
            ArrowDown: columns,
            Home: -((date.getDay() + 6) % 7),
            End: 6 - ((date.getDay() + 6) % 7),
          };
    if (Object.hasOwn(offsets, e.key)) {
      e.preventDefault();
      select(
        view === 'year'
          ? new Date(date.getFullYear(), date.getMonth() + offsets[e.key], 1)
          : moveDays(date, offsets[e.key]),
        true,
      );
    }
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const delta = e.key === 'PageUp' ? -1 : 1;
      select(
        view === 'year'
          ? new Date(date.getFullYear() + delta, date.getMonth(), 1)
          : view === 'week'
            ? moveDays(date, delta * 7)
            : new Date(date.getFullYear(), date.getMonth() + delta, 1),
        true,
      );
    }
  };
  return (
    <>
      <PageTitle eyebrow="Votre espace au quotidien" />
      <div className="dashboard-grid">
        <Panel className="calendar-panel">
          <div className="calendar-heading">
            <div>
              <h2 aria-live="polite">{periodTitle}</h2>
              {view === 'week' && (
                <p className="muted mb-0">
                  Du {period.from.toLocaleDateString('fr-FR')} au{' '}
                  {period.to.toLocaleDateString('fr-FR')}
                </p>
              )}
            </div>
            <div className="calendar-view-switch" role="group" aria-label="Affichage du calendrier">
              {Object.entries(viewNames).map(([value, name]) => (
                <button
                  key={value}
                  className="btn btn-outline-secondary"
                  aria-pressed={view === value}
                  onClick={() => {
                    setView(value);
                    setDetail('cell');
                    setPage(1);
                    if (value === 'year')
                      setSelected(new Date(selected.getFullYear(), selected.getMonth(), 1));
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="calendar-controls">
              <button
                className="btn btn-outline-light"
                aria-label={viewNames[view] + (view === 'month' ? ' précédent' : ' précédente')}
                onClick={() => changePeriod(-1)}
              >
                ‹
              </button>
              <button
                className="btn btn-outline-secondary"
                onClick={() => {
                  select(today);
                  if (view === 'year')
                    setSelected(new Date(today.getFullYear(), today.getMonth(), 1));
                }}
              >
                Aujourd’hui
              </button>
              <button
                className="btn btn-outline-light"
                aria-label={viewNames[view] + (view === 'month' ? ' suivant' : ' suivante')}
                onClick={() => changePeriod(1)}
              >
                ›
              </button>
            </div>
          </div>
          {view !== 'year' && (
            <div className={'calendar-weekdays calendar-weekdays--' + view} aria-hidden="true">
              {['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
          )}
          {canReadPayments && <ResourceState resource={summary} />}
          <div
            className={'calendar-days calendar-days--' + view}
            role="group"
            aria-label={
              'Calendrier ' + { week: 'hebdomadaire', month: 'mensuel', year: 'annuel' }[view]
            }
            ref={grid}
          >
            {period.cells.map((d) => {
              const end = view === 'year' ? new Date(d.getFullYear(), d.getMonth() + 1, 0) : d;
              const active =
                view === 'year'
                  ? d.getMonth() === selected.getMonth()
                  : dateKey(d) === dateKey(selected);
              const current =
                view === 'year'
                  ? d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()
                  : dateKey(d) === dateKey(today);
              return (
                <button
                  key={dateKey(d)}
                  data-date={dateKey(d)}
                  aria-label={view === 'year' ? monthLabel(d) : label(d)}
                  aria-describedby={canReadPayments ? cellPrefix + dateKey(d) : undefined}
                  aria-current={current ? (view === 'year' ? 'true' : 'date') : undefined}
                  aria-pressed={active}
                  tabIndex={active ? 0 : -1}
                  className={
                    'calendar-day ' +
                    (view === 'month' && d.getMonth() !== selected.getMonth() ? 'adjacent ' : '') +
                    (current ? 'today' : '')
                  }
                  onClick={() => select(d)}
                  onKeyDown={(e) => keydown(e, d)}
                >
                  {view === 'week' && (
                    <span className="calendar-week-day-name">
                      {d.toLocaleDateString('fr-FR', { weekday: 'short' })}
                    </span>
                  )}
                  <span className="day-number">
                    {view === 'year'
                      ? d.toLocaleDateString('fr-FR', { month: 'long' })
                      : d.getDate()}
                  </span>
                  {canReadPayments && (
                    <PaymentTotals
                      totals={aggregatePayments(summary.data?.days, d, end)}
                      methods={methods}
                      available={summaryAvailable}
                      id={cellPrefix + dateKey(d)}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div className="calendar-foot">
            <span>
              <i aria-hidden="true" /> {view === 'year' ? 'Mois courant' : 'Aujourd’hui'}
            </span>
            {canReadPayments && (
              <span className="payment-legend" aria-label="Légende des moyens de paiement">
                {methods.map((method) => (
                  <span className="payment-legend-item" key={method.code}>
                    <PaymentMethodIcon method={method.code} />
                    <span aria-hidden="true">{method.label}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
        </Panel>
        <div className="dashboard-aside">
          <Panel className="quiet-panel">
            <h3>{detailTitle}</h3>
            {canReadPayments ? (
              <>
                <p className="payment-day-total">
                  Total :{' '}
                  {summaryAvailable
                    ? formatMoney(
                        aggregatePayments(summary.data?.days, detailFrom, detailTo).totalCents,
                      )
                    : '…'}
                </p>
                {!singleDay && (
                  <p className="muted">
                    Du {detailFrom.toLocaleDateString('fr-FR')} au{' '}
                    {detailTo.toLocaleDateString('fr-FR')}
                  </p>
                )}
                <ResourceState resource={payments} />
                {payments.current && !payments.loading && !payments.error && payments.data && (
                  <>
                    {payments.data.items.length === 0 ? (
                      <p className="muted">
                        {singleDay
                          ? 'Aucun paiement enregistré pour ce jour.'
                          : 'Aucun paiement enregistré pour cette période.'}
                      </p>
                    ) : (
                      <ul
                        className="payment-list"
                        aria-label={singleDay ? 'Paiements du jour' : 'Paiements de la période'}
                      >
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
                                {!singleDay && ' · ' + payment.date.split('-').reverse().join('/')}
                              </span>
                            </div>
                            <strong>{formatMoney(payment.amountCents)}</strong>
                            <PaymentDepositControl
                              payment={payment}
                              canUpdate={can('payments.deposit')}
                              onSaved={payments.reload}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                    <Pagination
                      data={payments.data.pagination}
                      page={page}
                      setPage={setPage}
                      limit={limit}
                      setLimit={setLimit}
                      disabled={payments.loading}
                      itemLabel="paiement(s)"
                      showPageSummary={false}
                    />
                  </>
                )}
                {can('payments.create') && (
                  <button
                    className="btn btn-outline-success w-100 mt-3"
                    disabled={!summaryAvailable}
                    onClick={() => setPaymentModal(true)}
                  >
                    Enregistrer un paiement
                  </button>
                )}
                {detail !== 'period' && (
                  <button
                    className="btn btn-outline-info w-100"
                    onClick={() => {
                      setDetail('period');
                      setPage(1);
                    }}
                  >
                    {allLabel}
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
            if (view === 'year') setSelected(new Date(year, monthNumber - 1, 1));
            setPaymentModal(false);
            summary.reload();
            payments.reload();
          }}
        />
      )}
    </>
  );
}
