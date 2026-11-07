import { useState } from 'react';
import {
  PageTitle,
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
  const { page, setPage, limit, setLimit } = usePagination(5);
  const resource = useResource('/payments/deposits/history', { page, limit });
  const task = useTask();
  const [opening, setOpening] = useState(null);
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
            <table className="data-table">
              <caption className="visually-hidden">Bordereaux de dépôt archivés</caption>
              <thead>
                <tr>
                  <th scope="col">Date du dépôt</th>
                  <th scope="col">Type de paiement</th>
                  <th scope="col">Paiements</th>
                  <th scope="col">Montant total</th>
                  <th scope="col">Bordereau</th>
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
                    <td data-label="Bordereau">
                      {slip.reconstructed && <span className="status-badge mb-2">Reconstitué</span>}
                      <button
                        type="button"
                        className="btn btn-outline-info"
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
                        {opening === slip.id ? 'Ouverture…' : 'Réimprimer'}
                      </button>
                    </td>
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
      <p className="muted">
        Les bordereaux restent consultables après l’annulation d’un dépôt. Les anciens bordereaux
        reconstitués utilisent les informations disponibles lors de leur récupération.
      </p>
    </>
  );
}
