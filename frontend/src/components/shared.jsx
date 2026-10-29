import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
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
  return (
    <label className="field">
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        className="form-control"
        name={name}
        value={value ?? ''}
        onChange={(e) => onChange(name, e.target.value)}
        type={type}
        required={required}
        {...props}
      />
    </label>
  );
}
export function useTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const run = async (work, successMessage) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const value = await work();
      if (successMessage) setMessage(successMessage);
      return value;
    } catch (err) {
      setError(errorMessage(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, message, run, setError, setMessage };
}
export function useResource(path, params = {}) {
  const encoded = JSON.stringify(params);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api
      .get(path, JSON.parse(encoded))
      .then((value) => {
        if (active) setData(value);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, encoded, revision]);
  return { data, error, loading, reload: () => setRevision((v) => v + 1) };
}
export function ResourceState({ resource }) {
  return (
    <>
      <Alert>{resource.error}</Alert>
      {resource.loading && (
        <p role="status" className="muted">
          Chargement…
        </p>
      )}
    </>
  );
}
export function Pagination({ data, page, setPage }) {
  if (!data) return null;
  return (
    <nav className="pagination-bar" aria-label="Pagination">
      <button
        className="btn btn-outline-secondary"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        Précédent
      </button>
      <span>
        Page {page} sur {data.totalPages} · {data.total} résultat{data.total > 1 ? 's' : ''}
      </span>
      <button
        className="btn btn-outline-secondary"
        disabled={page >= data.totalPages}
        onClick={() => setPage(page + 1)}
      >
        Suivant
      </button>
    </nav>
  );
}
export function Panel({ children, className = '' }) {
  return <section className={'panel ' + className}>{children}</section>;
}
export function PageTitle({ eyebrow, title, children }) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children}
    </header>
  );
}
export function ConfirmDialog({ title, children, onConfirm, onCancel, busy }) {
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
        <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>
          Confirmer
        </button>
      </div>
    </dialog>
  );
}
