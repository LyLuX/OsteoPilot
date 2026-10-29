import PaginationControls from './PaginationControls.jsx';
import { useEffect, useId, useState } from 'react';
import { apiFieldErrors, FormControl } from './BootstrapForm.jsx';
import { api, errorMessage } from '../api/client.js';
import { useNotifications } from '../notifications/Notifications.jsx';
export function Alert({ children, success = false }) {
  return children ? (
    <div
      role={success ? 'status' : 'alert'}
      className={'alert ' + (success ? 'alert-success' : 'alert-danger')}
    >
      {children}
    </div>
  ) : null;
}
export function Field({ label, name, value, onChange, type = 'text', required = false, ...props }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? ' *' : ''}
      </label>
      <FormControl
        {...props}
        id={id}
        name={name}
        value={value ?? ''}
        onChange={(e) => onChange(name, e.target.value)}
        type={type}
        required={required}
      />
    </div>
  );
}
export function useTask() {
  const notify = useNotifications();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const run = async (work, successMessage, tone = 'success') => {
    setBusy(true);
    setError('');
    setMessage('');
    setFieldErrors({});
    try {
      const value = await work();
      if (successMessage && value !== false) {
        setMessage(successMessage);
        notify({ message: successMessage, tone });
      }
      return value;
    } catch (err) {
      const message = errorMessage(err, { includeFields: false });
      setError(message);
      notify({ message, tone: 'danger' });
      setFieldErrors(apiFieldErrors(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, message, fieldErrors, run, setError, setMessage };
}
export function useResource(path, params = {}, enabled = true) {
  const notify = useNotifications();
  const encoded = JSON.stringify(params);
  const [snapshot, setSnapshot] = useState({ data: null, key: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [fieldErrors, setFieldErrors] = useState({});
  const requestKey = JSON.stringify([path, encoded, revision, enabled]);
  useEffect(() => {
    let active = true;
    if (!enabled) {
      setSnapshot({ data: null, key: requestKey });
      setLoading(false);
      setError('');
      return undefined;
    }
    setLoading(true);
    setError('');
    setFieldErrors({});
    api
      .get(path, JSON.parse(encoded))
      .then((value) => {
        if (active) setSnapshot({ data: value, key: requestKey });
      })
      .catch((err) => {
        if (active) {
          const message = errorMessage(err, { includeFields: false });
          setError(message);
          notify({ message, tone: 'danger' });
          setFieldErrors(apiFieldErrors(err));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, encoded, revision, notify, enabled, requestKey]);
  return {
    data: snapshot.data,
    current: snapshot.key === requestKey,
    error,
    fieldErrors,
    loading,
    reload: () => setRevision((v) => v + 1),
  };
}
export function ResourceState({ resource }) {
  return (
    <>
      {resource.error && !resource.loading && (
        <div className="empty-state">
          <p>Le chargement a échoué.</p>
          <button type="button" className="btn btn-outline-secondary" onClick={resource.reload}>
            Réessayer
          </button>
        </div>
      )}
      {resource.loading && (
        <p role="status" className="muted">
          Chargement…
        </p>
      )}
    </>
  );
}
export function usePagination(initialLimit = 25) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initialLimit);
  return { page, setPage, limit, setLimit };
}
export function Pagination({ data, page, setPage, limit, setLimit, disabled = false, itemLabel }) {
  return (
    <PaginationControls
      pagination={data ? { ...data, page, limit } : undefined}
      limit={limit}
      onPageChange={setPage}
      disabled={disabled}
      itemLabel={itemLabel}
      onLimitChange={(value) => {
        setLimit(value);
        setPage(1);
      }}
    />
  );
}
export function Panel({ children, className = '' }) {
  return <section className={'panel ' + className}>{children}</section>;
}
export function PageTitle({ eyebrow, title, children }) {
  return (
    <header className={'page-heading' + (title ? '' : ' page-heading-inline')}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        {title && <h1>{title}</h1>}
      </div>
      {children}
    </header>
  );
}
export function ConfirmDialog({ title, children, onConfirm, onCancel, busy, tone = 'danger' }) {
  const [node, setNode] = useState(null);
  useEffect(() => {
    if (node && !node.open) node.showModal();
  }, [node]);
  return (
    <dialog ref={setNode} aria-labelledby="confirm-title" onCancel={onCancel}>
      <h2 id="confirm-title">{title}</h2>
      <p>{children}</p>
      <div className="actions">
        <button className="btn btn-outline-secondary" onClick={onCancel} disabled={busy}>
          Annuler
        </button>
        <button className={'btn btn-' + tone} onClick={onConfirm} disabled={busy}>
          Confirmer
        </button>
      </div>
    </dialog>
  );
}
