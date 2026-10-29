import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { PageTitle, Panel } from '../components/shared.jsx';
import { dateKey, todayInParis, monthDays, moveDays } from './calendar.js';
export default function DashboardPage({ now }) {
  const { user, can } = useAuth();
  const today = todayInParis(now);
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const grid = useRef(null);
  const days = monthDays(month);
  const label = (d) =>
    d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const select = (date, focus = false) => {
    setSelected(date);
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
      <PageTitle eyebrow="Votre espace au quotidien" title={'Bonjour ' + user.firstName + ' !'}>
        <span className="today-label">{label(today)}</span>
      </PageTitle>
      <div className="dashboard-grid">
        <Panel className="calendar-panel">
          <div className="calendar-heading">
            <div>
              <p className="eyebrow">Le fil des jours</p>
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
          <div className="calendar-days" role="group" aria-label="Calendrier mensuel" ref={grid}>
            {days.map((d) => (
              <button
                key={dateKey(d)}
                data-date={dateKey(d)}
                aria-label={label(d)}
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
                <span>{d.getDate()}</span>
              </button>
            ))}
          </div>
          <div className="calendar-foot">
            <span>
              <i aria-hidden="true" /> Aujourd’hui
            </span>
            <span>Calendrier de repérage</span>
          </div>
        </Panel>
        <div className="dashboard-aside">
          <Panel>
            <p className="eyebrow">Votre cabinet, simplement</p>
            <h2>Une place pour l’essentiel.</h2>
            <p className="muted">
              Retrouvez vos patients et leurs coordonnées dans un espace commun à votre cabinet.
            </p>
            {can('patients.create') && (
              <Link className="btn btn-primary" to="/patients/new">
                + Créer un patient
              </Link>
            )}
            {can('patients.read') && (
              <Link className="text-link" to="/patients">
                Consulter la patientèle →
              </Link>
            )}
          </Panel>
          <Panel className="quiet-panel">
            <p className="eyebrow">Date sélectionnée</p>
            <h3>{label(selected)}</h3>
            <p className="muted mb-0">
              Ce calendrier permet de se repérer dans les dates. Il ne contient aucun événement ni
              rendez-vous.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
