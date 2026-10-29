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
const blank = { firstName: '', lastName: '', email: '', password: '', active: true, roleIds: [] };
function UserEditor({ selected, roles, onSaved, onCancel }) {
  const task = useTask();
  const [values, setValues] = useState(selected ? { ...blank, ...selected, password: '' } : blank);
  const change = (key, value) => setValues({ ...values, [key]: value });
  return (
    <Panel>
      <h2>{selected ? 'Modifier le compte' : 'Créer un utilisateur'}</h2>
      <Alert>{task.error}</Alert>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const payload = Object.fromEntries(
            Object.keys(blank)
              .filter((k) => k !== 'password' || values.password)
              .map((k) => [k, values[k]]),
          );
          const result = await task.run(() =>
            selected ? api.patch('/users/' + selected.id, payload) : api.post('/users', payload),
          );
          if (result) onSaved();
        }}
      >
        <div className="form-grid">
          <Field
            label="Prénom"
            name="firstName"
            value={values.firstName}
            onChange={change}
            maxLength={100}
            required
          />
          <Field
            label="Nom"
            name="lastName"
            value={values.lastName}
            onChange={change}
            maxLength={100}
            required
          />
          <Field
            label="Email"
            name="email"
            type="email"
            value={values.email}
            onChange={change}
            maxLength={254}
            required
          />
          <Field
            label={selected ? 'Nouveau mot de passe (facultatif)' : 'Mot de passe initial'}
            name="password"
            type="password"
            value={values.password}
            onChange={change}
            minLength={14}
            maxLength={72}
            required={!selected}
            autoComplete="new-password"
          />
        </div>
        <p className="muted">
          14 caractères minimum, 72 octets maximum. Transmettez le mot de passe initial par un canal
          sécurisé.
        </p>
        <fieldset>
          <legend>Rôles</legend>
          {roles
            .filter((r) => !r.system)
            .map((r) => (
              <label className="check-label" key={r.id}>
                <input
                  type="checkbox"
                  checked={values.roleIds.includes(r.id)}
                  onChange={(e) =>
                    change(
                      'roleIds',
                      e.target.checked
                        ? [...values.roleIds, r.id]
                        : values.roleIds.filter((id) => id !== r.id),
                    )
                  }
                />
                {r.name}
              </label>
            ))}
        </fieldset>
        <label className="check-label">
          <input
            type="checkbox"
            checked={values.active}
            onChange={(e) => change('active', e.target.checked)}
          />
          Compte actif
        </label>
        <p className="muted">
          Une modification révoque les sessions existantes de cet utilisateur.
        </p>
        <div className="actions">
          <button className="btn btn-primary" disabled={task.busy || !values.roleIds.length}>
            Enregistrer
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </form>
    </Panel>
  );
}
export default function UsersPage() {
  const { can, user } = useAuth();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(undefined);
  const resource = useResource('/users', { page });
  const roles = useResource('/roles', { limit: 100 });
  return (
    <>
      <PageTitle eyebrow="Administration" title="Utilisateurs">
        {can('users.create') && can('roles.read') && (
          <button className="btn btn-primary" onClick={() => setEditing(null)}>
            + Créer un utilisateur
          </button>
        )}
      </PageTitle>
      <ResourceState resource={roles} />
      {editing !== undefined && (
        <UserEditor
          key={editing?.id || 'new'}
          selected={editing}
          roles={roles.data?.items || []}
          onCancel={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            resource.reload();
          }}
        />
      )}
      <Panel>
        <ResourceState resource={resource} />
        <div className="record-list">
          {resource.data?.items.map((u) => (
            <article key={u.id}>
              <div>
                <h2>
                  {u.firstName} {u.lastName}
                </h2>
                <p>{u.email}</p>
                <p className="muted">
                  {u.roles.join(', ')} · {u.active ? 'Actif' : 'Désactivé'}
                </p>
              </div>
              {can('users.update') &&
                can('roles.read') &&
                u.id !== user.id &&
                !u.roles.includes('ADMIN') && (
                  <button className="btn btn-outline-secondary" onClick={() => setEditing(u)}>
                    Modifier
                  </button>
                )}
            </article>
          ))}
        </div>
        {!resource.loading && !resource.data?.items.length && <p>Aucun utilisateur.</p>}
        <Pagination data={resource.data?.pagination} page={page} setPage={setPage} />
      </Panel>
    </>
  );
}
