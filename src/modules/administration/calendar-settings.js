import { z } from '../../core/validation.js';
export const calendarViews = ['week', 'month', 'year'];
export const calendarSettingsInput = z
  .object({ defaultCalendarView: z.enum(calendarViews) })
  .strict();
