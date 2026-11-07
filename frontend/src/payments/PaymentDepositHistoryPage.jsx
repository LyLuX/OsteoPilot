import { useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  PageTitle,
  ConfirmDialog,
  Panel,
  ResourceState,
  useResource,
  usePagination,
  Pagination,
  useTask,
} from '../components/shared.jsx';
import { api } from '../api/client.js';
import { formatMoney, paymentMethods } from './money.js';
import PaymentMethodIcon from './PaymentMethodIcon.jsx';
export default function PaymentDepositHistoryPage({ onBack, onPrint }) {
  const { can } = useAuth();
  const { page, setPage, limit, setLimit } = usePagination(5);
  const resource = useResource(
    '/payments/deposits/history',
    { page, limit },
    can('payments.read') && can('payments.deposits.read'),
  );
  const task = useTask();
  const [opening, setOpening] = useState(null);
  const [deleteRequest, setDeleteRequest] = useState(null);
  const deleting = useRef(false);
  const hasActions = can('payments.deposits.reprint') || can('payments.deposits.delete');
  const ready = resource.current && !resource.loading && !resource.error && resource.data;
  return (
    <>
      <PageTitle eyebrow="Gestion paiements" title="Historique des dépôts" />
      <button
        type="button"
        className="btn btn-outline-secondary mb-3"
        disabled={task.busy}
        onClick={onBack}
      >
        Retour aux paiements
      </button>
      <Panel>
        <ResourceState resource={resource} />
        {ready &&
          (resource.data.items.length ? (
            <table className="data-table deposit-history-table">
              <caption className="visually-hidden">Bordereaux de dépôt archivés</caption>
              <thead>
                <tr>
                  <th scope="col">Date du dépôt</th>
                  <th scope="col">Type de paiement</th>
                  <th scope="col">Paiements</th>
                  <th scope="col">Montant total</th>
                  <th scope="col">Statut</th>
                  {hasActions && (
                    <th scope="col" className="deposit-history-actions-column">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {resource.data.items.map((slip) => (
                  <tr key={slip.id}>
                    <td data-label="Date du dépôt">
                      {new Intl.DateTimeFormat('fr-FR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'Europe/Paris',
                      }).format(new Date(slip.createdAt))}
                    </td>
                    <td data-label="Type de paiement">
                      <span className="payment-method-label">
                        <PaymentMethodIcon method={slip.method} />
                        <span>
                          {paymentMethods.find((method) => method.code === slip.method)?.label}
                        </span>
                      </span>
                    </td>
                    <td data-label="Paiements">{slip.paymentCount}</td>
                    <td data-label="Montant total">{formatMoney(slip.totalCents)}</td>
                    <td data-label="Statut">
                      <span
                        className={
                          'status-badge' + (slip.reconstructed ? ' deposit-slip-reconstructed' : '')
                        }
                      >
                        {slip.reconstructed ? 'Reconstitué' : 'Original'}
                      </span>
                    </td>
                    {hasActions && (
                      <td data-label="Actions">
                        <div className="deposit-slip-actions">
                          {can('payments.deposits.reprint') && (
                            <button
                              type="button"
                              className="btn btn-outline-info deposit-slip-print-button"
                              title="Réimprimer le bordereau"
                              aria-busy={opening === slip.id}
                              disabled={task.busy}
                              aria-label={
                                'Réimprimer le bordereau du ' +
                                new Intl.DateTimeFormat('fr-FR', {
                                  dateStyle: 'short',
                                  timeZone: 'Europe/Paris',
                                }).format(new Date(slip.createdAt))
                              }
                              onClick={async () => {
                                if (opening) return;
                                setOpening(slip.id);
                                try {
                                  const result = await task.run(() =>
                                    api.get('/payments/deposits/history/' + slip.id),
                                  );
                                  if (result) onPrint(result);
                                } finally {
                                  setOpening(null);
                                }
                              }}
                            >
                              {opening === slip.id ? (
                                <span
                                  className="spinner-border spinner-border-sm"
                                  aria-hidden="true"
                                />
                              ) : (
                                <svg
                                  width="20"
                                  height="20"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                  focusable="false"
                                >
                                  <path d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
                                  <path d="M6 14h12v7H6zM18 12h.01" />
                                </svg>
                              )}
                            </button>
                          )}
                          {slip.reconstructed && can('payments.deposits.delete') && (
                            <button
                              type="button"
                              className="btn btn-outline-danger deposit-slip-delete-button"
                              disabled={task.busy}
                              title="Supprimer ce bordereau reconstitué"
                              aria-label="Supprimer ce bordereau reconstitué"
                              onClick={() => setDeleteRequest(slip)}
                            >
                              <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                                focusable="false"
                              >
                                <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty-state">Aucun bordereau enregistré.</p>
          ))}
        <Pagination
          data={resource.data?.pagination}
          page={page}
          setPage={setPage}
          limit={limit}
          setLimit={setLimit}
          disabled={!ready || task.busy}
          itemLabel="dépôt(s)"
        />
      </Panel>
      {deleteRequest && (
        <ConfirmDialog
          title="Supprimer ce bordereau reconstitué ?"
          busy={task.busy}
          onCancel={(event) => {
            if (deleting.current) event?.preventDefault();
            else setDeleteRequest(null);
          }}
          onConfirm={async () => {
            if (deleting.current) return;
            deleting.current = true;
            try {
              const result = await task.run(
                async () => {
                  try {
                    return await api.delete('/payments/deposits/history/' + deleteRequest.id, {
                      confirmed: true,
                    });
                  } catch (error) {
                    if ([404, 409].includes(error.response?.status)) {
                      setDeleteRequest(null);
                      resource.reload();
                    }
                    throw error;
                  }
                },
                'Bordereau supprimé.',
                'danger',
              );
              if (result) {
                setDeleteRequest(null);
                setPage(1);
                resource.reload();
              }
            } finally {
              deleting.current = false;
            }
          }}
        >
          Le bordereau reconstitué du{' '}
          {new Intl.DateTimeFormat('fr-FR', {
            dateStyle: 'short',
            timeZone: 'Europe/Paris',
          }).format(new Date(deleteRequest.createdAt))}{' '}
          sera supprimé définitivement. Les paiements et leurs statuts de dépôt seront conservés.
        </ConfirmDialog>
      )}
      <p className="muted">
        Les bordereaux restent consultables après l’annulation d’un dépôt. Les anciens bordereaux
        reconstitués utilisent les informations disponibles lors de leur récupération.
      </p>
    </>
  );
}
