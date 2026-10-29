import { describe, expect, it } from 'vitest';
import {
  monthDays,
  dateKey,
  todayInParis,
  moveDays,
  weekDays,
  isoWeek,
  calendarPeriod,
  aggregatePayments,
} from './calendar.js';
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

it('semaines ISO : année précédente, semaine 53 et changements d’heure', () => {
  expect(isoWeek(new Date(2021, 0, 1))).toEqual({ year: 2020, number: 53 });
  expect(isoWeek(new Date(2024, 11, 30))).toEqual({ year: 2025, number: 1 });
  expect(weekDays(new Date(2026, 9, 29)).map(dateKey)).toEqual([
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
  ]);
  const year = calendarPeriod('year', new Date(2024, 1, 29));
  expect(year.cells).toHaveLength(12);
  expect(dateKey(year.from)).toBe('2024-01-01');
  expect(dateKey(year.to)).toBe('2024-12-31');
});
it('cumuls en centimes sur bornes inclusives, y compris les anciens moyens', () => {
  const days = [
    { date: '2024-02-29', methods: { cash: 101, card: 202 }, totalCents: 303 },
    { date: '2024-03-01', methods: { cash: 999 }, totalCents: 999 },
  ];
  expect(aggregatePayments(days, new Date(2024, 1, 1), new Date(2024, 1, 29))).toEqual({
    methods: { cash: 101, card: 202, cheque: 0, transfer: 0 },
    totalCents: 303,
  });
});
