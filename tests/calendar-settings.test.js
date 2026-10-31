import { parse } from '../src/core/validation.js';
import { calendarSettingsInput } from '../src/modules/administration/calendar-settings.js';
test('vue initiale : choix fini obligatoire et mutation indépendante stricte', () => {
  for (const defaultCalendarView of ['week', 'month', 'year'])
    expect(parse(calendarSettingsInput, { defaultCalendarView })).toEqual({ defaultCalendarView });
  for (const input of [
    {},
    { defaultCalendarView: 'day' },
    { defaultCalendarView: 'MONTH' },
    { defaultCalendarView: null },
    { defaultCalendarView: 'year', name: 'interdit' },
    { defaultCalendarView: 'week', paymentMethods: [] },
  ])
    expect(() => parse(calendarSettingsInput, input)).toThrow();
});
