import { parse } from '../src/core/validation.js';
import {
  paymentInput,
  paymentDepositCancelQuery,
  paymentDepositCancelInput,
  paymentDepositSelection,
  paymentDepositBatch,
  paymentDeleteInput,
  patientPaymentsQuery,
  paymentSummaryQuery,
  paymentQuery,
  paymentDepositInput,
  publicPayment,
} from '../src/modules/payments/payment.validator.js';
const input = {
  patientId: '4a9fb270-9222-4e80-bf91-408c00df25a2',
  tariffId: '01ce82e1-96e8-489a-914a-ec38097c45cd',
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
  expect(parse(paymentQuery, {})).toEqual({ page: 1, limit: 25 });
  expect(parse(paymentQuery, { page: '2', limit: '5' })).toEqual({ page: 2, limit: 5 });
  for (const query of [
    { limit: 101 },
    { sort: 'amountCents' },
    { from: range.from },
    { to: range.to },
    { date: input.date, ...range },
    { from: range.to, to: range.from },
    { from: '2024-01-01', to: '2025-01-01' },
    { ...range, page: 0 },
  ])
    expect(() => parse(paymentQuery, query)).toThrow();
});

test('dépôt : booléen et version stricts, projection explicite des seuls moyens éligibles', () => {
  expect(parse(paymentDepositInput, { bankDeposited: true, version: 1 })).toEqual({
    bankDeposited: true,
    version: 1,
  });
  for (const values of [
    { bankDeposited: 'true', version: 1 },
    { bankDeposited: true, version: 0 },
    { bankDeposited: true, version: 1.5 },
    { bankDeposited: true, version: 4294967295 },
    { bankDeposited: true, version: 1, amountCents: 50 },
    { version: 1 },
  ])
    expect(() => parse(paymentDepositInput, values)).toThrow();
  for (const method of ['cash', 'cheque'])
    expect(
      publicPayment({ ...input, method, bankDeposited: true, version: 2, createdBy: 'privé' }),
    ).toMatchObject({ bankDeposited: true, version: 2 });
  for (const method of ['card', 'transfer'])
    expect(publicPayment({ ...input, method, bankDeposited: false, version: 1 })).toMatchObject({
      bankDeposited: null,
      version: 1,
    });
  expect(publicPayment(input)).not.toHaveProperty('createdBy');
  expect(() => parse(paymentInput, { ...input, bankDeposited: true })).toThrow();
});

test('suppression : confirmation explicite et version entière, historique patient strictement paginé', () => {
  expect(parse(paymentDeleteInput, { version: 1, confirmed: true })).toEqual({
    version: 1,
    confirmed: true,
  });
  for (const input of [
    { version: 1 },
    { version: 1, confirmed: false },
    { version: '1', confirmed: true },
    { version: 1.5, confirmed: true },
    { version: 1, confirmed: true, force: true },
  ])
    expect(() => parse(paymentDeleteInput, input)).toThrow();
  expect(parse(patientPaymentsQuery, { page: '2', limit: '5' })).toEqual({ page: 2, limit: 5 });
  for (const query of [{ page: 0 }, { limit: 101 }, { patientId: input.patientId }])
    expect(() => parse(patientPaymentsQuery, query)).toThrow();
});

test('numéro de chèque : facultatif, textuel, borné et réservé aux chèques', () => {
  const cheque = { ...input, method: 'cheque', chequeNumber: '0012345' };
  expect(parse(paymentInput, cheque)).toEqual(cheque);
  expect(parse(paymentInput, { ...input, method: 'cheque' })).not.toHaveProperty('chequeNumber');
  for (const chequeNumber of ['', '12a34', '12 34', '-12', '1'.repeat(31), 12345, null]) {
    expect(() => parse(paymentInput, { ...cheque, chequeNumber })).toThrow();
  }
  for (const method of ['cash', 'card', 'transfer']) {
    expect(() => parse(paymentInput, { ...cheque, method })).toThrow();
    expect(publicPayment({ ...cheque, method }).chequeNumber).toBeNull();
  }
  expect(publicPayment(cheque).chequeNumber).toBe('0012345');
  expect(publicPayment({ ...input, method: 'cheque' }).chequeNumber).toBeNull();
});

test('bordereau : type unique, UUID distincts, sélection et versions bornées', () => {
  const id = input.patientId;
  const all = { method: 'cash', all: true, ids: [], excluded: [id] };
  expect(parse(paymentDepositSelection, all)).toEqual(all);
  expect(
    parse(paymentDepositSelection, { method: 'cheque', all: false, ids: [id], excluded: [] }).ids,
  ).toEqual([id]);
  for (const value of [
    { ...all, method: 'card' },
    { ...all, ids: [id] },
    { ...all, all: false },
    { ...all, excluded: [id, id] },
    { ...all, excluded: ['not-uuid'] },
    { ...all, ids: [], excluded: [], amountCents: 100 },
  ])
    expect(() => parse(paymentDepositSelection, value)).toThrow();
  const batch = { method: 'cash', items: [{ id, version: 1 }] };
  expect(parse(paymentDepositBatch, batch)).toEqual(batch);
  for (const value of [
    { ...batch, items: [] },
    { ...batch, method: 'transfer' },
    { ...batch, items: [{ id, version: 0 }] },
    { ...batch, items: [{ id, version: 4294967295 }] },
    { ...batch, items: [batch.items[0], batch.items[0]] },
    { ...batch, items: [{ id, version: 1, amountCents: 100 }] },
    { ...batch, items: Array(5001).fill(batch.items[0]) },
  ])
    expect(() => parse(paymentDepositBatch, value)).toThrow();
});

test('annulation groupée : type strict, confirmation obligatoire et versions distinctes', () => {
  const value = { method: 'cash', items: [{ id: input.patientId, version: 1 }], confirmed: true };
  expect(parse(paymentDepositCancelInput, value)).toEqual(value);
  expect(parse(paymentDepositCancelQuery, { method: 'cheque' })).toEqual({ method: 'cheque' });
  for (const query of [{}, { method: 'card' }, { method: 'cash', page: 1 }])
    expect(() => parse(paymentDepositCancelQuery, query)).toThrow();
  for (const extra of [
    { confirmed: false },
    { confirmed: undefined },
    { items: [] },
    { method: 'transfer' },
    { items: [value.items[0], value.items[0]] },
  ])
    expect(() => parse(paymentDepositCancelInput, { ...value, ...extra })).toThrow();
});
