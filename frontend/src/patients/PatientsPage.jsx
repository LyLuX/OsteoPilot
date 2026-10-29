import BootstrapForm, { FormControl } from '../components/BootstrapForm.jsx';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { PageTitle, Panel, useResource, ResourceState, Pagination } from '../components/shared.jsx';
export default function PatientsPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState('false');
  const [sort, setSort] = useState('lastName');
  const [direction, setDirection] = useState('ASC');
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
          <Link className="btn btn-primary" to="/patients/new">
            + Créer un patient
          </Link>
        )}
      </PageTitle>
      <Panel>
        <BootstrapForm
          errors={resource.fieldErrors}
          className="filter-bar"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
            setPage(1);
          }}
        >
          <label className="field grow">
            <span>Rechercher un patient</span>
            <FormControl
              name="search"
              type="search"
              className="form-control"
              value={search}
              maxLength={100}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom, prénom, email ou téléphone"
            />
          </label>
          <label className="field">
            <span>Statut</span>
            <FormControl
              as="select"
              className="form-select"
              name="archived"
              value={archived}
              onChange={(e) => {
                setArchived(e.target.value);
                setPage(1);
              }}
            >
              <option value="false">Actifs</option>
              <option value="true">Archivés</option>
              <option value="all">Tous</option>
            </FormControl>
          </label>
          <label className="field">
            <span>Tri</span>
            <FormControl
              as="select"
              className="form-select"
              name="sort"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="lastName">Nom</option>
              <option value="firstName">Prénom</option>
              <option value="createdAt">Création</option>
            </FormControl>
          </label>
          <label className="field">
            <span>Ordre</span>
            <FormControl
              as="select"
              className="form-select"
              name="direction"
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value);
                setPage(1);
              }}
            >
              <option value="ASC">Croissant</option>
              <option value="DESC">Décroissant</option>
            </FormControl>
          </label>
          <button className="btn btn-primary">Rechercher</button>
        </BootstrapForm>
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
                <th>Fiche</th>
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
                    <span className="status-badge">{p.archived ? 'Archivé' : 'Actif'}</span>
                  </td>
                  <td>
                    <Link className="btn btn-outline-secondary" to={'/patients/' + p.id}>
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination data={resource.data?.pagination} page={page} setPage={setPage} />
      </Panel>
    </>
  );
}
