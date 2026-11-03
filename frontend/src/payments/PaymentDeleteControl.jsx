import { useRef, useState } from 'react';
import { api } from '../api/client.js';
import { ConfirmDialog, useTask } from '../components/shared.jsx';
import { formatMoney, paymentMethods } from './money.js';
export default function PaymentDeleteControl({ payment, canDelete, onDeleted }) {
  const [confirm, setConfirm] = useState(false);
  const task = useTask();
  const pending = useRef(false);
  if (!canDelete) return null;
  return (
    <div className="payment-delete-control">
      <button
        type="button"
        className="btn btn-sm btn-outline-danger payment-delete-button"
        title="Supprimer ce paiement"
        onClick={() => setConfirm(true)}
        aria-label={
          'Supprimer le paiement du ' +
          payment.date.split('-').reverse().join('/') +
          ' de ' +
          formatMoney(payment.amountCents)
        }
        disabled={task.busy}
      >
        <svg
          width="18"
          height="18"
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
      {confirm && (
        <ConfirmDialog
          title="Supprimer ce paiement ?"
          busy={task.busy}
          onCancel={(event) => {
            if (pending.current) event?.preventDefault();
            else setConfirm(false);
          }}
          onConfirm={async () => {
            if (pending.current) return;
            pending.current = true;
            try {
              const result = await task.run(
                async () => {
                  try {
                    return await api.delete('/payments/' + payment.id, {
                      version: payment.version,
                      confirmed: true,
                    });
                  } catch (error) {
                    if ([404, 409].includes(error.response?.status)) {
                      setConfirm(false);
                      onDeleted();
                    }
                    throw error;
                  }
                },
                'Paiement supprimé.',
                'danger',
              );
              if (result) {
                setConfirm(false);
                onDeleted();
              }
            } finally {
              pending.current = false;
            }
          }}
        >
          {formatMoney(payment.amountCents)} ·{' '}
          {paymentMethods.find((method) => method.code === payment.method)?.label} ·{' '}
          {payment.date.split('-').reverse().join('/')}
          {payment.patient && (
            <>
              {' '}
              · {payment.patient.lastName} {payment.patient.firstName}
            </>
          )}
          <br />
          Cette suppression est définitive. Le paiement sera retiré des totaux et de la fiche
          patient.
          {payment.bankDeposited && (
            <>
              <br />
              <strong>Ce paiement est déjà marqué comme déposé en banque.</strong>
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
