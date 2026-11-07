import { z, uuid, text, paging } from '../../core/validation.js';
import { paymentMethodCodes } from '../administration/payment-methods.js';
export const depositMethods = ['cash', 'cheque'];
export const paymentDepositInput = z
  .object({ bankDeposited: z.boolean(), version: z.number().int().min(1).max(4294967294) })
  .strict();
export const paymentDeleteInput = z
  .object({ version: z.number().int().min(1).max(4294967295), confirmed: z.literal(true) })
  .strict();
export const depositHistoryQuery = z.object({ ...paging }).strict();
export const patientPaymentsQuery = z.object({ ...paging }).strict();
const civilDate = z.iso.date().refine((value) => value >= '1000-01-01' && value <= '9999-12-31');
export const paymentInput = z
  .object({
    patientId: uuid,
    tariffId: uuid,
    date: civilDate,
    method: z.enum(paymentMethodCodes),
    amountCents: z.number().int().min(1).max(99999999),
    chequeNumber: z
      .string()
      .trim()
      .min(1)
      .max(30)
      .regex(/^[0-9]+$/)
      .optional(),
  })
  .strict()
  .refine((value) => value.chequeNumber === undefined || value.method === 'cheque', {
    path: ['chequeNumber'],
  });
const orderedRange = (q) =>
  q.from <= q.to && (Date.parse(q.to) - Date.parse(q.from)) / 86400000 <= 365;
export const paymentQuery = z
  .object({
    date: civilDate.optional(),
    from: civilDate.optional(),
    to: civilDate.optional(),
    ...paging,
  })
  .strict()
  .refine(
    (q) =>
      q.date ? !q.from && !q.to : (!q.from && !q.to) || Boolean(q.from && q.to && orderedRange(q)),
    {
      path: ['date'],
    },
  );
export const paymentSummaryQuery = z
  .object({ from: civilDate, to: civilDate })
  .strict()
  .refine(orderedRange, {
    path: ['to'],
  });
export const paymentPatientQuery = z.object({ search: text(100).default(''), ...paging }).strict();
export const publicPayment = (row) => ({
  id: row.id,
  patientId: row.patientId,
  date: row.date,
  method: row.method,
  amountCents: row.amountCents,
  chequeNumber: row.method === 'cheque' ? (row.chequeNumber ?? null) : null,
  createdAt: row.createdAt,
  bankDeposited: depositMethods.includes(row.method) ? (row.bankDeposited ?? false) : null,
  version: row.version ?? 1,
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

export const depositBatchLimit = 5000;
const distinctIds = (ids) => new Set(ids).size === ids.length;
export const paymentDepositSelection = z
  .object({
    method: z.enum(depositMethods),
    all: z.boolean(),
    ids: z.array(uuid).max(depositBatchLimit).refine(distinctIds),
    excluded: z.array(uuid).max(depositBatchLimit).refine(distinctIds),
  })
  .strict()
  .refine((value) =>
    value.all ? value.ids.length === 0 : value.ids.length > 0 && value.excluded.length === 0,
  );
export const paymentDepositBatch = z
  .object({
    method: z.enum(depositMethods),
    items: z
      .array(z.object({ id: uuid, version: z.number().int().min(1).max(4294967294) }).strict())
      .min(1)
      .max(depositBatchLimit)
      .refine((items) => distinctIds(items.map((item) => item.id))),
  })
  .strict();

export const paymentDepositCancelQuery = z.object({ method: z.enum(depositMethods) }).strict();
export const paymentDepositCancelInput = paymentDepositBatch.extend({ confirmed: z.literal(true) });
