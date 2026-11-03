import { z, text, uuid } from '../../core/validation.js';
export const tariffInput = z
  .object({ label: text(100).min(1), amountCents: z.number().int().min(1).max(99999999) })
  .strict();
export const tariffUpdateInput = tariffInput
  .extend({ version: z.number().int().min(1).max(4294967294) })
  .strict();
export const tariffCatalog = z
  .array(
    tariffInput.extend({ id: uuid, version: z.number().int().min(1).max(4294967295) }).strict(),
  )
  .max(100)
  .refine(
    (tariffs) =>
      new Set(tariffs.map((tariff) => tariff.id)).size === tariffs.length &&
      new Set(tariffs.map((tariff) => tariff.label.toLocaleLowerCase('fr-FR'))).size ===
        tariffs.length,
  );
export const initialTariffs = () => [
  {
    id: '01ce82e1-96e8-489a-914a-ec38097c45cd',
    label: 'Consultation enfant/nourrisson',
    amountCents: 4500,
    version: 1,
  },
  {
    id: '1097b728-f80f-4ee3-aeb2-78e46ecf58d5',
    label: 'Consultation adulte',
    amountCents: 5500,
    version: 1,
  },
];
export const publicTariffs = (row) => ({
  tariffs: (row.tariffs ?? []).map(({ id, label, amountCents, version }) => ({
    id,
    label,
    amountCents,
    version,
  })),
});
