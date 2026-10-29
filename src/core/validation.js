import { z } from 'zod';
import { AppError } from './errors.js';
export { z };
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(
      'Les données transmises sont invalides.',
      422,
      result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: 'Valeur absente, inconnue ou invalide.',
      })),
    );
  return result.data;
}
export const uuid = z.uuid();
export const text = (length) =>
  z
    .string()
    .trim()
    .max(length)
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s));
export const name = text(100).min(1);
export const email = z
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
export const optionalEmail = z.union([email, z.literal('')]).default('');
export const password = z
  .string()
  .min(14)
  .max(72)
  .refine((s) => Buffer.byteLength(s) <= 72);
export const paging = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
};
export function pageResult(result, query, map = (x) => x) {
  return {
    items: result.rows.map(map),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.count,
      totalPages: Math.max(1, Math.ceil(result.count / query.limit)),
    },
  };
}
