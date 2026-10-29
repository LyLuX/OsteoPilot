import { parse } from '../src/core/validation.js';
import {
  paymentInput,
  paymentSummaryQuery,
  paymentQuery,
} from '../src/modules/payments/payment.validator.js';
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
    { from: '2026-01-01', to: '2027-01-02' },
    { from: '2026-01-01T00:00:00Z', to: '2026-01-02' },
  ])
    expect(() => parse(paymentSummaryQuery, query)).toThrow();
});

test('liste et synthèse : année bissextile et filtres exclusifs validés', () => {
  const range = { from: '2024-01-01', to: '2024-12-31' };
  expect(parse(paymentSummaryQuery, range)).toEqual(range);
  expect(parse(paymentQuery, range)).toMatchObject({ ...range, page: 1, limit: 25 });
  expect(parse(paymentQuery, { date: input.date })).toMatchObject({ date: input.date });
  for (const query of [
    {},
    { from: range.from },
    { to: range.to },
    { date: input.date, ...range },
    { from: range.to, to: range.from },
    { from: '2024-01-01', to: '2025-01-01' },
    { ...range, page: 0 },
  ])
    expect(() => parse(paymentQuery, query)).toThrow();
});
