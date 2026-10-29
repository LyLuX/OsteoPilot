import FilterPanel from '../components/FilterPanel.jsx';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  PageTitle,
  Panel,
  useResource,
  ResourceState,
  Pagination,
  useTask,
  ConfirmDialog,
} from '../components/shared.jsx';
export default function PatientsPage() {
  const { can } = useAuth();
  const task = useTask();
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState('all');
  const [sort, setSort] = useState('lastName');
  const [direction, setDirection] = useState('ASC');
  useEffect(() => {
    if (search === query) return undefined;
    const timer = window.setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, query]);
  const resource = useResource('/patients', {
    page,
    search: query,
    archived,
    sort,
    direction,
    limit: 25,
  });
  return (
    <>
      <PageTitle eyebrow="Gestion patientèle" title="Patientèle">
        {can('patients.create') && (
          <Link className="btn btn-success" to="/patients/new">
            + Créer un patient
          </Link>
        )}
      </PageTitle>
      <FilterPanel
        errors={resource.fieldErrors}
        fields={[
          {
            name: 'search',
            type: 'search',
            ariaLabel: 'Rechercher un patient',
            value: search,
            onChange: setSearch,
            maxLength: 100,
            placeholder: 'Nom, prénom, email ou téléphone',
          },
          {
            name: 'archived',
            type: 'select',
            label: 'Statut',
            value: archived,
            onChange: (value) => {
              setArchived(value);
              setQuery(search);
              setPage(1);
            },
            options: [
              { value: 'false', label: 'Actifs' },
              { value: 'true', label: 'Inactifs' },
              { value: 'all', label: 'Tous' },
            ],
          },
          {
            name: 'sort',
            type: 'select',
            label: 'Tri',
            value: sort,
            onChange: (value) => {
              setSort(value);
              setQuery(search);
              setPage(1);
            },
            options: [
              { value: 'lastName', label: 'Nom' },
              { value: 'firstName', label: 'Prénom' },
              { value: 'createdAt', label: 'Création' },
            ],
          },
          {
            name: 'direction',
            type: 'select',
            label: 'Ordre',
            value: direction,
            onChange: (value) => {
              setDirection(value);
              setQuery(search);
              setPage(1);
            },
            options: [
              { value: 'ASC', label: 'Croissant' },
              { value: 'DESC', label: 'Décroissant' },
            ],
          },
        ]}
      />
      <Panel>
        <ResourceState resource={resource} />
        {!resource.loading && resource.data?.items.length === 0 && (
          <div className="empty-state">
            <h2>Aucun patient trouvé</h2>
            <p>Modifiez vos filtres ou créez votre première fiche.</p>
          </div>
        )}
        {resource.data?.items.length > 0 && (
          <table className="data-table">
            <caption className="visually-hidden">Patients du cabinet</caption>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Téléphone</th>
                <th>Email</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {resource.data.items.map((p) => (
                <tr key={p.id}>
                  <td data-label="Patient">
                    <strong>
                      {p.lastName} {p.firstName}
                    </strong>
                  </td>
                  <td data-label="Téléphone">{p.phone || '—'}</td>
                  <td data-label="Email">{p.email || '—'}</td>
                  <td data-label="Statut">
                    <span className={'status-badge' + (p.archived ? ' inactive' : '')}>
                      {p.archived ? 'Inactif' : 'Actif'}
                    </span>
                  </td>
                  <td>
                    <div className="patient-actions">
                      <Link className="btn btn-outline-info" to={'/patients/' + p.id}>
                        Ouvrir
                      </Link>
                      {can('patients.archive') && (
                        <button
                          type="button"
                          className={'btn btn-outline-' + (p.archived ? 'success' : 'danger')}
                          disabled={task.busy}
                          onClick={() => setSelected(p)}
                          aria-label={
                            (p.archived ? 'Activer ' : 'Désactiver ') +
                            p.lastName +
                            ' ' +
                            p.firstName
                          }
                        >
                          {p.archived ? 'Activer' : 'Désactiver'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination data={resource.data?.pagination} page={page} setPage={setPage} />
      </Panel>
      {selected && (
        <ConfirmDialog
          title={selected.archived ? 'Activer ce patient ?' : 'Désactiver ce patient ?'}
          tone={selected.archived ? 'success' : 'danger'}
          busy={task.busy}
          onCancel={() => setSelected(null)}
          onConfirm={async () => {
            const result = await task.run(
              () =>
                api.patch('/patients/' + selected.id + '/status', {
                  active: selected.archived,
                  version: selected.version,
                }),
              selected.archived ? 'Patient activé.' : 'Patient désactivé.',
              selected.archived ? 'success' : 'danger',
            );
            if (result) {
              setSelected(null);
              resource.reload();
            }
          }}
        >
          {selected.archived
            ? 'Le patient sera de nouveau actif.'
            : 'La fiche sera conservée. Vous pourrez réactiver le patient à tout moment.'}
        </ConfirmDialog>
      )}
    </>
  );
}
