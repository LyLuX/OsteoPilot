import { parse } from '../src/core/validation.js';
import { tariffInput, tariffUpdateInput } from '../src/modules/administration/tariffs.js';
test('tarifs : libellé normalisé, centimes positifs et limites strictes', () => {
  expect(parse(tariffInput, { label: '  Consultation adulte  ', amountCents: 5500 })).toEqual({
    label: 'Consultation adulte',
    amountCents: 5500,
  });
  for (const value of [
    { label: '', amountCents: 5500 },
    { label: 'a'.repeat(101), amountCents: 5500 },
    { label: 'Test', amountCents: 0 },
    { label: 'Test', amountCents: 1.5 },
    { label: 'Test', amountCents: '5500' },
    { label: 'Test', amountCents: 100000000 },
    { label: 'Test', amountCents: 5500, force: true },
  ])
    expect(() => parse(tariffInput, value)).toThrow();
  expect(() =>
    parse(tariffUpdateInput, { label: 'Test', amountCents: 5500, version: 0 }),
  ).toThrow();
  expect(() => parse(tariffUpdateInput, { label: 'Test', amountCents: 5500 })).toThrow();
});
