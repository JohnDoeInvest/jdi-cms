/**
 * Preview links, against a real database and the site's own routes.
 *
 * The link is the permission, so the checks that matter are the ones made as
 * somebody who is *not* signed in. The sign-in bypass is on for this process,
 * which signs in every request from this machine - so a stranger is a request
 * that arrives relayed, which is exactly what the bypass refuses (see
 * `fromThisMachine`). Same server, two visitors.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-preview-'));
process.env.DB_PATH = path.join(dir, 'cms.db');
process.env.AUTH_DISABLED = '1';
const { pages, articles, previews, publishDue } = await import('../src/models.js');
const { run, get } = await import('../src/db/index.js');
const { createApp } = await import('../src/app.js');
const settings = await import('../src/lib/settings.js');

run("INSERT INTO users (email, full_name, role) VALUES ('test@example.com', 'Test', 'admin')");
const server = await new Promise((resolve) => {
  const s = createApp().listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const text = (words) => [{ kind: 'text', props: { html: `<p>${words}</p>` } }];
let n = 0;
const write = (title) => articles.create({ title, slug: `artikel-${(n += 1)}`, blocks: text(title) }, null).id;

/** Somebody with the link and no account. */
const stranger = (url) => fetch(base + url, { redirect: 'manual', headers: { 'X-Forwarded-For': '203.0.113.9' } });
/** The person who wrote it, signed in. */
const editor = (url, opts = {}) => fetch(base + url, { redirect: 'manual', ...opts });
const save = (kind, id, fields) => editor(`/cms/api/${kind}/${id}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ blocks: text('Ändrad'), ...fields }),
}).then((res) => res.json());

test('the link shows the draft to somebody who is not signed in', async () => {
  const id = write('Utkast till partnern');
  const link = previews.path('article', id);
  assert.match(link, /^\/preview\/[A-Za-z0-9_-]{24}$/);

  const res = await stranger(link);
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.ok(body.includes('Utkast till partnern'));
  assert.ok(body.includes('This has not been published yet'));
  // No way into the editor: it would only show them a sign-in page.
  assert.ok(!body.includes('Back to the editor'));
  assert.ok(!body.includes(`/cms/articles/${id}/edit`));
  // Not a reader, not for a search engine, not for a cache.
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(get('SELECT views FROM articles WHERE id = ?', id).views, 0);
});

test('the same link, signed in, is the editor\'s own view with its way back', async () => {
  const id = write('Mitt eget');
  const body = await (await editor(previews.path('article', id))).text();
  assert.ok(body.includes('Back to the editor'));
});

test('one link per round of changes: asking again gives the same one', () => {
  const id = write('Samma länk');
  assert.equal(previews.path('article', id), previews.path('article', id));
});

test('publishing ends the link, forwards it to the article, and the editor gets a new one', async () => {
  const id = write('Går ut');
  const before = previews.path('article', id);
  const state = await save('articles', id, { status: 'published' });
  assert.ok(state.preview && state.preview !== before, 'the editor is handed the next link');

  const res = await stranger(before);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), articles.byId(id).permalink);

  // The next round's link says what it is showing, and then shows it.
  assert.ok((await (await stranger(state.preview)).text()).includes('This matches what is published.'));
  await save('articles', id, { blocks: text('Andra omgången') });
  const next = await (await stranger(state.preview)).text();
  assert.ok(next.includes('Andra omgången'));
  assert.ok(next.includes('This shows changes that have not been published yet.'));
});

test('a forwarded link stops forwarding when the article is taken down', async () => {
  const id = write('Tas ner');
  const before = previews.path('article', id);
  articles.publish(id);
  articles.unpublish(id);
  const res = await stranger(before);
  assert.equal(res.status, 410);
  assert.ok((await res.text()).includes('This preview has ended'));
});

test('a new link cuts the old one off without a forward, even once published', async () => {
  const id = write('Fel mottagare');
  const before = previews.path('article', id);
  const { preview } = await (await editor(`/cms/api/articles/${id}/preview-link`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}',
  })).json();
  assert.notEqual(preview, before);
  articles.publish(id);
  assert.equal((await stranger(before)).status, 410);
});

test('a scheduled publish ends the link too', async () => {
  const id = write('Schemalagd');
  const before = previews.path('article', id);
  articles.schedule(id, '2030-01-01 07:00:00');
  publishDue('2030-01-01 07:00:00');
  assert.equal((await stranger(before)).status, 303);
});

test('a page has one as well, and it opens through the page\'s password', async () => {
  const page = pages.create({ title: 'Låst', slug: 'last', blocks: text('Bakom lösenord') }, null);
  pages.update(page.id, { password: 'hemligt' });
  pages.publish(page.id);
  pages.update(page.id, { blocks: text('Nytt bakom lösenord') });

  // The live page asks for the password; the link does not.
  assert.ok(!(await (await stranger('/last')).text()).includes('Bakom lösenord'));
  const body = await (await stranger(previews.path('page', page.id))).text();
  assert.ok(body.includes('Nytt bakom lösenord'));
  assert.equal(get('SELECT views FROM pages WHERE id = ?', page.id).views, 0);
});

test('the old View addresses go to the link', async () => {
  const id = write('Gammal adress');
  const res = await editor(`/cms/articles/${id}/preview`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), previews.path('article', id));

  const page = pages.create({ title: 'Gammal sida', slug: 'gammal-sida', blocks: text('x') }, null);
  assert.equal((await editor(`/cms/preview/${page.id}`)).headers.get('location'), previews.path('page', page.id));
});

test('a link nobody issued is simply not found, and deleting the article ends its links', async () => {
  assert.equal((await stranger('/preview/AAAAAAAAAAAAAAAAAAAAAAAA')).status, 404);
  assert.equal((await stranger('/preview/not-a-token')).status, 404);
  const id = write('Raderas');
  const link = previews.path('article', id);
  articles.remove(id);
  assert.equal((await stranger(link)).status, 404);
});

test('the reader sees the site\'s own language', async () => {
  const was = settings.get('site_language');
  settings.set('site_language', 'sv');
  try {
    const id = write('På svenska');
    const body = await (await stranger(previews.path('article', id))).text();
    assert.ok(body.includes('Förhandsvisning'));
  } finally {
    settings.set('site_language', was);
  }
});
