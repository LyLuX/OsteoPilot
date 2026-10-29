import { useId, useRef } from 'react';
import { api } from '../api/client.js';
import { useTask } from '../components/shared.jsx';

export default function PaymentDepositControl({ payment, canUpdate, onSaved }) {
  const task = useTask();
  const pending = useRef(false);
  const labelId = useId();
  if (!['cash', 'cheque'].includes(payment.method)) return null;
  const deposited = payment.bankDeposited === true;
  const change = async () => {
    if (pending.current) return;
    pending.current = true;
    try {
      await task.run(
        async () => {
          try {
            await api.patch('/payments/' + payment.id + '/bank-deposit', {
              bankDeposited: !deposited,
              version: payment.version,
            });
          } catch (error) {
            if (error.response?.status === 409) onSaved();
            throw error;
          }
          onSaved();
        },
        deposited ? 'Dépôt en banque annulé.' : 'Paiement marqué comme déposé en banque.',
        'warning',
      );
    } finally {
      pending.current = false;
    }
  };
  return (
    <div className="payment-deposit-control">
      <span
        id={labelId}
        className={
          'badge payment-deposit-status ' +
          (deposited ? 'payment-deposit-status--deposited' : 'payment-deposit-status--pending')
        }
      >
        {deposited ? 'Déposé en banque' : 'À déposer'}
      </span>
      {canUpdate && (
        <button
          type="button"
          className="btn btn-warning btn-sm"
          aria-describedby={labelId}
          disabled={task.busy}
          onClick={change}
        >
          {task.busy ? 'Mise à jour…' : deposited ? 'Annuler le dépôt' : 'Marquer comme déposé'}
        </button>
      )}
    </div>
  );
}
