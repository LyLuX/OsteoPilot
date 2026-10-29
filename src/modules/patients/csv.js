import { parse as csvParse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { parse } from '../../core/validation.js';
import { assert, AppError } from '../../core/errors.js';
import { patientInput } from './patient.validator.js';
export const csvColumns = ['lastName', 'firstName', 'phone', 'email', 'address'];
export function parseCsv(csv) {
  assert(
    typeof csv === 'string' && Buffer.byteLength(csv, 'utf8') <= 512 * 1024,
    'CSV limité à 512 Kio.',
    413,
  );
  let rows;
  try {
    rows = csvParse(csv, {
      bom: true,
      columns: (headers) => {
        if (headers.join(',') !== csvColumns.join(',')) throw new Error();
        return headers;
      },
      skip_empty_lines: true,
      max_record_size: 4096,
    });
  } catch {
    throw new AppError('CSV UTF-8 invalide. Vérifiez les colonnes et les guillemets.', 422);
  }
  assert(rows.length > 0 && rows.length <= 1000, 'Le CSV doit contenir de 1 à 1 000 lignes.', 422);
  const errors = [];
  const patients = rows.map((row, index) => {
    try {
      return parse(patientInput, row);
    } catch (error) {
      errors.push({ line: index + 2, fields: error.details?.map((d) => d.field) || [] });
      return null;
    }
  });
  return { patients, errors };
}
export function exportCsv(rows) {
  const safe = (value) =>
    /^[\s\u0000-\u001f]*[=+\-@\t\r\n]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
  return (
    '\uFEFF' +
    stringify(
      rows.map((row) =>
        Object.fromEntries(csvColumns.map((key) => [key, safe(String(row[key] || ''))])),
      ),
      { header: true, columns: csvColumns, record_delimiter: '\r\n' },
    )
  );
}
