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
  if (action === 'paymentsSummary') return ref('PaymentSummary');
  if (action === 'paymentsList') return paginated('Payment');
  if (action === 'paymentPatients') return paginated('PaymentPatient');
  if (action === 'paymentsCreate') return ref('Payment');
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
  if (route.query) {
    const schema = jsonSchema(route.query);
    for (const [name, property] of Object.entries(schema.properties))
      parameters.push({
        name,
        in: 'query',
        required: schema.required?.includes(name) || false,
        schema: property,
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
    security: route.public ? [] : [{ session: [] }],
    parameters,
    ...(route.body
      ? {
          requestBody: {
            ...(route.action === 'settingsUpdate'
              ? {
                  description:
                    'Modifie uniquement les informations générales du cabinet. Les moyens de paiement se modifient séparément via PATCH /settings/payment-methods.',
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
