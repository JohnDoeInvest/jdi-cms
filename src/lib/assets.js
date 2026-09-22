import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/**
 * Cache-busting asset URLs.
 *
 * Static files are served with a long max-age, so every URL carries a version
 * derived from the file's mtime. The stat is cached for a second, which keeps
 * edit-reload instant in development without stat-ing on every request.
 */
const cache = new Map();
const TTL = 1000;

export function asset(urlPath) {
  const now = Date.now();
  const hit = cache.get(urlPath);
  if (hit && now - hit.at < TTL) return hit.url;

  let version = '0';
  try {
    const file = path.join(config.paths.www, urlPath.replace(/^\/+/, ''));
    version = Math.round(fs.statSync(file).mtimeMs).toString(36);
  } catch { /* missing file: fall through with a stable version */ }

  const url = `${urlPath}?v=${version}`;
  cache.set(urlPath, { url, at: now });
  return url;
}
