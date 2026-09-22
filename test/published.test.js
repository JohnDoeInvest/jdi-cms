/**
 * An article's date, against a real database and the editor's own save.
 *
 * The date goes through the same bargain as a title - it waits for Publish on
 * a live article - and the save route decides when a date is a change at all,
 * so both are checked where they happen. The database is made before the
 * models are imported, because the connection opens on import, and the
 * sign-in bypass is on for this process only: requests come from this
 * machine, as they do in development.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-published-'));
process.env.DB_PATH = path.join(dir, 'cms.db');
process.env.AUTH_DISABLED = '1';
const { config } = await import('../src/config.js');
const { articles, categories, publishDue, draftView } = await import('../src/models.js');
const { run } = await import('../src/db/index.js');
const { feedFor } = await import('../src/routes/site.js');
const { createApp } = await import('../src/app.js');
const { localDay } = await import('../src/lib/util.js');

run("INSERT INTO users (email, full_name, role) VALUES (?, 'Test', 'admin')", config.devUser);
const server = await new Promise((resolve) => {
  const s = createApp().listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const text = (words) => [{ kind: 'text', props: { html: `<p>${words}</p>` } }];
const sqlOf = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const write = (title, subjects = []) =>
  articles.create({ title, blocks: text(title), category_ids: subjects }, null).id;
const day = (id) => localDay(articles.byId(id).published_at);

/** What the editor sends on every save: the body, and the fields around it. */
const save = (id, fields) => fetch(`${base}/cms/api/articles/${id}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ blocks: text('Brödtext'), ...fields }),
}).then((res) => res.json());

test('an old piece written today keeps its own date when it goes out, and sorts by it', async () => {
  const archive = categories.create('Arkiv');
  const today = write('Skrivet i dag', [archive.id]);
  articles.publish(today);
  const old = write('Från 2023', [archive.id]);
  await save(old, { published_on: '2023-05-12', status: 'published' });
  assert.equal(day(old), '2023-05-12');
  assert.deepEqual(feedFor({ categories: [archive.id], limit: 5 }, {}).items.map((a) => a.id), [today, old]);
});

test('emptied before it goes out, an article takes the day it is published', async () => {
  const id = write('Ändrade mig');
  await save(id, { published_on: '2021-06-01' });
  await save(id, { published_on: '' });
  assert.equal(articles.byId(id).published_at, null);
  await save(id, { published_on: '', status: 'published' });
  assert.equal(day(id), localDay(sqlOf(new Date())));
});

test('on a live article a new date waits for Publish, like a new title', async () => {
  const id = write('Levande');
  articles.publish(id);
  const was = articles.byId(id).published_at;

  const reply = await save(id, { published_on: '2024-01-15' });
  assert.equal(reply.hasDraftChanges, true);
  assert.equal(articles.byId(id).published_at, was);
  assert.equal(localDay(draftView(articles.byId(id)).published_at), '2024-01-15');

  await save(id, { published_on: '2024-01-15', status: 'published' });
  assert.equal(day(id), '2024-01-15');
  assert.equal(articles.byId(id).hasDraftChanges, false);
});

test('discarding drops a date that was waiting, and says a setting came back', async () => {
  const id = write('Ångrad');
  articles.publish(id);
  const was = articles.byId(id).published_at;
  await save(id, { published_on: '2020-02-02' });

  const after = articles.discardDraft(id);
  assert.equal(after.published_at, was);
  assert.equal(after.hasDraftChanges, false);
  // Which is what makes the editor reload rather than keep the date it threw away.
  assert.equal(after.settingsReset, true);
});

test('a day sent back unchanged moves nothing, down to the second', async () => {
  // Every save sends the field. Reading that as a change would move an
  // article that went out at 08:00 to midday, and reorder its day's feed.
  const id = write('Klockan åtta');
  articles.publish(id);
  const was = articles.byId(id).published_at;
  const reply = await save(id, { published_on: localDay(was), blocks: text('Klockan åtta') });
  assert.equal(reply.hasDraftChanges, false);
  assert.equal(articles.byId(id).published_at, was);
  assert.ok(!('published_at' in articles.byId(id).draftMeta));
});

test('a date the article cannot carry is refused, and the rest of the save lands', async () => {
  const id = write('Framtiden');
  articles.publish(id);
  const was = day(id);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const reply = await save(id, { published_on: localDay(sqlOf(tomorrow)), blocks: text('Ny brödtext') });
  assert.match(reply.dateRefused, /Schedule/);
  assert.equal(reply.publishedOn, was);
  assert.match(JSON.stringify(articles.byId(id).draftBlocks), /Ny brödtext/);

  // Emptying the field does not take a live article's date away either.
  assert.ok((await save(id, { published_on: '' })).dateRefused);
  assert.equal(day(id), was);
});

test('scheduled, a given date is kept, and none means the minute it was meant for', () => {
  const dated = write('Daterad');
  articles.update(dated, { published_at: '2022-03-04 11:00:00' });
  articles.schedule(dated, '2030-01-01 07:00:00');
  const plain = write('Odaterad');
  articles.schedule(plain, '2030-01-01 07:00:00');

  publishDue('2030-01-01 07:00:00');
  assert.equal(articles.byId(dated).published_at, '2022-03-04 11:00:00');
  assert.equal(articles.byId(plain).published_at, '2030-01-01 07:00:00');
});
