#!/usr/bin/env node
/**
 * One-off: give `pages` and `articles` the `draft_meta` they now need.
 *
 * The draft/published split covered `content` and nothing else, so a title or
 * a meta description typed into a live document was on the public site before
 * the keystroke finished. Everything that is not blocks now waits in
 * `draft_meta` until Publish, and this adds the column to a database that
 * predates it.
 *
 * Nothing to backfill: empty means nothing pending, which is true of every
 * existing row. Guarded, so running it twice is a no-op.
 *
 *   node scripts/migrate-draft-meta.mjs [--dry]
 */
import { DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.js';

const dry = process.argv.includes('--dry');
const db = new DatabaseSync(config.paths.db);

for (const table of ['pages', 'articles']) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === 'draft_meta');
  if (has) {
    console.log(`  = ${table}.draft_meta already there`);
    continue;
  }
  console.log(`  + ${table}.draft_meta`);
  if (!dry) db.exec(`ALTER TABLE ${table} ADD COLUMN draft_meta TEXT NOT NULL DEFAULT '{}'`);
}

if (dry) console.log('\n  Dry run - nothing written.');
db.close();
