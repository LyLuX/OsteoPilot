import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { api } from '../api/client.js';
import { createRequestId } from '../api/request-id.js';
import { PageTitle, useTask } from '../components/shared.jsx';
import { formatMoney, paymentMethods } from './money.js';
import metadata from '../../package.json';
import '../styles/payment-print.css';

function DepositSheet({ data }) {
  const columns = data.method === 'cheque' ? 4 : 3;
  return (
    <article className="deposit-print-sheet">
      <table className="deposit-print-table">
        <caption className="visually-hidden">Paiements du bordereau</caption>
        <thead>
          <tr>
            <td colSpan={columns} className="deposit-print-masthead-cell">
              <header className="deposit-print-header">
                <img src="/osteopilot-mark.png?v=1" alt="" width="50" height="50" />
                <span>{data.cabinetName}</span>
              </header>
              <div className="deposit-print-heading">
                <p>Bordereau de dépôt</p>
                <h2>{paymentMethods.find((method) => method.code === data.method)?.label}</h2>
                {data.createdAt && (
                  <p>
                    Dépôt du{' '}
                    {new Intl.DateTimeFormat('fr-FR', {
                      dateStyle: 'short',
                      timeZone: 'Europe/Paris',
                    }).format(new Date(data.createdAt))}
                  </p>
                )}
                {data.reconstructed && (
                  <p>Bordereau reconstitué à partir des informations disponibles.</p>
                )}
              </div>
            </td>
          </tr>
          <tr>
            <th scope="col">Nom</th>
            <th scope="col">Date</th>
            {data.method === 'cheque' && <th scope="col">Numéro de chèque</th>}
            <th scope="col">Montant</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((payment) => (
            <tr key={payment.id}>
              <td>
                {payment.patient.lastName} {payment.patient.firstName}
              </td>
              <td>{payment.date.split('-').reverse().join('/')}</td>
              {data.method === 'cheque' && <td>{payment.chequeNumber || '—'}</td>}
              <td>{formatMoney(payment.amountCents)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={columns} className="deposit-print-summary-cell">
              <div className="deposit-print-summary">
                <div className="deposit-print-count">
                  Nombre de paiements <strong>{data.items.length}</strong>
                </div>
                <div className="deposit-print-total">
                  Montant total <strong>{formatMoney(data.totalCents)}</strong>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={columns} className="deposit-print-footer-cell">
              <footer className="deposit-print-footer">
                {data.cabinetName} · v{metadata.version}
              </footer>
            </td>
          </tr>
        </tfoot>
      </table>
    </article>
  );
}

export default function PaymentDepositPrintPage({
  data,
  onBack,
  readOnly = false,
  backLabel = 'Retour aux paiements',
}) {
  const task = useTask();
  const [committed, setCommitted] = useState(readOnly);
  const [savedData, setSavedData] = useState(data);
  const [conflict, setConflict] = useState(false);
  const pending = useRef(false);
  const key = useRef(null);
  if (!key.current) key.current = createRequestId();
  useEffect(() => {
    const previous = document.title;
    document.title = 'Bordereau de dépôt - ' + savedData.cabinetName;
    return () => {
      document.title = previous;
    };
  }, [savedData.cabinetName]);
  const print = async () => {
    if (pending.current || conflict) return;
    pending.current = true;
    try {
      if (!committed) {
        const result = await task.run(
          async () => {
            try {
              return await api.post(
                '/payments/deposits',
                {
                  method: data.method,
                  items: data.items.map(({ id, version }) => ({ id, version })),
                },
                { headers: { 'Idempotency-Key': key.current } },
              );
            } catch (error) {
              if (error.response?.status === 409) setConflict(true);
              throw error;
            }
          },
          'Paiements marqués comme déposés.',
          'success',
        );
        if (!result) return;
        flushSync(() => {
          if (result.slip) setSavedData(result.slip);
          setCommitted(true);
        });
      }
      await task.run(async () => {
        try {
          window.print();
        } catch {
          throw {
            response: {
              data: {
                error: {
                  message:
                    'Le dépôt est enregistré. L’impression n’a pas pu être ouverte. Vous pouvez réimprimer le bordereau.',
                },
              },
            },
          };
        }
      });
    } finally {
      pending.current = false;
    }
  };
  return (
    <>
      <PageTitle eyebrow="Gestion paiements" title="Impression du dépôt" />
      <div className="deposit-print-toolbar">
        <button
          type="button"
          className="btn btn-outline-secondary"
          disabled={task.busy}
          onClick={onBack}
        >
          {backLabel}
        </button>
        <button
          type="button"
          className={'btn btn-outline-' + (committed ? 'info' : 'success')}
          disabled={task.busy || conflict}
          onClick={print}
        >
          {committed ? 'Réimprimer' : 'Imprimer'}
        </button>
      </div>
      {!committed && (
        <p className="muted">
          Le bouton Imprimer valide le dépôt avant d’ouvrir la boîte d’impression.
        </p>
      )}
      {conflict && (
        <p role="status">
          La sélection a changé. Revenez aux paiements pour préparer un nouveau bordereau.
        </p>
      )}
      <div className="deposit-print-preview">
        <DepositSheet data={savedData} />
      </div>
      {createPortal(
        <div className="deposit-printable" aria-hidden="true">
          {committed ? (
            <DepositSheet data={savedData} />
          ) : (
            <p>Utilisez le bouton Imprimer du bordereau pour valider le dépôt.</p>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
