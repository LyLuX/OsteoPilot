import { useId, useRef } from 'react';
import PaymentDepositBadge from './PaymentDepositBadge.jsx';
import { api } from '../api/client.js';
import { useTask } from '../components/shared.jsx';

export default function PaymentDepositControl({
  payment,
  canUpdate,
  onSaved,
  compact = false,
  disabled = false,
  onBusyChange,
}) {
  const task = useTask();
  const pending = useRef(false);
  const labelId = useId();
  if (!['cash', 'cheque'].includes(payment.method)) return null;
  const deposited = payment.bankDeposited === true;
  const change = async () => {
    if (pending.current || disabled || !deposited || !canUpdate) return;
    pending.current = true;
    onBusyChange?.(true);
    try {
      await task.run(
        async () => {
          try {
            await api.patch('/payments/' + payment.id + '/bank-deposit', {
              bankDeposited: false,
              version: payment.version,
            });
          } catch (error) {
            if (error.response?.status === 409) onSaved();
            throw error;
          }
          onSaved();
        },
        'Dépôt en banque annulé.',
        'warning',
      );
    } finally {
      pending.current = false;
      onBusyChange?.(false);
    }
  };
  return (
    <span
      className={
        'payment-deposit-control' + (deposited ? ' payment-deposit-control--deposited' : '')
      }
    >
      {!compact && <PaymentDepositBadge payment={payment} id={labelId} />}
      {deposited && canUpdate && (
        <button
          type="button"
          className={
            'btn btn-sm payment-deposit-button ' +
            (compact ? 'payment-deposit-cancel-button ' : '') +
            'btn-outline-warning'
          }
          aria-describedby={compact ? undefined : labelId}
          aria-label={task.busy ? 'Mise à jour du dépôt' : 'Annuler le dépôt'}
          aria-busy={task.busy}
          title="Annuler le dépôt en banque"
          disabled={task.busy || disabled}
          onClick={change}
        >
          {compact ? (
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
              <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />
            </svg>
          ) : task.busy ? (
            '…'
          ) : (
            'Annuler'
          )}
        </button>
      )}
    </span>
  );
}
