/**
 * Scheduled publishing, against a real database.
 *
 * The rules live in SQL as much as in JavaScript - the copy that goes out,
 * the cascade, the settings a document writes straight to its row - so they
 * are checked on a throwaway database rather than on stand-ins. It is made
 * before the models are imported, because the connection opens on import.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-schedule-'));
process.env.DB_PATH = path.join(dir, 'cms.db');
const { pages, articles, categories, publishDue, draftView } = await import('../src/models.js');
const { all, get } = await import('../src/db/index.js');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const text = (words) => [{ kind: 'text', props: { html: `<p>${words}</p>` } }];
const words = (blocks) => blocks[0]?.columns[0]?.objects[0]?.props.html;
let n = 0;
const page = (title = 'Kampanj') => pages.create({ title, slug: `sida-${(n += 1)}`, blocks: text('Ett') }, null);

const AT = '2030-01-01 07:00:00';
const BEFORE = '2030-01-01 06:59:59';

test('what goes out is the draft as it was when Schedule was pressed', () => {
  const { id } = page();
  pages.schedule(id, AT);
  // The editor goes on autosaving: a new body, a new title, somewhere else.
  pages.update(id, { title: 'Kampanj, omskriven', blocks: text('Två') });
  assert.equal(pages.byId(id).schedule.edited, true);

  publishDue(BEFORE);
  assert.equal(pages.byId(id).status, 'draft');

  assert.ok(publishDue(AT) >= 1);
  const live = pages.byId(id);
  assert.equal(live.status, 'published');
  assert.equal(live.schedule, null);
  assert.equal(live.title, 'Kampanj');
  assert.equal(words(live.blocks), '<p>Ett</p>');

  // The later work is neither lost nor published: it is what Live · edited means.
  assert.equal(live.hasDraftChanges, true);
  assert.equal(words(live.draftBlocks), '<p>Två</p>');
  assert.equal(draftView(live).title, 'Kampanj, omskriven');
});

test('it goes out dated for the minute it was meant for, and nobody edited it', () => {
  const { id } = page();
  pages.update(id, { blocks: text('Ett') });
  const edited = pages.byId(id).updated_at;
  pages.schedule(id, AT);
  publishDue('2030-01-01 09:15:00');     // the server was down at seven
  const live = pages.byId(id);
  assert.equal(live.published_at, AT);
  assert.equal(live.updated_at, edited);
});

test('a live page can have its changes scheduled, and keeps its public face until then', () => {
  const { id } = page();
  pages.publish(id);
  pages.update(id, { title: 'Nytt namn', blocks: text('Nytt') });
  pages.schedule(id, AT);
  const waiting = pages.byId(id);
  assert.equal(waiting.title, 'Kampanj');
  assert.equal(words(waiting.blocks), '<p>Ett</p>');
  assert.equal(waiting.schedule.edited, false);

  publishDue(AT);
  const live = pages.byId(id);
  assert.equal(live.title, 'Nytt namn');
  assert.equal(words(live.blocks), '<p>Nytt</p>');
  assert.equal(live.hasDraftChanges, false);
  assert.deepEqual(live.draftMeta, {});
});

test('a scheduled address is frozen, and removing the schedule frees it', () => {
  const { id, permalink } = page();
  pages.schedule(id, AT);
  assert.equal(pages.update(id, { slug: 'flyttad' }).permalink, permalink);
  pages.unschedule(id);
  assert.equal(pages.update(id, { slug: 'flyttad' }).permalink, '/flyttad');
});

test('publishing now and taking down both call a schedule off', () => {
  const now = page();
  pages.schedule(now.id, AT);
  pages.update(now.id, { blocks: text('Senare') });
  const published = pages.publish(now.id);
  assert.equal(published.schedule, null);
  // What is on the screen went out - not the older scheduled copy, which
  // must not come back over it when its minute arrives.
  assert.equal(words(published.blocks), '<p>Senare</p>');
  publishDue(AT);
  assert.equal(words(pages.byId(now.id).blocks), '<p>Senare</p>');

  const down = page();
  pages.publish(down.id);
  pages.update(down.id, { blocks: text('Uppdatering') });
  pages.schedule(down.id, AT);
  assert.equal(pages.unpublish(down.id).schedule, null);
  publishDue(AT);
  assert.equal(pages.byId(down.id).status, 'draft', 'a page taken down came back by itself');
});

test('discarding goes back to the scheduled copy, settings included', () => {
  // Not live: the settings are on the row, so they go back there.
  const draft = page();
  pages.schedule(draft.id, AT);
  pages.update(draft.id, { title: 'Slarv', blocks: text('Slarv') });
  const back = pages.discardDraft(draft.id);
  assert.equal(back.title, 'Kampanj');
  assert.equal(words(back.draftBlocks), '<p>Ett</p>');
  assert.equal(back.schedule.edited, false);
  assert.equal(back.settingsReset, true);

  // Live: the scheduled settings wait in draft_meta over the live ones.
  const live = page();
  pages.publish(live.id);
  pages.update(live.id, { title: 'Planerad' });
  pages.schedule(live.id, AT);
  pages.update(live.id, { title: 'Slarv' });
  const again = pages.discardDraft(live.id);
  assert.equal(again.title, 'Kampanj');
  assert.deepEqual(again.draftMeta, { title: 'Planerad' });
  assert.equal(again.settingsReset, true);

  // Blocks alone: nothing in the fields needs redrawing.
  pages.update(live.id, { blocks: text('Bara text') });
  assert.equal(pages.discardDraft(live.id).settingsReset, false);
});

test('discarding without a schedule says when a setting came back', () => {
  // The editor's fields hold the thrown-away values and its next autosave
  // would send them straight back, so it has to know to reload.
  const { id } = page();
  pages.publish(id);
  pages.update(id, { meta_description: 'Kastas' });
  assert.equal(pages.discardDraft(id).settingsReset, true);
  assert.equal(pages.discardDraft(id).settingsReset, false);
});

test('an article goes out with the subjects it was scheduled with', () => {
  const one = categories.create('Produktion');
  const two = categories.create('Forskning');
  const { id } = articles.create({ title: 'Nyhet', blocks: text('Nyhet'), category_ids: [one.id] }, null);
  articles.schedule(id, AT);
  assert.deepEqual(articles.byId(id).schedule.meta.category_ids, [one.id]);

  articles.update(id, { category_ids: [two.id, one.id] });
  assert.equal(articles.byId(id).schedule.edited, true);

  publishDue(AT);
  const live = articles.byId(id);
  assert.equal(live.status, 'published');
  assert.deepEqual(live.categories.map((c) => c.id), [one.id]);
  assert.deepEqual(live.draftMeta.category_ids, [two.id, one.id]);
});

test('the articles list says Live · edited, and lays nothing pending over a feed', () => {
  const { id } = articles.create({ title: 'Ute', blocks: text('Ute') }, null);
  articles.publish(id);
  articles.update(id, { title: 'Ute, ändrad' });
  const row = articles.list({ status: 'published' }).find((a) => a.id === id);
  assert.equal(row.hasDraftChanges, true);
  assert.equal(row.title, 'Ute');
  assert.equal(draftView(row).title, 'Ute, ändrad');
});

test('a schedule goes with its document', () => {
  const { id } = page();
  pages.schedule(id, AT);
  const article = articles.create({ title: 'Borta' }, null);
  articles.schedule(article.id, AT);
  pages.remove(id);
  articles.remove(article.id);
  assert.equal(get('SELECT COUNT(*) AS n FROM schedules WHERE page_id = ? OR article_id = ?', id, article.id).n, 0);
});

test('scheduling again replaces the copy rather than adding one', () => {
  const { id } = page();
  pages.schedule(id, AT);
  pages.update(id, { blocks: text('Nyare') });
  pages.schedule(id, '2030-02-01 07:00:00');
  const rows = all('SELECT publish_at, content FROM schedules WHERE page_id = ?', id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].publish_at, '2030-02-01 07:00:00');
  assert.equal(pages.byId(id).schedule.edited, false);
  publishDue(AT);
  assert.equal(pages.byId(id).status, 'draft', 'went out at the time it was moved from');
});
