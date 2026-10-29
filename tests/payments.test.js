import { parse } from '../src/core/validation.js';
import { paymentInput, paymentSummaryQuery } from '../src/modules/payments/payment.validator.js';
const input = {
  patientId: '4a9fb270-9222-4e80-bf91-408c00df25a2',
  date: '2026-10-29',
  method: 'cash',
  amountCents: 1,
};
test('paiements : centimes entiers, patient et jour civil strictement validés', () => {
  expect(parse(paymentInput, input)).toEqual(input);
  for (const extra of [
    { amountCents: 1.1 },
    { amountCents: 0 },
    { amountCents: '100' },
    { amountCents: 100000000 },
    { patientId: '' },
    { date: '2026-02-30' },
    { date: '0000-01-01' },
    { method: 'crypto' },
    { diagnosis: 'interdit' },
  ])
    expect(() => parse(paymentInput, { ...input, ...extra })).toThrow();
});
test('synthèse : période bornée et ordonnée, dates sans heures UTC', () => {
  expect(parse(paymentSummaryQuery, { from: '2026-09-28', to: '2026-11-08' })).toEqual({
    from: '2026-09-28',
    to: '2026-11-08',
  });
  for (const query of [
    { from: '2026-11-08', to: '2026-09-28' },
    { from: '2026-01-01', to: '2026-12-31' },
    { from: '2026-01-01T00:00:00Z', to: '2026-01-02' },
  ])
    expect(() => parse(paymentSummaryQuery, query)).toThrow();
});
