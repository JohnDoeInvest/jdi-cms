#!/usr/bin/env node
/**
 * One-off: give `pages` the `parent_id` and `slug` it now needs.
 *
 * There is no migration framework here on purpose - schema.sql is the only
 * description of the database, and a shape that changes is changed there and
 * the local copy brought into line by hand or by `npm run reset`. Reset was
 * not an option this time: the database holds real pages somebody wrote.
 *
 * Guarded at every step, so running it twice is a no-op.
 *
 * The backfill is only simple because it ran while every page was still a
 * single segment. A page whose permalink has more than one - hand-nested
 * before this existed - is left alone with its parent unset and reported at
 * the end, because guessing which of `/a/b/c` is the parent is guessing.
 *
 *   node scripts/migrate-page-parents.mjs [--dry]
 */
import { DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.js';

const dry = process.argv.includes('--dry');
const db = new DatabaseSync(config.paths.db);

const columns = db.prepare('PRAGMA table_info(pages)').all().map((c) => c.name);
const has = (name) => columns.includes(name);

if (!has('parent_id')) {
  console.log('  + pages.parent_id');
  if (!dry) db.exec('ALTER TABLE pages ADD COLUMN parent_id INTEGER REFERENCES pages(id) ON DELETE SET NULL');
} else {
  console.log('  = pages.parent_id already there');
}

if (!has('slug')) {
  console.log('  + pages.slug');
  if (!dry) db.exec("ALTER TABLE pages ADD COLUMN slug TEXT NOT NULL DEFAULT ''");
} else {
  console.log('  = pages.slug already there');
}

/* Backfill. The landing page keeps an empty slug and no parent - it is the
   root, not a page sitting at it.

   Read through `permalink` alone, which is the one column that is certainly
   there: on a dry run the two new ones do not exist yet, and a SELECT naming
   them would fail before it could report what it was going to do. */
const live = db.prepare('PRAGMA table_info(pages)').all().map((c) => c.name).includes('slug');
const rows = db.prepare(
  live ? 'SELECT id, permalink, slug, parent_id FROM pages ORDER BY id'
       : "SELECT id, permalink, '' AS slug, NULL AS parent_id FROM pages ORDER BY id").all();
const byPermalink = new Map(rows.map((r) => [r.permalink, r]));

let filled = 0;
const deep = [];

for (const row of rows) {
  if (row.slug) continue;                       // already done
  const segments = String(row.permalink || '/').split('/').filter(Boolean);

  if (!segments.length) continue;               // '/' keeps slug '' and no parent

  const slug = segments[segments.length - 1];
  let parentId = null;

  if (segments.length > 1) {
    const parentPath = '/' + segments.slice(0, -1).join('/');
    const parent = byPermalink.get(parentPath);
    if (parent) parentId = parent.id;
    else deep.push(`${row.permalink} — no page at ${parentPath}, parent left unset`);
  }

  console.log(`  ${row.permalink}  ->  slug "${slug}"${parentId ? `, under #${parentId}` : ''}`);
  if (!dry) {
    db.prepare('UPDATE pages SET slug = ?, parent_id = ? WHERE id = ?').run(slug, parentId, row.id);
  }
  filled += 1;
}

console.log(`\n  ${filled} page(s) ${dry ? 'would be' : ''} backfilled.`);
if (deep.length) {
  console.log('\n  Needs a look:');
  for (const line of deep) console.log('   ! ' + line);
}
if (dry) console.log('\n  Dry run - nothing written.');
db.close();
