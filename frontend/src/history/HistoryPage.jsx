import BootstrapForm from '../components/BootstrapForm.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import { useState } from 'react';
import {
  PageTitle,
  Panel,
  Pagination,
  usePagination,
  ResourceState,
  useResource,
} from '../components/shared.jsx';
const blank = { actorId: '', action: '', entity: '', from: '', to: '' };
export default function HistoryPage() {
  const [filters, setFilters] = useState(blank);
  const [query, setQuery] = useState({});
  const { page, setPage, limit, setLimit } = usePagination(25);
  const resource = useResource('/history', { ...query, page, limit });
  const change = (key, value) => setFilters({ ...filters, [key]: value });
  return (
    <>
      <PageTitle eyebrow="Traçabilité du cabinet" title="Historique" />
      <Panel>
        <p className="muted">
          Actions métier et administratives. Les détails personnels des patients ne sont pas
          enregistrés dans ce journal. Bornes de dates en UTC ; affichage Europe/Paris.
        </p>
        <BootstrapForm
          errors={resource.fieldErrors}
          validate={(form) => {
            const from = form.elements.namedItem('from').value;
            const to = form.elements.namedItem('to').value;
            return from && to && from > to
              ? { to: 'La date de fin doit être égale ou postérieure à la date de début.' }
              : {};
          }}
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)));
          }}
        >
          <FilterPanel
            fields={[
              {
                name: 'from',
                type: 'date',
                label: 'Du (UTC)',
                value: filters.from,
                onChange: (value) => change('from', value),
              },
              {
                name: 'to',
                type: 'date',
                label: 'Au (UTC)',
                value: filters.to,
                onChange: (value) => change('to', value),
              },
              {
                name: 'actorId',
                label: 'Acteur (UUID utilisateur)',
                value: filters.actorId,
                onChange: (value) => change('actorId', value),
                pattern:
                  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
                maxLength: 36,
              },
              {
                name: 'action',
                label: 'Action exacte',
                value: filters.action,
                onChange: (value) => change('action', value),
                maxLength: 80,
              },
              {
                name: 'entity',
                type: 'select',
                label: 'Type d’entité',
                value: filters.entity,
                onChange: (value) => change('entity', value),
                emptyLabel: 'Tous',
                options: ['patient', 'user', 'role', 'settings', 'session', 'auth'].map(
                  (value) => ({ value, label: value }),
                ),
              },
            ]}
          />
          <div className="actions mb-3">
            <button className="btn btn-outline-info">Filtrer</button>
            <button
              className="btn btn-outline-secondary"
              type="reset"
              onClick={() => {
                setFilters(blank);
                setQuery({});
                setPage(1);
              }}
            >
              Effacer
            </button>
          </div>
        </BootstrapForm>
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
        <Pagination
          data={resource.data?.pagination}
          page={page}
          setPage={setPage}
          limit={limit}
          setLimit={setLimit}
          disabled={resource.loading}
        />
      </Panel>
    </>
  );
}
