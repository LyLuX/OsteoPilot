import { paymentMethods } from './money.js';
const shapes = {
  cash: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M5 9h1m12 6h1" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path d="M2 9h20M6 15h3m3 0h2" />
    </>
  ),
  cheque: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M5 9h5m-5 6h5m3 1 1-4 5-5 2 2-5 5-3 1Z" />
    </>
  ),
  transfer: <path d="M3 7h15l-3-3m3 3-3 3M21 17H6l3-3m-3 3 3 3" />,
};
/** Labels remain available without relying on colour or a hover tooltip. */
export default function PaymentMethodIcon({ method }) {
  const definition = paymentMethods.find((item) => item.code === method);
  if (!definition) return null;
  return (
    <span className={'payment-method payment-method--' + method} title={definition.label}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {shapes[method]}
      </svg>
      <span className="visually-hidden">{definition.label}</span>
    </span>
  );
}
