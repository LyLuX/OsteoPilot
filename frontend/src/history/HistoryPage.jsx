import { useState } from 'react';
import {
  Field,
  PageTitle,
  Panel,
  Pagination,
  ResourceState,
  useResource,
} from '../components/shared.jsx';
const blank = { actorId: '', action: '', entity: '', from: '', to: '' };
export default function HistoryPage() {
  const [filters, setFilters] = useState(blank);
  const [query, setQuery] = useState({});
  const [page, setPage] = useState(1);
  const resource = useResource('/history', { ...query, page });
  const change = (key, value) => setFilters({ ...filters, [key]: value });
  return (
    <>
      <PageTitle eyebrow="Traçabilité du cabinet" title="Historique" />
      <Panel>
        <p className="muted">
          Actions métier et administratives. Les détails personnels des patients ne sont pas
          enregistrés dans ce journal. Bornes de dates en UTC ; affichage Europe/Paris.
        </p>
        <form
          className="filter-bar"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)));
          }}
        >
          <Field label="Du (UTC)" name="from" type="date" value={filters.from} onChange={change} />
          <Field label="Au (UTC)" name="to" type="date" value={filters.to} onChange={change} />
          <Field
            label="Acteur (UUID utilisateur)"
            name="actorId"
            value={filters.actorId}
            onChange={change}
            maxLength={36}
          />
          <Field
            label="Action exacte"
            name="action"
            value={filters.action}
            onChange={change}
            maxLength={80}
          />
          <label className="field">
            <span>Type d’entité</span>
            <select
              className="form-select"
              value={filters.entity}
              onChange={(e) => change('entity', e.target.value)}
            >
              <option value="">Tous</option>
              {['patient', 'user', 'role', 'settings', 'session', 'auth'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary">Filtrer</button>
          <button
            className="btn btn-outline-secondary"
            type="button"
            onClick={() => {
              setFilters(blank);
              setQuery({});
              setPage(1);
            }}
          >
            Effacer
          </button>
        </form>
        <ResourceState resource={resource} />
        <table className="data-table">
          <caption className="visually-hidden">Actions auditées</caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>Action</th>
              <th>Entité</th>
              <th>Acteur</th>
              <th>Nombre</th>
            </tr>
          </thead>
          <tbody>
            {resource.data?.items.map((r) => (
              <tr key={r.id}>
                <td data-label="Date">
                  {new Date(r.createdAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
                </td>
                <td data-label="Action">{r.action}</td>
                <td data-label="Entité">
                  {r.entity}
                  <small className="d-block muted">{r.entityId || '—'}</small>
                </td>
                <td data-label="Acteur">
                  <small>{r.actorId || 'Non authentifié'}</small>
                </td>
                <td data-label="Nombre">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!resource.loading && !resource.data?.items.length && (
          <p className="empty-state">Aucune action pour ces filtres.</p>
        )}
        <Pagination data={resource.data?.pagination} page={page} setPage={setPage} />
      </Panel>
    </>
  );
}
