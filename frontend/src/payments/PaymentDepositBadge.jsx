export default function PaymentDepositBadge({ payment, id }) {
  const onAccount = payment.method === 'transfer';
  if (!onAccount && !['cash', 'cheque'].includes(payment.method)) return null;
  const deposited = onAccount || payment.bankDeposited === true;
  return (
    <span
      id={id}
      className={
        'badge payment-deposit-status' + (deposited ? ' payment-deposit-status--deposited' : '')
      }
    >
      {onAccount ? 'Sur le compte' : deposited ? 'Déposé' : 'À déposer'}
    </span>
  );
}
