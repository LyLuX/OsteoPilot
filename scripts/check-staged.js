import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
const git = (...args) =>
  execFileSync('git', ['-c', 'safe.directory=' + process.cwd(), ...args], { encoding: 'utf8' });
const files = git('diff', '--cached', '--name-only', '-z').split('\0').filter(Boolean);
assert(files.length > 0, 'Aucun fichier indexé.');
const local = existsSync('.env') ? dotenv.parse(readFileSync('.env')) : {};
const secrets = Object.entries(local)
  .filter(([key, value]) => /SECRET|PASSWORD|TOKEN/.test(key) && value.length >= 6)
  .map(([, v]) => v);
for (const file of files) {
  assert(
    !/(^|\/)(node_modules|dist|coverage|exports|uploads|patients-local)(\/|$)/.test(file),
    'Fichier généré indexé : ' + file,
  );
  assert(
    !/(^|\/)\.env($|\.)/.test(file) || file.endsWith('.env.example'),
    'Configuration sensible indexée : ' + file,
  );
  assert(
    !/\.(sql|csv|log|code-workspace)$/i.test(file),
    'Fichier local ou données indexés : ' + file,
  );
  const content = git('show', ':' + file);
  for (const value of secrets)
    assert(!content.includes(value), 'Secret local détecté dans : ' + file);
  assert(
    !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content),
    'Clé privée détectée : ' + file,
  );
}
process.stdout.write(
  files.length + ' fichiers indexés vérifiés ; aucun secret local ni fichier généré détecté.\n',
);
