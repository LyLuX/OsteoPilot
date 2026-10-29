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
