import { z } from '../../core/validation.js';
export const paymentMethodCodes = ['cash', 'card', 'cheque', 'transfer'];
export const paymentMethodChangeInput = z
  .object({ method: z.enum(paymentMethodCodes), accepted: z.boolean() })
  .strict();
