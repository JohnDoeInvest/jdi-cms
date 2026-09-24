/**
 * The backup archive, and who is allowed one.
 *
 * On a database of its own, the way a fresh clone starts. The uploads it
 * finds are whatever this working copy actually holds, so nothing here
 * asserts a file count - what is checked is the shape of the archive and the
 * rules about what may be in it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-backup-'));
process.env.DB_PATH = path.join(dir, 'cms.db');
delete process.env.AUTH_DISABLED;
const { createApp } = await import('../src/app.js');
const { ensureSeed } = await import('../src/db/seed.js');
const { buildBackup, backupSummary } = await import('../src/lib/backup.js');
const { users } = await import('../src/models.js');
const { hashPassword } = await import('../src/lib/password.js');
const settings = await import('../src/lib/settings.js');

ensureSeed();
settings.set('signin_method', 'password');
const admin = users.create({ full_name: 'Ada', email: 'ada@example.com', role: 'admin' });
users.setPasswordHash(admin.id, await hashPassword('correct-horse-admin'));
const editor = users.create({ full_name: 'Ed', email: 'ed@example.com', role: 'editor' });
users.setPasswordHash(editor.id, await hashPassword('correct-horse-editor'));

const server = await new Promise((resolve) => {
  const s = createApp().listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const signIn = async (identifier, password) => {
  const res = await fetch(`${base}/cms/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ identifier, password }).toString(),
  });
  return res.headers.get('set-cookie')?.match(/slice_session=[^;]+/)?.[0] || '';
};

/** Entry names and bytes, read back out of the central directory. */
const entriesOf = (buf) => {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  const out = [];
  let at = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(at + 10);
    const compressed = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const offset = buf.readUInt32LE(at + 42);
    const name = buf.slice(at + 46, at + 46 + nameLen).toString('utf8');
    const bodyAt = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    const body = buf.slice(bodyAt, bodyAt + compressed);
    out.push({ name, data: method === 8 ? zlib.inflateRawSync(body) : body });
    at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return out;
};

