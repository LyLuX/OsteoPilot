import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import {
  Alert,
  ConfirmDialog,
  Panel,
  PageTitle,
  useResource,
  ResourceState,
  useTask,
} from '../components/shared.jsx';
export default function PatientDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const resource = useResource('/patients/' + id);
  const [confirm, setConfirm] = useState(false);
  const task = useTask();
  const p = resource.data;
  return (
    <>
      <PageTitle eyebrow="Gestion patientèle" title="Fiche patient">
        <Link className="btn btn-outline-secondary" to="/patients">
          ← Patientèle
        </Link>
      </PageTitle>
      <Panel>
        <ResourceState resource={resource} />
        <Alert>{task.error}</Alert>
        <Alert success>{task.message}</Alert>
        {p && (
          <>
            <h2>
              {p.lastName} {p.firstName}
            </h2>
            <span className="status-badge">{p.archived ? 'Archivé' : 'Actif'}</span>
            <dl className="patient-details">
              <dt>Téléphone</dt>
              <dd>{p.phone ? <a href={'tel:' + p.phone}>{p.phone}</a> : 'Non renseigné'}</dd>
              <dt>Email</dt>
              <dd>{p.email ? <a href={'mailto:' + p.email}>{p.email}</a> : 'Non renseigné'}</dd>
              <dt>Adresse</dt>
              <dd>{p.address || 'Non renseignée'}</dd>
            </dl>
            <div className="actions">
              {can('patients.update') && (
                <Link className="btn btn-primary" to={'/patients/' + id + '/edit'}>
                  Modifier
                </Link>
              )}
              {can('patients.archive') && !p.archived && (
                <button className="btn btn-outline-danger" onClick={() => setConfirm(true)}>
                  Archiver
                </button>
              )}
            </div>
          </>
        )}
        {confirm && (
          <ConfirmDialog
            title="Archiver ce patient ?"
            busy={task.busy}
            onCancel={() => setConfirm(false)}
            onConfirm={async () => {
              const result = await task.run(
                () => api.post('/patients/' + id + '/archive', { version: p.version }),
                'Patient archivé.',
              );
              if (result) {
                setConfirm(false);
                resource.reload();
              }
            }}
          >
            La fiche sera conservée et retirée de la liste des patients actifs.
          </ConfirmDialog>
        )}
      </Panel>
    </>
  );
}
