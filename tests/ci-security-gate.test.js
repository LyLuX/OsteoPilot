import { gatePasses } from '../scripts/ci-security-gate.js';
test('porte CI fail-closed : résultats absents, ignorés ou annulés refusés', () => {
  const statuses = ['success', 'failure', 'cancelled', 'skipped', '', undefined, 'unknown'];
  for (const a of statuses)
    for (const b of statuses) expect(gatePasses(a, b)).toBe(a === 'success' && b === 'success');
});
