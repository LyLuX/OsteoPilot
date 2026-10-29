import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  Alert,
  Panel,
  PageTitle,
  ResourceState,
  useResource,
  useTask,
} from '../components/shared.jsx';
function PermissionEditor({ role, permissions, reload }) {
  const { can, user } = useAuth();
  const [ids, setIds] = useState(role.permissionIds);
  const task = useTask();
  const protectedRole = role.system || user.roleIds.includes(role.id) || !can('permissions.update');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await task.run(
          () => api.put('/roles/' + role.id + '/permissions', { permissionIds: ids }),
          'Permissions enregistrées.',
        );
        if (result) reload();
      }}
    >
      <h2>{role.name}</h2>
      <Alert>{task.error}</Alert>
      <Alert success>{task.message}</Alert>
      {protectedRole && (
        <p className="muted">
          Consultation seule : rôle protégé ou permission de modification absente.
        </p>
      )}
      <fieldset disabled={protectedRole || task.busy}>
        <legend className="visually-hidden">Permissions de {role.name}</legend>
        <div className="permissions-grid">
          {permissions.map((p) => (
            <label className="check-label" key={p.id}>
              <input
                type="checkbox"
                disabled={!can(p.name)}
                checked={ids.includes(p.id)}
                onChange={(e) =>
                  setIds(e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id))
                }
              />
              {p.name}
            </label>
          ))}
        </div>
      </fieldset>
      {!protectedRole && (
        <button className="btn btn-primary" disabled={task.busy}>
          Enregistrer les permissions
        </button>
      )}
    </form>
  );
}
export default function PermissionsPage() {
  const { can } = useAuth();
  const permissions = useResource('/permissions', { limit: 100 });
  const roles = useResource('/roles', { limit: 100 });
  const [roleId, setRoleId] = useState('');
  const role = roles.data?.items.find((r) => r.id === roleId);
  return (
    <>
      <PageTitle eyebrow="Administration" title="Permissions" />
      <Panel>
        <ResourceState resource={permissions} />
        {!can('roles.read') ? (
          <>
            <p>La permission roles.read est nécessaire pour affecter les droits à un rôle.</p>
            <ul>
              {permissions.data?.items.map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <ResourceState resource={roles} />
            <label className="field">
              <span>Rôle à consulter</span>
              <select
                className="form-select"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
              >
                <option value="">Choisir un rôle</option>
                {roles.data?.items.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            {role && (
              <PermissionEditor
                key={role.id + role.permissionIds.join('')}
                role={role}
                permissions={permissions.data?.items || []}
                reload={roles.reload}
              />
            )}
          </>
        )}
      </Panel>
    </>
  );
}
