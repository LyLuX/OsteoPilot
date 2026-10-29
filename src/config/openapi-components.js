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
        archived: { type: 'boolean' },
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
    Settings: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        address: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        timezone: { type: 'string', enum: ['Europe/Paris'] },
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
