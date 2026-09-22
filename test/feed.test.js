/**
 * What an article feed draws, against a real database.
 *
 * A random feed's pick is made in SQL, so it is checked on a throwaway
 * database rather than on a stand-in. It is made before the models are
 * imported, because the connection opens on import.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartaremat-feed-'));
process.env.DB_PATH = path.join(dir, 'cms.db');
const { articles, categories } = await import('../src/models.js');
const { feedFor } = await import('../src/routes/site.js');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const text = (words) => [{ kind: 'text', props: { html: `<p>${words}</p>` } }];
const publish = (title, subjects) => {
  const { id } = articles.create({ title, blocks: text(title), category_ids: subjects }, null);
  articles.publish(id);
  return id;
};

const portraits = categories.create('Porträtt');
const production = categories.create('Produktion');
const first = publish('Möt Mattias', [portraits.id]);
const second = publish('Möt Per', [portraits.id]);
publish('Ny linje', [production.id]);

const ids = (feed) => feed.items.map((a) => a.id);

test('a random feed makes a new pick from its own subjects on every load', () => {
  const props = { categories: [portraits.id], limit: 1, order: 'random' };
  const seen = new Set();
  for (let i = 0; i < 60; i += 1) {
    const picked = ids(feedFor(props, {}));
    assert.equal(picked.length, 1);
    seen.add(picked[0]);
  }
  // Both portraits come up and nothing from another subject does. Sixty
  // draws from two miss one by chance once in 2^59 runs.
  assert.deepEqual([...seen].sort(), [first, second].sort());
});

test('a random feed asked for more than there are shows each one once', () => {
  const picked = ids(feedFor({ categories: [], limit: 12, order: 'random' }, {}));
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
});

test('a feed is still newest first unless it asks otherwise', () => {
  assert.deepEqual(ids(feedFor({ categories: [portraits.id], limit: 2 }, {})), [second, first]);
});
