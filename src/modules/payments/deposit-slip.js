/** Minimal immutable document; independent of subsequent payment/patient changes. */
export function slipItems(rows, method) {
  return [...rows]
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        new Date(b.createdAt) - new Date(a.createdAt) ||
        a.id.localeCompare(b.id),
    )
    .map((row) => slipItem(row, method));
}
const slipItem = (row, method) => ({
  id: row.id,
  version: row.version,
  date: row.date,
  amountCents: row.amountCents,
  chequeNumber: method === 'cheque' ? (row.chequeNumber ?? null) : null,
  patient: { firstName: row.patient.firstName, lastName: row.patient.lastName },
});
export const slipSummary = (row) => ({
  id: row.id,
  method: row.method,
  cabinetName: row.cabinetName,
  createdAt: new Date(row.createdAt).toISOString(),
  paymentCount: row.paymentCount,
  totalCents: Number(row.totalCents),
  reconstructed: Boolean(row.reconstructed),
});
export const publicSlip = (row) => ({
  ...slipSummary(row),
  items: row.items.map((item) => slipItem(item, row.method)),
});
