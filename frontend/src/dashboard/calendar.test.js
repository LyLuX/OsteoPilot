import { describe, expect, it } from 'vitest';
import { monthDays, dateKey, todayInParis, moveDays } from './calendar.js';
describe('calendrier français', () => {
  it.each([2023, 2024, 2026, 2100])('42 dates successives et départ lundi en %s', (year) => {
    for (let month = 0; month < 12; month++) {
      const days = monthDays(new Date(year, month, 1));
      expect(days).toHaveLength(42);
      expect(days[0].getDay()).toBe(1);
      expect(new Set(days.map(dateKey)).size).toBe(42);
      expect(days.some((d) => d.getMonth() === month && d.getDate() === 1)).toBe(true);
      days.slice(1).forEach((d, i) => expect(dateKey(d)).toBe(dateKey(moveDays(days[i], 1))));
    }
  });
  it('années bissextiles et changement de date à Paris', () => {
    expect(monthDays(new Date(2024, 1, 1)).some((d) => dateKey(d) === '2024-02-29')).toBe(true);
    expect(
      monthDays(new Date(2100, 1, 1)).some((d) => d.getMonth() === 1 && d.getDate() === 29),
    ).toBe(false);
    expect(dateKey(todayInParis(new Date('2026-10-28T23:30:00Z')))).toBe('2026-10-29');
  });
});
