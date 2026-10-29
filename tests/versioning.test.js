import { readFileSync } from 'node:fs';
import { version } from '../src/config/version.js';
import { openapi } from '../src/config/openapi.js';
test('versions backend/frontend, lockfiles et OpenAPI identiques', () => {
  for (const path of [
    'package.json',
    'package-lock.json',
    'frontend/package.json',
    'frontend/package-lock.json',
  ]) {
    const p = JSON.parse(readFileSync(new URL('../' + path, import.meta.url)));
    expect(p.version).toBe(version);
    if (p.packages) expect(p.packages[''].version).toBe(version);
  }
  expect(openapi.info.version).toBe(version);
  expect(readFileSync(new URL('../README.md', import.meta.url), 'utf8')).toContain(
    '**' + version + '**',
  );
});
