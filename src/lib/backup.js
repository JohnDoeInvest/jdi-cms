import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { config, ROOT } from '../config.js';
import { zip } from './zip.js';
import { slugify, randomToken } from './util.js';

/**
 * Everything a site *is*, as one archive.
 *
 * A Slice installation is the repository plus three things that are not in
 * it: `data/cms.db`, `www/media/` and whatever typefaces were uploaded.
 * Handing a site over means handing over those three, and the folders they
 * live in hold other things too - `data/outbox/`, `data/logs/`,
 * `www/assets/`, the faces that ship with the repo. "Copy data and www" is
 * wrong in both directions.
 *
 * So this is not a convenience. "These paths, but not those" is an
 * instruction somebody has to follow correctly under time pressure, every
 * time; an archive is a thing that either arrived or it did not.
 *
 * **The paths inside mirror the destination**, so unpacking at the root of an
 * installation puts every file where it belongs and there is no step to get
 * wrong. The structure carries the instruction.
 *
 * Here rather than in `scripts/backup.mjs` because the CMS has a button for
 * it too, and two copies of this would drift.
 */

const TABLES = ['pages', 'articles', 'media', 'menus', 'categories', 'forms', 'messages', 'users'];

/*
 * What comes with the repository, and so must not be in a backup: the
 * typefaces Slice ships, `.gitkeep`, anything added to www/ later. Asked of
 * git rather than listed here, so a file added to the repo next year is
 * excluded next year without anyone remembering this file exists.
 *
 * Without git - an installation deployed as an unpacked tarball - nothing is
 * excluded, which errs towards an archive with a spare file in it rather than
 * one missing a typeface somebody uploaded.
 */
function shippedWithRepo() {
  try {
    const out = execFileSync('git', ['ls-files', '--', 'www/media', 'www/fonts'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return new Set(out.split('\n').map((l) => l.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

/** Every uploaded file, as paths relative to the installation root. */
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

export function contentFiles() {
  const shipped = shippedWithRepo();
  return [...walk(config.paths.media, shipped), ...walk(config.paths.fonts, shipped)];
}

/** The commit this CMS is on, so version skew can be judged rather than found. */
export function cmsCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
}

/**
 * What a backup would contain, without building one.
 *
 * Cheap enough to run while drawing a screen: eight counts and a walk of the
 * uploads folder. It is what lets the button say how large the download will
 * be before somebody starts a 50 MB one by accident.
 */
export function backupSummary() {
  const db = new DatabaseSync(config.paths.db, { readOnly: true });
  const rows = {};
  for (const t of TABLES) {
    try { rows[t] = db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n; } catch { /* not in this schema */ }
  }
  const name = (() => {
    try { return db.prepare("SELECT value FROM settings WHERE key='site_name'").get()?.value || 'site'; }
    catch { return 'site'; }
  })();
  db.close();

  const files = contentFiles();
  return {
    site: name,
    rows,
    files: files.length,
    // The database compresses about 9:1 and the uploads not at all, so the
    // uploads are the size of the archive to within a rounding error.
    bytes: files.reduce((n, f) => n + f.size, 0) + fs.statSync(config.paths.db).size,
    theme: config.paths.theme || null,
  };
}

function readmeFor(summary, day) {
  return `${summary.site} — site content, ${day}
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
${summary.theme ? `
This site was running with a theme from:
  ${summary.theme}
That is a separate repository and is NOT in here. Point THEME_DIR at
it on the far end, or the site comes up in the neutral default theme.
` : ''}`;
}

/**
 * Build the archive. Returns `{ filename, data, summary }`.
 *
 * Safe against a live site: the database is copied with `VACUUM INTO`, which
 * is consistent while the server holds the file open. Copying `cms.db` by
 * hand while a server runs is *not* - a running site keeps a write-ahead log
 * beside it, and the copy silently lacks the newest content.
 *
 * Uploads are read as they are found, so a file added *during* a run may or
 * may not be in it. That matters for a busy site and for nothing else.
 *
 * **It builds the whole archive in memory**, roughly five times the finished
 * size while it works. Fine for a site's media folder, wrong for a library of
 * video; `src/lib/zip.js` names streaming as the fix when it bites.
 *
 * Throws rather than writing a backup of a database that fails its own
 * integrity check: a corrupt backup is the kind you find out about when you
 * need it.
 */
export function buildBackup({ now = new Date() } = {}) {
  const snapshot = path.join(config.paths.data, `backup-${randomToken(8)}.db`);
  fs.rmSync(snapshot, { force: true });

  let manifest;
  let dbBytes;
  try {
    const live = new DatabaseSync(config.paths.db, { readOnly: true });
    // Doubled quotes: the path is ours, but a data directory with an
    // apostrophe in it would otherwise end the string mid-statement.
    live.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
    live.close();

    const copy = new DatabaseSync(snapshot, { readOnly: true });
    const integrity = copy.prepare('PRAGMA integrity_check').get().integrity_check;
    copy.close();
    if (integrity !== 'ok') {
      throw new Error(`The database does not pass its own integrity check (${integrity}).`);
    }
    dbBytes = fs.readFileSync(snapshot);
    manifest = { integrity };
  } finally {
    fs.rmSync(snapshot, { force: true });
  }

  const summary = backupSummary();
  const files = contentFiles();
  const day = now.toISOString().slice(0, 10);

  const full = {
    format: 'slice-backup/1',
    made: now.toISOString(),
    site: { name: summary.site, url: config.siteUrl },
    cms: { commit: cmsCommit() },
    database: { rows: summary.rows, integrity: manifest.integrity },
    uploads: { files: files.length, bytes: files.reduce((n, f) => n + f.size, 0) },
    /* A theme lives outside the installation, so it is not in here - but the
       archive says it was in use, because a site restored without its theme
       comes up in the default one and looks broken rather than unset. */
    theme: summary.theme
      ? { dir: summary.theme, note: 'Not in this archive. THEME_DIR must point at this theme on the far end.' }
      : null,
    restore: 'Unpack at the root of a Slice installation. Every path lands where it belongs.',
  };

  const data = zip([
    { name: 'manifest.json', data: Buffer.from(`${JSON.stringify(full, null, 2)}\n`) },
    { name: 'README.txt', data: Buffer.from(readmeFor(summary, day)) },
    { name: 'data/cms.db', data: dbBytes, date: now },
    ...files.map((f) => ({ name: f.rel, data: fs.readFileSync(f.full), date: fs.statSync(f.full).mtime })),
  ], { now });

  return {
    filename: `${slugify(summary.site, 'site')}-${day}.zip`,
    data,
    summary: { ...summary, manifest: full },
  };
}
