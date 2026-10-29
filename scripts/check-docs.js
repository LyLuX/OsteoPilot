import assert from 'node:assert/strict';
import SwaggerParser from '@apidevtools/swagger-parser';
import { openapi } from '../src/config/openapi.js';
import { routes } from '../src/routes/registry.js';
import { permissions } from '../src/modules/permissions/permissions.js';
await SwaggerParser.validate(structuredClone(openapi));
assert.equal(
  Object.values(openapi.paths).reduce((n, p) => n + Object.keys(p).length, 0),
  routes.length + 1,
);
for (const route of routes) {
  const operation = openapi.paths['/api/v1' + route.path.replace(':id', '{id}')][route.method];
  assert.equal(operation['x-permission'], route.permission || null);
  if (route.permission) assert(permissions.includes(route.permission));
  assert(operation.responses[route.status || 200]);
  if (route.body) assert(operation.requestBody.required);
}
process.stdout.write('OpenAPI valide : ' + (routes.length + 1) + ' opérations synchronisées.\n');
