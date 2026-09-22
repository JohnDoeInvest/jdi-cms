import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/**
 * The file on disk behind an /assets URL: the theme's own copy when THEME_DIR
 * has one, the default in www/assets otherwise - the same order the server
 * looks in, so a version is always taken from the file actually served.
 */
export function assetFile(urlPath) {
  const name = urlPath.replace(/^\/+assets\/+/, '').replace(/^\/+/, '');
  if (config.paths.theme) {
    const themed = path.join(config.paths.theme, name);
    // Never outside the theme folder, whatever the name says.
    if (themed.startsWith(config.paths.theme + path.sep) && fs.existsSync(themed)) return themed;
  }
  return path.join(config.paths.www, 'assets', name);
}

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
    version = Math.round(fs.statSync(assetFile(urlPath)).mtimeMs).toString(36);
  } catch { /* missing file: fall through with a stable version */ }

  const url = `${urlPath}?v=${version}`;
  cache.set(urlPath, { url, at: now });
  return url;
}
