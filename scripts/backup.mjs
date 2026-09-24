/**
 * Everything a site *is*, as one archive.
 *
 *   npm run backup               # into the current folder
 *   npm run backup -- /tmp/x.zip # somewhere else
 *
 * A Slice installation is this repository plus three things that are not in
 * it: `data/cms.db`, `www/media/` and whatever fonts were uploaded. Handing
 * a site to somebody else means handing over those three, and the folders
 * they live in hold other things too - `data/outbox/`, `data/logs/`,
 * `www/assets/`, the typefaces that ship with the repo. "Copy data and www"
 * is wrong in both directions.
 *
 * So this is not a convenience. The instruction "these four paths, but not
 * those three" is one somebody has to follow correctly under time pressure,
 * every time; an archive is a thing that either arrived or it did not.
 *
 * **The paths inside mirror the destination**, so unpacking it at the root of
 * an installation puts every file where it belongs and there is no step to
 * get wrong. The structure carries the instruction.
 *
 * Safe to run against a live site: the database is copied with VACUUM INTO,
 * which is consistent while the server has the file open. Uploads are read as
 * they are found, so a file added *during* a run may or may not be in it -
 * which matters for a busy site and not for anything else.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { config, ROOT } from '../src/config.js';
import { zip } from '../src/lib/zip.js';
import { slugify } from '../src/lib/util.js';

/* What comes with the repository, and so must not be in a backup: the
   typefaces Slice ships, `.gitkeep`, anything else added to www/ later.
   Asked of git rather than listed here, so a file added to the repo tomorrow
   is excluded tomorrow without anyone remembering this script exists.
   Without git - an installation deployed as an unpacked tarball - nothing is
   excluded, which errs towards an archive with a spare file in it rather than
   one missing a font somebody uploaded. */
function shippedWithRepo() {
  try {
    const out = execFileSync('git', ['ls-files', '--', 'www/media', 'www/fonts'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return new Set(out.split('\n').map((l) => l.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

/** Every file under `dir`, as paths relative to the installation root. */
function walk(dir, skip, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Dotfiles are the host's business - .DS_Store, .gitkeep - never content.
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (entry.isDirectory()) walk(full, skip, found);
    else if (!skip.has(rel)) found.push({ rel, full, size: fs.statSync(full).size });
  }
  return found;
}

const shipped = shippedWithRepo();
const uploads = [
  ...walk(config.paths.media, shipped),
  ...walk(config.paths.fonts, shipped),
];

/* The database, as a snapshot rather than a file copy. A running site keeps a
   write-ahead log beside the .db, so copying the file alone silently leaves
   out the newest content - VACUUM INTO folds the two together into one
   consistent file, and does it while the server has the original open. */
const snapshotPath = path.join(config.paths.data, `backup-snapshot-${process.pid}.db`);
fs.rmSync(snapshotPath, { force: true });
const live = new DatabaseSync(config.paths.db, { readOnly: true });
live.exec(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'`);

/* Row counts, so the far end can tell an archive arrived whole rather than
   trusting that it did. Cheap to take and the only check worth having on a
   file that has crossed a network. */
const snapshot = new DatabaseSync(snapshotPath, { readOnly: true });
const counts = {};
for (const t of ['pages', 'articles', 'media', 'menus', 'categories', 'forms', 'messages', 'users']) {
  try { counts[t] = snapshot.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n; } catch { /* not in this schema */ }
}
const integrity = snapshot.prepare('PRAGMA integrity_check').get().integrity_check;
const siteName = (() => {
  try { return snapshot.prepare("SELECT value FROM settings WHERE key='site_name'").get()?.value || 'site'; }
  catch { return 'site'; }
})();
snapshot.close();
live.close();

if (integrity !== 'ok') {
  fs.rmSync(snapshotPath, { force: true });
  console.error(`  The database does not pass its own integrity check (${integrity}).`);
  console.error('  Refusing to write a backup of it. Take a copy of data/cms.db by hand and look at it.');
  process.exit(1);
}

const commit = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
})();

const day = new Date().toISOString().slice(0, 10);
const manifest = {
  format: 'slice-backup/1',
  made: new Date().toISOString(),
  site: { name: siteName, url: config.siteUrl },
  // Which Slice this came off, so version skew can be judged rather than found.
  cms: { commit },
  database: { rows: counts, integrity },
  uploads: { files: uploads.length, bytes: uploads.reduce((n, f) => n + f.size, 0) },
  /* A theme lives outside the installation, so it is not in here - but the
     archive says it was in use, because a site restored without its theme
     comes up in the default one and looks broken rather than unset. */
  theme: config.paths.theme
    ? { dir: config.paths.theme, note: 'Not in this archive. THEME_DIR must point at this theme on the far end.' }
    : null,
  restore: 'Unpack at the root of a Slice installation. Every path lands where it belongs.',
};

const readme = `${siteName} — site content, ${day}
${'='.repeat(60)}

This is everything a Slice installation holds that is NOT in the
slice-cms repository: the database, the uploads, and any typefaces
that were uploaded rather than shipped.

To restore it:

  1. Clone or unpack slice-cms.
  2. Unpack this archive at the root of it. The paths already match,
     so nothing has to be put anywhere by hand.
  3. ./start.sh

manifest.json carries the row counts this was taken with, so you can
check it arrived whole.
${config.paths.theme ? `
This site was running with a theme from:
  ${config.paths.theme}
That is a separate repository and is NOT in here. Point THEME_DIR at
it on the far end, or the site comes up in the neutral default theme.
` : ''}`;

const entries = [
  { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') },
  { name: 'README.txt', data: Buffer.from(readme) },
  { name: 'data/cms.db', data: fs.readFileSync(snapshotPath) },
  ...uploads.map((f) => ({ name: f.rel, data: fs.readFileSync(f.full), date: fs.statSync(f.full).mtime })),
];

const out = path.resolve(process.argv[2] || `${slugify(siteName, 'site')}-${day}.zip`);
fs.writeFileSync(out, zip(entries));
fs.rmSync(snapshotPath, { force: true });

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
console.log(`\n  ${path.relative(process.cwd(), out) || out}`);
console.log(`  ${'-'.repeat(58)}`);
console.log(`  database   ${Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(', ')}`);
console.log(`  uploads    ${uploads.length} files, ${mb(manifest.uploads.bytes)}`);
if (config.paths.theme) console.log(`  theme      ${config.paths.theme} — send this separately`);
console.log(`  archive    ${mb(fs.statSync(out).size)}\n`);
