export const dateKey = (date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
export function todayInParis(now = new Date()) {
  const pieces = Object.fromEntries(
    new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return new Date(Number(pieces.year), Number(pieces.month) - 1, Number(pieces.day));
}
export function monthDays(month) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  start.setDate(1 - ((start.getDay() + 6) % 7));
  return Array.from(
    { length: 42 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
}
export const moveDays = (date, count) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);

export function weekDays(date) {
  const monday = moveDays(date, -((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => moveDays(monday, i));
}
export function isoWeek(date) {
  const thursday = weekDays(date)[3];
  const year = thursday.getFullYear();
  const firstThursday = weekDays(new Date(year, 0, 4))[3];
  const utc = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return { year, number: 1 + Math.round((utc(thursday) - utc(firstThursday)) / 604800000) };
}
export function calendarPeriod(view, date) {
  if (view === 'week') {
    const cells = weekDays(date);
    return { cells, from: cells[0], to: cells[6] };
  }
  if (view === 'year') {
    const year = date.getFullYear();
    return {
      cells: Array.from({ length: 12 }, (_, i) => new Date(year, i, 1)),
      from: new Date(year, 0, 1),
      to: new Date(year, 11, 31),
    };
  }
  const cells = monthDays(date);
  return { cells, from: cells[0], to: cells[41] };
}
export function aggregatePayments(days, from, to) {
  const result = { methods: { cash: 0, card: 0, cheque: 0, transfer: 0 }, totalCents: 0 };
  for (const day of days ?? []) {
    if (day.date < dateKey(from) || day.date > dateKey(to)) continue;
    result.totalCents += day.totalCents;
    for (const method of Object.keys(result.methods))
      result.methods[method] += day.methods[method] ?? 0;
  }
  return result;
}
