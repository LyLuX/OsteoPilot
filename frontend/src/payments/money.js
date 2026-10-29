export const paymentMethods = [
  { code: 'cash', label: 'Espèces', short: 'Esp.' },
  { code: 'card', label: 'Carte', short: 'CB' },
  { code: 'cheque', label: 'Chèque', short: 'Chq.' },
  { code: 'transfer', label: 'Virement', short: 'Vir.' },
];
const formatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const decimalFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const formatMoney = (cents) =>
  (cents % 100 === 0 ? formatter : decimalFormatter).format(cents / 100);
export function parseMoney(value) {
  if (!/^(0|[1-9][0-9]{0,5})([.,][0-9]{1,2})?$/.test(value)) return null;
  const [euros, decimals = ''] = value.split(/[.,]/);
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, '0'));
  return cents > 0 && cents <= 99999999 ? cents : null;
}
