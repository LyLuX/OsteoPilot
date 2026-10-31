import { calendarViews } from '../modules/administration/calendar-settings.js';
import { paymentMethodCodes } from '../modules/administration/payment-methods.js';
export const components = {
  securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'osteopilot.access' } },
  schemas: {
    Error: {
      type: 'object',
      required: ['success', 'error'],
      properties: {
        success: { type: 'boolean', enum: [false] },
        error: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string' },
            details: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
    Patient: {
      type: 'object',
      additionalProperties: false,
      required: [
        'id',
        'firstName',
        'lastName',
        'phone',
        'email',
        'address',
        'archived',
        'version',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        id: { type: 'string', format: 'uuid' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        address: { type: 'string' },
        archived: {
          type: 'boolean',
          description:
            'Patient inactif si true. Le statut est modifiable avec patients.archive et une version courante.',
        },
        version: { type: 'integer' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    User: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', format: 'uuid' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
        active: { type: 'boolean' },
        roleIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
        roles: { type: 'array', items: { type: 'string' } },
        permissions: { type: 'array', items: { type: 'string' } },
      },
    },
    Role: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        system: { type: 'boolean' },
        permissionIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
      },
    },
    Permission: {
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } },
    },
    Audit: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', format: 'uuid' },
        actorId: { type: ['string', 'null'], format: 'uuid' },
        action: { type: 'string' },
        entity: { type: 'string' },
        entityId: { type: ['string', 'null'], format: 'uuid' },
        count: { type: 'integer' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    Pagination: {
      type: 'object',
      properties: Object.fromEntries(
        ['page', 'limit', 'total', 'totalPages'].map((p) => [p, { type: 'integer' }]),
      ),
    },
    PaymentPatient: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'firstName', 'lastName'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
      },
    },
    Payment: {
      type: 'object',
      additionalProperties: false,
      required: [
        'id',
        'patientId',
        'date',
        'method',
        'amountCents',
        'createdAt',
        'bankDeposited',
        'version',
      ],
      properties: {
        id: { type: 'string', format: 'uuid' },
        patientId: { type: 'string', format: 'uuid' },
        date: {
          type: 'string',
          format: 'date',
          description: 'Jour civil du cabinet Europe/Paris, sans conversion UTC.',
        },
        method: { type: 'string', enum: paymentMethodCodes },
        amountCents: { type: 'integer', minimum: 1, maximum: 99999999 },
        bankDeposited: {
          type: ['boolean', 'null'],
          description:
            'Espèces et chèques : false = à déposer, true = déposé en banque. Carte et virement : null (sans objet). Les paiements existants sont initialisés à false sans déduire leur dépôt réel.',
        },
        version: {
          type: 'integer',
          minimum: 1,
          maximum: 4294967295,
          description:
            'Version à transmettre pour modifier le dépôt. Une version dépassée est refusée (409).',
        },
        createdAt: { type: 'string', format: 'date-time' },
        patient: { $ref: '#/components/schemas/PaymentPatient' },
      },
    },
    PaymentSummary: {
      type: 'object',
      description:
        'Totaux journaliers sur une période inclusive de 366 jours maximum. Les paiements historiques restent inclus même si leur moyen est désormais désactivé.',
      required: ['days', 'acceptedMethods'],
      properties: {
        acceptedMethods: { $ref: '#/components/schemas/PaymentMethods' },
        days: {
          type: 'array',
          maxItems: 366,
          items: {
            type: 'object',
            required: ['date', 'methods', 'totalCents'],
            properties: {
              date: { type: 'string', format: 'date' },
              totalCents: { type: 'integer', minimum: 0 },
              methods: {
                type: 'object',
                additionalProperties: false,
                required: paymentMethodCodes,
                properties: Object.fromEntries(
                  paymentMethodCodes.map((code) => [code, { type: 'integer', minimum: 0 }]),
                ),
              },
            },
          },
        },
      },
    },
    PaymentMethods: {
      type: 'array',
      maxItems: 4,
      uniqueItems: true,
      items: { type: 'string', enum: paymentMethodCodes },
      description:
        'Moyens acceptés : cash (Espèces), card (Carte), cheque (Chèque), transfer (Virement). Une liste vide signifie aucun moyen sélectionné.',
    },
    PaymentMethodsSettings: {
      type: 'object',
      additionalProperties: false,
      required: ['paymentMethods'],
      properties: { paymentMethods: { $ref: '#/components/schemas/PaymentMethods' } },
    },
    CalendarSettings: {
      type: 'object',
      additionalProperties: false,
      required: ['defaultCalendarView'],
      properties: {
        defaultCalendarView: {
          type: 'string',
          enum: calendarViews,
          default: 'month',
          description: 'Vue affichée à l’ouverture du dashboard, partagée par le cabinet.',
        },
      },
    },
    Settings: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        address: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        timezone: { type: 'string', enum: ['Europe/Paris'] },
        paymentMethods: { $ref: '#/components/schemas/PaymentMethods' },
        defaultCalendarView: { type: 'string', enum: calendarViews, default: 'month' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};
export const ref = (name) => ({ $ref: '#/components/schemas/' + name });
export const paginated = (name) => ({
  type: 'object',
  properties: { items: { type: 'array', items: ref(name) }, pagination: ref('Pagination') },
});
