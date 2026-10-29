import { z, text, name, optionalEmail, paging } from '../../core/validation.js';
export const patientInput = z
  .object({
    firstName: name,
    lastName: name,
    phone: text(30)
      .regex(/^[+()\d .-]*$/)
      .default(''),
    email: optionalEmail,
    address: text(300).default(''),
  })
  .strict();
export const patientUpdate = patientInput.extend({ version: z.number().int().positive() });
export const patientQuery = z
  .object({
    ...paging,
    search: text(100).default(''),
    archived: z.enum(['false', 'true', 'all']).default('false'),
    sort: z.enum(['lastName', 'firstName', 'createdAt']).default('lastName'),
    direction: z.enum(['ASC', 'DESC']).default('ASC'),
  })
  .strict();
export const publicPatient = (p) => ({
  id: p.id,
  firstName: p.firstName,
  lastName: p.lastName,
  phone: p.phone,
  email: p.email,
  address: p.address,
  archived: p.archived,
  version: p.version,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});
