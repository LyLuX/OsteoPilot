import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export const gatePasses = (validation, mysql) => validation === 'success' && mysql === 'success';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const validation = process.env.CI_VALIDATION_RESULT;
  const mysql = process.env.CI_MYSQL_RESULT;
  const passed = gatePasses(validation, mysql);
  await mkdir('coverage/security', { recursive: true });
  await writeFile(
    'coverage/security/gate.json',
    JSON.stringify(
      {
        passed,
        validation: validation || null,
        mysql: mysql || null,
        sha: process.env.GITHUB_SHA || null,
        run: process.env.GITHUB_RUN_ID || null,
      },
      null,
      2,
    ),
  );
  if (!passed) {
    process.stderr.write('Sécurité refusée : tous les contrôles doivent réussir.\n');
    process.exitCode = 1;
  }
}
