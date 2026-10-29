import { z, uuid, text, paging } from '../../core/validation.js';
import { paymentMethodCodes } from '../administration/payment-methods.js';
const civilDate = z.iso.date().refine((value) => value >= '1000-01-01' && value <= '9999-12-31');
export const paymentInput = z
  .object({
    patientId: uuid,
    date: civilDate,
    method: z.enum(paymentMethodCodes),
    amountCents: z.number().int().min(1).max(99999999),
  })
  .strict();
export const paymentQuery = z.object({ date: civilDate, ...paging }).strict();
export const paymentSummaryQuery = z
  .object({ from: civilDate, to: civilDate })
  .strict()
  .refine((q) => q.from <= q.to && (Date.parse(q.to) - Date.parse(q.from)) / 86400000 <= 61, {
    path: ['to'],
  });
export const paymentPatientQuery = z.object({ search: text(100).default(''), ...paging }).strict();
export const publicPayment = (row) => ({
  id: row.id,
  patientId: row.patientId,
  date: row.date,
  method: row.method,
  amountCents: row.amountCents,
  createdAt: row.createdAt,
  ...(row.patient
    ? {
        patient: {
          id: row.patient.id,
          firstName: row.patient.firstName,
          lastName: row.patient.lastName,
        },
      }
    : {}),
});
