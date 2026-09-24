/**
 * Everything a site holds that this repository does not, as one archive.
 *
 *   npm run backup               # into the current folder
 *   npm run backup -- /tmp/x.zip # somewhere else
 *
 * A thin wrapper: the work is in src/lib/backup.js, because the CMS has a
 * button for this too and two copies of it would drift.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildBackup } from '../src/lib/backup.js';
import { config } from '../src/config.js';

let made;
try {
  made = buildBackup();
} catch (err) {
  console.error(`\n  ${err.message}`);
  console.error('  Refusing to write a backup. Take a copy of data/cms.db by hand and look at it.\n');
  process.exit(1);
}

const out = path.resolve(process.argv[2] || made.filename);
fs.writeFileSync(out, made.data);

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const { rows, files } = made.summary;
console.log(`\n  ${path.relative(process.cwd(), out) || out}`);
console.log(`  ${'-'.repeat(58)}`);
console.log(`  database   ${Object.entries(rows).map(([t, n]) => `${n} ${t}`).join(', ')}`);
console.log(`  uploads    ${files} files`);
if (config.paths.theme) console.log(`  theme      ${config.paths.theme} — send this separately`);
console.log(`  archive    ${mb(made.data.length)}\n`);
