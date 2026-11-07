import { z } from 'zod';
import { routes } from '../routes/registry.js';
import { ref, paginated } from './openapi-components.js';
export const jsonSchema = (schema) => {
  const value = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
    target: 'draft-2020-12',
  });
  delete value.$schema;
  return value;
};
const session = {
  type: 'object',
  properties: { user: ref('User'), csrfToken: { type: 'string' } },
};
const preview = {
  type: 'object',
  properties: {
    valid: { type: 'boolean' },
    total: { type: 'integer' },
    fingerprint: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line: { type: 'integer' },
          fields: { type: 'array', items: { type: 'string' } },
          reason: { type: 'string' },
        },
      },
    },
    preview: {
      type: 'array',
      maxItems: 10,
      items: {
        type: ['object', 'null'],
        properties: Object.fromEntries(
          ['firstName', 'lastName', 'phone', 'email', 'address'].map((p) => [
            p,
            { type: 'string' },
          ]),
        ),
      },
    },
  },
};
export function responseSchema(action) {
  if (action === 'tariffsGet') return ref('Tariffs');
  if (['tariffCreate', 'tariffUpdate'].includes(action)) return ref('Tariff');
  if (['calendarSettingsGet', 'calendarSettingsUpdate'].includes(action))
    return ref('CalendarSettings');
  if (action === 'paymentDelete') return ref('PaymentDeleted');
  if (action === 'patientPayments') return ref('PatientPayments');
  if (action === 'paymentDepositsCancellable') return ref('CancellableDeposits');
  if (action === 'paymentDepositsCancel') return ref('CancelledDeposits');
  if (action === 'paymentDepositSlipDelete') return ref('DepositSlipDeleted');
  if (action === 'paymentDepositHistory') return paginated('DepositSlipSummary');
  if (action === 'paymentDepositSlip') return ref('DepositSlip');
  if (action === 'paymentDepositPreview') return ref('PaymentDepositPreview');
  if (action === 'paymentDepositBatch') return ref('PaymentDepositBatch');
  if (action === 'paymentsSummary') return ref('PaymentSummary');
  if (action === 'paymentsList') return ref('Payments');
  if (action === 'paymentPatients') return paginated('PaymentPatient');
  if (['paymentsCreate', 'paymentBankDeposit'].includes(action)) return ref('Payment');
  if (['login', 'me', 'refresh'].includes(action)) return session;
  if (['patientsList', 'usersList', 'rolesList', 'permissionsList', 'history'].includes(action))
    return paginated(
      {
        patientsList: 'Patient',
        usersList: 'User',
        rolesList: 'Role',
        permissionsList: 'Permission',
        history: 'Audit',
      }[action],
    );
  if (
    ['patientsCreate', 'patientGet', 'patientUpdate', 'patientArchive', 'patientStatus'].includes(
      action,
    )
  )
    return ref('Patient');
  if (['userCreate', 'userUpdate'].includes(action)) return ref('User');
  if (['roleCreate', 'roleUpdate'].includes(action)) return ref('Role');
  if (action === 'paymentMethodUpdate') return ref('PaymentMethodsSettings');
  if (action.startsWith('settings')) return ref('Settings');
  if (action === 'importPreview') return preview;
  if (action === 'importConfirm')
    return { type: 'object', properties: { imported: { type: 'integer' } } };
  if (action === 'permissionsUpdate')
    return {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        permissionIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
      },
    };
  return { type: 'object' };
}
export const paths = {};
for (const route of routes) {
  const path = '/api/v1' + route.path.replace(':id', '{id}');
  const parameters = [];
  if (route.path.includes(':id'))
    parameters.push({
      name: 'id',
      in: 'path',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    });
  const paymentPeriodDescription =
    'Période inclusive de 366 jours maximum, avec from ≤ to. Pour la liste, omettre les dates pour tout l’historique, ou fournir soit date seule, soit from et to ensemble.';
  if (route.query) {
    const schema = jsonSchema(route.query);
    for (const [name, property] of Object.entries(schema.properties))
      parameters.push({
        name,
        in: 'query',
        required: schema.required?.includes(name) || false,
        schema: property,
        ...(['paymentsList', 'paymentsSummary'].includes(route.action) &&
        ['date', 'from', 'to'].includes(name)
          ? { description: paymentPeriodDescription }
          : {}),
      });
  }
  if (route.method !== 'get') {
    parameters.push({
      name: 'Origin',
      in: 'header',
      required: true,
      schema: { type: 'string' },
      description: 'Origine frontend explicitement autorisée.',
    });
    if (!route.public)
      parameters.push({
        name: 'X-CSRF-Token',
        in: 'header',
        required: true,
        schema: { type: 'string' },
      });
  }
  if (route.idempotent)
    parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', pattern: '^[a-zA-Z0-9-]{16,100}$' },
    });
  const statuses = [400, 401, 403, 404, 409, 413, 415, 422, 429, 500];
  const responses = Object.fromEntries(
    statuses.map((status) => [
      status,
      {
        description:
          {
            401: 'Session absente, expirée ou révoquée',
            403: 'Permission, CSRF ou origine refusée',
            409: 'Conflit, doublon ou version dépassée',
            422: 'Validation refusée',
            429: 'Limite de requêtes atteinte',
          }[status] || 'Requête refusée ou indisponible',
        content: { 'application/json': { schema: ref('Error') } },
      },
    ]),
  );
  responses[route.status || 200] = {
    description: 'Succès après commit pour une écriture',
    content:
      route.action === 'export'
        ? { 'text/csv': { schema: { type: 'string' } } }
        : {
            'application/json': {
              schema: {
                type: 'object',
                required: ['success', 'data'],
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: responseSchema(route.action),
                },
              },
            },
          },
    ...(['login', 'refresh', 'logout'].includes(route.action)
      ? {
          headers: {
            'Set-Cookie': {
              schema: { type: 'string' },
              description:
                'Cookie HttpOnly, SameSite=Strict, Secure en production ; JWT jamais dans le JSON.',
            },
          },
        }
      : {}),
  };
  paths[path] ||= {};
  paths[path][route.method] = {
    operationId: route.action,
    summary: route.summary,
    'x-permission': route.permission || null,
    ...(['paymentDepositHistory', 'paymentDepositSlip', 'paymentDepositSlipDelete'].includes(
      route.action,
    )
      ? {
          description:
            'Droit payments.read requis. Historique : payments.deposits.read ; détail pour réimpression : payments.deposits.read et payments.deposits.reprint ; suppression : payments.deposits.read et payments.deposits.delete. Seuls les documents reconstructed=true peuvent être supprimés, avec confirmed=true, origine et CSRF. Les documents originaux sont refusés avec 409 ; les paiements restent inchangés.',
        }
      : {}),
    ...(route.action === 'paymentBankDeposit'
      ? {
          description:
            'Annulation uniquement : bankDeposited doit valoir false (true est refusé avec 422). payments.read et payments.deposit.cancel sont requis, même pour une annulation sans effet. Tout nouveau dépôt passe par POST /payments/deposits, avec bordereau et archivage atomique.',
        }
      : {}),
    ...(route.action === 'paymentsList'
      ? {
          description:
            'pendingDeposits et depositedPayments indiquent les nombres globaux d’espèces et de chèques à déposer et déjà déposés, indépendamment de la pagination et des filtres de dates. Ces compteurs et la liste sont lus dans une même transaction cohérente.',
        }
      : {}),
    ...(route.action === 'paymentDepositPreview'
      ? {
          description:
            'Bordereau au nom du cabinet configuré, avec numéro de chèque nullable par ligne. Seul le nom est lu dans le paramétrage, sans exiger settings.read. Un nom absent est refusé (422).',
        }
      : {}),
    ...(route.action === 'paymentsCreate'
      ? {
          description:
            'chequeNumber est facultatif : 1 à 30 chiffres, uniquement si method vaut cheque. Les zéros initiaux sont conservés. Aucun numéro dans les audits.',
        }
      : {}),
    security: route.public ? [] : [{ session: [] }],
    parameters,
    ...(route.body
      ? {
          requestBody: {
            ...(route.action === 'paymentsCreate'
              ? {
                  description:
                    'La date doit être au plus tard celle du jour courant Europe/Paris, calculée à chaque requête côté serveur. Les dates futures sont refusées avec HTTP 422 et un détail sur le champ date. tariffId est obligatoire ; amountCents doit correspondre au prix configuré à la sélection. Un prix devenu obsolète est refusé avec HTTP 409 et un détail tariffId. Le montant validé est conservé dans Payments sans être modifié par les changements ultérieurs de tarifs.',
                }
              : {}),
            ...(route.action === 'settingsUpdate'
              ? {
                  description:
                    'Modifie uniquement les informations générales du cabinet. Les moyens de paiement se modifient séparément via PATCH /settings/payment-methods et la vue initiale du calendrier via PATCH /settings/calendar.',
                }
              : {}),
            required: true,
            content: { 'application/json': { schema: jsonSchema(route.body) } },
          },
        }
      : {}),
    responses,
  };
}
paths['/health'] = {
  get: {
    operationId: 'health',
    summary: 'Vérifier le processus (aucune donnée personnelle)',
    security: [],
    responses: {
      200: {
        description: 'Processus disponible',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                data: {
                  type: 'object',
                  properties: { status: { type: 'string' }, version: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  },
};
