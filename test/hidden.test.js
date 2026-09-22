/**
 * A hidden slice, against a real database and the real app.
 *
 * Hidden is a promise about everything public - the page, the forms and
 * feeds it serves, its link-preview image, the sections a link can name - so
 * each is checked where it is actually read. The database is made before the
 * models are imported, because the connection opens on import.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartaremat-hidden-'));
process.env.DB_PATH = path.join(dir, 'cms.db');
const { pages, forms, messages } = await import('../src/models.js');
const { createApp } = await import('../src/app.js');

const server = await new Promise((resolve) => {
  const s = createApp().listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const slice = (objects, props = {}) => ({ type: 'slice', props, columns: [{ objects }] });
const text = (words) => ({ kind: 'text', props: { html: `<p>${words}</p>` } });
const get = (url) => fetch(base + url, { redirect: 'manual' });

// The form has no fields, so one that is found answers with the page and an
// error rather than sending anything - which is what tells found from not.
const form = forms.create('Kontakt');
const page = pages.create({
  title: 'Kampanj', slug: 'kampanj', use_first_image: true,
  blocks: [
    slice([
      text('Hemlig text'),
      { kind: 'image', props: { media: 7 } },
      { id: 'hiddenform', kind: 'form', props: { formId: form.id } },
      { id: 'hiddenfeed', kind: 'articles', props: { more: 'button' } },
    ], { anchor: 'hemlig', hidden: true }),
    slice([
      text('Synlig text'),
      { kind: 'image', props: { media: 3 } },
      { id: 'shownform', kind: 'form', props: { formId: form.id } },
      { id: 'shownfeed', kind: 'articles', props: { more: 'button' } },
    ], { anchor: 'synlig' }),
  ],
}, null);
pages.publish(page.id);

test('a hidden slice is left out of the page, not covered up', async () => {
  const res = await get('/kampanj');
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Synlig text/);
  // Not in the markup at all: display:none would still be in view-source.
  assert.ok(!body.includes('Hemlig text'));
  assert.ok(!body.includes('id="hemlig"'));
});

test('a form in a hidden slice takes no submission', async () => {
  const post = (placed) => fetch(`${base}/form/submit`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ page: '/kampanj', form: placed }),
  });
  const shown = await post('shownform');
  assert.equal(shown.status, 200);
  assert.match(await shown.text(), /Formuläret har inga fält ännu/);

  const hidden = await post('hiddenform');
  assert.equal(hidden.status, 303);
  assert.equal(messages.list().length, 0);
});

test('a feed in a hidden slice serves nothing', async () => {
  assert.equal((await get('/api/feed?path=/kampanj&block=shownfeed&offset=0')).status, 200);
  assert.equal((await get('/api/feed?path=/kampanj&block=hiddenfeed&offset=0')).status, 404);
});

test('the link preview and the link picker skip a hidden slice', () => {
  const stored = pages.byId(page.id);
  // The hidden slice comes first and holds the first image on the page.
  assert.equal(pages.ogImage(stored), 3);
  assert.deepEqual(pages.anchors(stored).map((a) => a.id), ['synlig']);
});

test('hiding is an edit: the live page keeps the slice until it is published', async () => {
  const season = pages.create({ title: 'Säsong', slug: 'sasong', blocks: [slice([text('God jul')])] }, null);
  pages.publish(season.id);

  const draft = pages.byId(season.id).draftBlocks;
  draft[0].props.hidden = true;
  pages.update(season.id, { blocks: draft });
  assert.equal(pages.byId(season.id).hasDraftChanges, true);
  assert.match(await (await get('/sasong')).text(), /God jul/);

  pages.publish(season.id);
  assert.ok(!(await (await get('/sasong')).text()).includes('God jul'));
  // Still on the page, for the editor and the next campaign.
  assert.equal(pages.byId(season.id).draftBlocks[0].props.hidden, true);
});
