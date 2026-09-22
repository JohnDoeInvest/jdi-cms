import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export const db = new DatabaseSync(config.paths.db);
db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));

/** All rows. */
export const all = (sql, ...params) => db.prepare(sql).all(...params);
/** First row or undefined. */
export const get = (sql, ...params) => db.prepare(sql).get(...params);
/** Run a write; returns { changes, lastInsertRowid }. */
export const run = (sql, ...params) => db.prepare(sql).run(...params);

/** Run `fn` inside a transaction, rolling back if it throws. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const setting = {
  get(key, fallback = null) {
    const row = get('SELECT value FROM settings WHERE key = ?', key);
    return row ? row.value : fallback;
  },
  set(key, value) {
    run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key, String(value));
  },
};

/** Parse a JSON column defensively - a malformed blob must not 500 the site. */
export function json(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}
