import { useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import {
  ConfirmDialog,
  Panel,
  PageTitle,
  useResource,
  ResourceState,
  useTask,
} from '../components/shared.jsx';
import DetailTabs from '../components/DetailTabs.jsx';
import PatientPayments from './PatientPayments.jsx';
export default function PatientDetailPage() {
  const { id } = useParams();
  const tabId = useId();
  const [tab, setTab] = useState('information');
  const { can } = useAuth();
  const resource = useResource('/patients/' + id);
  const [confirm, setConfirm] = useState(false);
  const task = useTask();
  const p = resource.current && !resource.loading && !resource.error ? resource.data : null;
  const activeTab = tab === 'payments' && can('payments.read') ? 'payments' : 'information';
  return (
    <>
      <PageTitle eyebrow="Gestion patientèle" title="Fiche patient">
        <Link className="btn btn-outline-secondary" to="/patients">
          ← Patientèle
        </Link>
      </PageTitle>
      <Panel>
        <ResourceState resource={resource} />
        {p && (
          <>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-2">
              <h2 className="mb-0 mw-100 text-break">
                {p.lastName} {p.firstName}
              </h2>
              <div className="actions mt-0 ms-auto justify-content-end">
                {can('patients.update') && (
                  <Link className="btn btn-outline-warning" to={'/patients/' + id + '/edit'}>
                    Modifier
                  </Link>
                )}
                {can('patients.archive') && !p.archived && (
                  <button className="btn btn-outline-danger" onClick={() => setConfirm(true)}>
                    Archiver
                  </button>
                )}
              </div>
            </div>
            <span className="status-badge">{p.archived ? 'Archivé' : 'Actif'}</span>
            <DetailTabs
              id={tabId}
              tabs={[
                { id: 'information', label: 'Informations' },
                ...(can('payments.read') ? [{ id: 'payments', label: 'Paiements' }] : []),
              ]}
              active={activeTab}
              onChange={setTab}
            />
            <div
              role="tabpanel"
              id={tabId + '-panel-information'}
              aria-labelledby={tabId + '-tab-information'}
              hidden={activeTab !== 'information'}
              tabIndex={0}
            >
              <dl className="patient-details">
                <dt>Téléphone</dt>
                <dd>{p.phone ? <a href={'tel:' + p.phone}>{p.phone}</a> : 'Non renseigné'}</dd>
                <dt>Email</dt>
                <dd>{p.email ? <a href={'mailto:' + p.email}>{p.email}</a> : 'Non renseigné'}</dd>
                <dt>Adresse</dt>
                <dd>{p.address || 'Non renseignée'}</dd>
              </dl>
            </div>
            {can('payments.read') && (
              <div
                role="tabpanel"
                id={tabId + '-panel-payments'}
                aria-labelledby={tabId + '-tab-payments'}
                hidden={activeTab !== 'payments'}
                tabIndex={0}
              >
                {activeTab === 'payments' && <PatientPayments key={id} id={id} />}
              </div>
            )}
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
                'danger',
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
