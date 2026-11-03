import { todayInParis } from '../src/core/civil-date.js';
test.each([
  ['2026-11-03T22:59:59Z', '2026-11-03'],
  ['2026-11-03T23:00:00Z', '2026-11-04'],
  ['2026-07-03T21:59:59Z', '2026-07-03'],
  ['2026-07-03T22:00:00Z', '2026-07-04'],
  ['2026-12-31T23:00:00Z', '2027-01-01'],
])('date du cabinet à Paris : %s donne %s', (now, expected) => {
  expect(todayInParis(new Date(now))).toBe(expected);
});
