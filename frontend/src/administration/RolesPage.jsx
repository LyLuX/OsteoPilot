import BootstrapForm from '../components/BootstrapForm.jsx';
import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  Alert,
  Field,
  Panel,
  PageTitle,
  Pagination,
  ResourceState,
  useResource,
  useTask,
} from '../components/shared.jsx';
export default function RolesPage() {
  const { can, user } = useAuth();
  const [page, setPage] = useState(1);
  const resource = useResource('/roles', { page });
  const [editing, setEditing] = useState(undefined);
  const [name, setName] = useState('');
  const task = useTask();
  return (
    <>
      <PageTitle eyebrow="Administration" title="Rôles">
        {can('roles.create') && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setName('');
              setEditing(null);
            }}
          >
            + Créer un rôle
          </button>
        )}
      </PageTitle>
      <Alert>{task.error}</Alert>
      <Alert success>{task.message}</Alert>
      {editing !== undefined && (
        <Panel>
          <BootstrapForm
            errors={task.fieldErrors}
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await task.run(
                () =>
                  editing
                    ? api.patch('/roles/' + editing.id, { name })
                    : api.post('/roles', { name }),
                'Rôle enregistré.',
              );
              if (result) {
                setEditing(undefined);
                resource.reload();
              }
            }}
          >
            <Field
              label="Nom du rôle"
              name="name"
              value={name}
              onChange={(_, v) => setName(v)}
              minLength={2}
              maxLength={80}
              required
            />
            <div className="actions">
              <button className="btn btn-primary" disabled={task.busy}>
                Enregistrer
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setEditing(undefined)}
              >
                Annuler
              </button>
            </div>
          </BootstrapForm>
        </Panel>
      )}
      <Panel>
        <ResourceState resource={resource} />
        <div className="record-list">
          {resource.data?.items.map((r) => (
            <article key={r.id}>
              <div>
                <h2>{r.name}</h2>
                <p className="muted">
                  {r.system ? 'Rôle système protégé' : r.permissionIds.length + ' permission(s)'}
                </p>
              </div>
              {can('roles.update') && !r.system && !user.roleIds.includes(r.id) && (
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    setName(r.name);
                    setEditing(r);
                  }}
                >
                  Renommer
                </button>
              )}
            </article>
          ))}
        </div>
        <Pagination data={resource.data?.pagination} page={page} setPage={setPage} />
      </Panel>
    </>
  );
}
