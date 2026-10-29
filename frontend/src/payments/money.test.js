import { expect, test } from 'vitest';
import { parseMoney, formatMoney } from './money.js';
test('montants en euros : conversion exacte en centimes, virgule ou point', () => {
  expect(parseMoney('0,01')).toBe(1);
  expect(parseMoney('60,50')).toBe(6050);
  expect(parseMoney('0.29')).toBe(29);
  expect(parseMoney('999999.99')).toBe(99999999);
});
test.each(['', '0', '-1', '1,001', '1e3', 'Infinity', '1000000', '01', ' 10', '10 €'])(
  'montant refusé : %s',
  (value) => expect(parseMoney(value)).toBeNull(),
);
test('format français en euros pour zéro et des centimes', () => {
  expect(formatMoney(0)).toMatch(/^0\s€$/);
  expect(formatMoney(6050)).toMatch(/^60,50\s€$/);
});