test('an archive carries the database, a manifest and a readme', () => {
  const made = buildBackup();
  const entries = entriesOf(made.data);
  const names = entries.map((e) => e.name);

  for (const wanted of ['manifest.json', 'README.txt', 'data/cms.db']) {
    assert.ok(names.includes(wanted), `missing ${wanted}`);
  }
  assert.match(made.filename, /^[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.zip$/, made.filename);
});

test('every path inside lands where it belongs, and nowhere else', () => {
  /* The archive is unpacked at the root of an installation, so a name that
     climbs out of it would write over the code. Nothing here is untrusted
     today - it is this machine's own files - but the invariant is what makes
     the restore instruction safe to give, and one day something will read an
     archive rather than write one. */
  for (const { name } of entriesOf(buildBackup().data)) {
    assert.ok(!name.startsWith('/'), `absolute: ${name}`);
    assert.ok(!name.split('/').includes('..'), `climbs out: ${name}`);
    assert.ok(!/^[a-z]:/i.test(name), `drive letter: ${name}`);
    // Only the content folders, the theme, and the two notes at the root.
    assert.ok(/^(manifest\.json|README\.txt|data\/cms\.db|theme\/|www\/(media|fonts)\/)/.test(name),
      `not a content path: ${name}`);
  }
});

test('the database in the archive opens, and matches what the manifest claims', () => {
  const made = buildBackup();
  const db = entriesOf(made.data).find((e) => e.name === 'data/cms.db');
  const manifest = JSON.parse(entriesOf(made.data).find((e) => e.name === 'manifest.json').data);

  const out = path.join(dir, 'restored.db');
  fs.writeFileSync(out, db.data);
  const copy = new DatabaseSync(out, { readOnly: true });
  assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  // The counts are the only check worth having on a file that crossed a
  // network, so they have to be true of the database beside them.
  for (const [table, n] of Object.entries(manifest.database.rows)) {
    assert.equal(copy.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, n, table);
  }
  assert.equal(manifest.format, 'slice-backup/1');
  copy.close();
});

test('nothing that ships with the repository is in a backup', () => {
  /* www/fonts holds both kinds: the faces Slice ships and anything uploaded.
     Backing up the shipped ones would restore them over a clone that already
     has them, which is harmless but says the archive does not know what it
     is for. */
  const names = entriesOf(buildBackup().data).map((e) => e.name);
  assert.ok(!names.includes('www/fonts/inter-variable.woff2'));
  assert.ok(!names.includes('www/fonts/README.md'));
  assert.ok(!names.some((n) => n.split('/').pop().startsWith('.')), 'a dotfile got in');
});

test('a theme travels inside the archive, as the folder a site looks for', async () => {
  /* "Send the archive, and also this folder, and also set an environment
     variable" is the instruction that gets half-followed, and a site restored
     without its theme comes up in the neutral default looking broken rather
     than unset. So it goes in, always as `theme/` - which is where an
     installation finds one without being told - and a restore turns a
     THEME_DIR arrangement into the plain one rather than reproducing it. */
  const themeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-theme-'));
  fs.writeFileSync(path.join(themeDir, 'tokens.css'), ':root{--accent:#ff0000}');
  fs.mkdirSync(path.join(themeDir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(themeDir, '.git', 'HEAD'), 'ref: refs/heads/main');

  const { config } = await import('../src/config.js');
  const wasTheme = config.paths.theme;
  config.paths.theme = themeDir;
  try {
    const names = entriesOf(buildBackup().data).map((e) => e.name);
    assert.ok(names.includes('theme/tokens.css'), 'the theme should be in the archive');
    // Its history belongs to its own repository, not to a copy of a site.
    assert.ok(!names.some((n) => n.includes('.git')), 'the theme .git got in');

    const manifest = JSON.parse(
      entriesOf(buildBackup().data).find((e) => e.name === 'manifest.json').data);
    assert.equal(manifest.theme.at, 'theme/');
    assert.equal(manifest.theme.files, 1);
    // Where it happened to live is recorded, and deliberately not reproduced.
    assert.equal(manifest.theme.wasAt, themeDir);
  } finally {
    config.paths.theme = wasTheme;
    fs.rmSync(themeDir, { recursive: true, force: true });
  }
});

test('with no theme of its own, an archive says so rather than going quiet', async () => {
  /* Said explicitly rather than assumed: this suite ships with the code and
     runs in real deployments, and a deployment is exactly the checkout that
     *has* a theme/ folder. Read off the environment, this passed on a
     developer's copy and failed on the site - which is the wrong way round
     for a test to be wrong. */
  const { config } = await import('../src/config.js');
  const wasTheme = config.paths.theme;
  config.paths.theme = '';
  try {
    const made = buildBackup();
    const manifest = JSON.parse(entriesOf(made.data).find((e) => e.name === 'manifest.json').data);
    assert.equal(manifest.theme, null);
    const readme = entriesOf(made.data).find((e) => e.name === 'README.txt').data.toString();
    assert.match(readme, /default theme/);
  } finally {
    config.paths.theme = wasTheme;
  }
});

test('the summary can be taken without building an archive', () => {
  // It is drawn on the settings screen, so it must not cost a backup.
  const summary = backupSummary();
  assert.equal(typeof summary.bytes, 'number');
  assert.ok(summary.bytes > 0);
  assert.equal(summary.rows.pages, 4, 'the seed makes four pages');
});

test('a backup is an administrator’s to take, and nobody else’s', async () => {
  /* Not because it changes anything - it changes nothing - but because it
     contains everything: the users table and every message a visitor sent. */
  const out = await fetch(`${base}/cms/settings/backup`, { redirect: 'manual' });
  assert.equal(out.status, 303, 'signed out should be sent to sign-in');

  const asEditor = await fetch(`${base}/cms/settings/backup`, {
    redirect: 'manual', headers: { Cookie: await signIn('ed@example.com', 'correct-horse-editor') },
  });
  assert.equal(asEditor.status, 403);

  const asAdmin = await fetch(`${base}/cms/settings/backup`, {
    redirect: 'manual', headers: { Cookie: await signIn('ada@example.com', 'correct-horse-admin') },
  });
  assert.equal(asAdmin.status, 200);
  assert.equal(asAdmin.headers.get('content-type'), 'application/zip');
  assert.match(asAdmin.headers.get('content-disposition'), /^attachment; filename="[^"]+\.zip"$/);
  // Never a cached copy of yesterday's content.
  assert.equal(asAdmin.headers.get('cache-control'), 'no-store');

  const body = Buffer.from(await asAdmin.arrayBuffer());
  assert.equal(body.length, Number(asAdmin.headers.get('content-length')));
  assert.ok(entriesOf(body).some((e) => e.name === 'data/cms.db'), 'the download is a real archive');
});
