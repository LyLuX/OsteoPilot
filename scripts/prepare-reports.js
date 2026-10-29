import { mkdirSync } from 'node:fs';
for (const directory of ['coverage/security', 'frontend/coverage/security']) {
  mkdirSync(directory, { recursive: true });
}
