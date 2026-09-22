/**
 * THEME_DIR: a site's own tokens.css and site.css, served in place of the
 * defaults without touching this repo. Everything the folder does not have
 * falls through to www/assets.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-theme-'));
const theme = path.join(dir, 'theme');
fs.mkdirSync(theme);
fs.writeFileSync(path.join(theme, 'tokens.css'), ':root{--accent:#ff00aa}/* the themed one */');
fs.writeFileSync(path.join(dir, 'secret.txt'), 'outside the theme');
process.env.DB_PATH = path.join(dir, 'cms.db');
process.env.THEME_DIR = theme;

const { createApp } = await import('../src/app.js');
const { asset, assetFile } = await import('../src/lib/assets.js');

const server = await new Promise((resolve) => {
  const s = createApp().listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the theme's own file is served in place of the default", async () => {
  const res = await fetch(`${base}/assets/tokens.css`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /the themed one/);
});

test('what the theme does not have falls through to the default', async () => {
  const res = await fetch(`${base}/assets/site.css`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /\.topbar/);
  assert.equal((await fetch(`${base}/assets/no-such-file.css`)).status, 404);
});

test('nothing outside the theme folder can be reached through it', async () => {
  assert.ok([400, 403, 404].includes((await fetch(`${base}/assets/..%2Fsecret.txt`)).status));
  assert.equal(assetFile('/assets/../secret.txt').startsWith(theme), false);
});

test('a version is taken from the file actually served', () => {
  assert.equal(assetFile('/assets/tokens.css'), path.join(theme, 'tokens.css'));
  assert.match(assetFile('/assets/site.css'), /www[/\\]assets[/\\]site\.css$/);
  const version = Math.round(fs.statSync(path.join(theme, 'tokens.css')).mtimeMs).toString(36);
  assert.equal(asset('/assets/tokens.css'), `/assets/tokens.css?v=${version}`);
});
