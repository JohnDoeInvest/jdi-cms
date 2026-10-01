/**
 * Telling a person from a script, against the real app and a real database.
 *
 * The point of each test is the *consequence* rather than the mechanism: a
 * refusal stores nothing and says one thing, a flag stores the message and
 * marks it, and the measurements land on the row so the thresholds can be
 * argued from traffic later. See NOTES, "A form should be able to tell a
 * person from a script".
 *
 * The database is made before the models are imported, because the connection
 * opens on import.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-guard-'));
process.env.DB_PATH = path.join(dir, 'cms.db');

const { pages, forms, messages } = await import('../src/models.js');
const { createApp } = await import('../src/app.js');
const {
  issue, verdict, HONEYPOT, TOKEN, EVIDENCE, resetGuard,
} = await import('../src/lib/formguard.js');
const { formFields, fieldKey } = await import('../src/views/render.js');
const { set } = await import('../src/lib/settings.js');

const server = await new Promise((resolve) => {
  const s = createApp().listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/* A form with one field, so a submission has something to carry and the
   empty-form path is never what is being measured. */
const form = forms.create('Kontakt');
forms.update(form.id, {
  objects: [{ id: 'f1', kind: 'fieldText', props: { label: 'Namn', required: true } }],
});

/* A second form whose own field is named exactly like the honeypot - the one
   false positive this must never have. */
const clash = forms.create('Krock');
forms.update(clash.id, {
  objects: [{ id: 'f1', kind: 'fieldText', props: { label: 'Webbplats', name: HONEYPOT } }],
});

const page = pages.create({
  title: 'Kontakt',
  slug: 'kontakt',
  blocks: [{
    type: 'slice',
    props: {},
    columns: [{
      objects: [
        { id: 'placed', kind: 'form', props: { formId: form.id } },
        { id: 'clashing', kind: 'form', props: { formId: clash.id } },
      ],
    }],
  }],
});
pages.publish(page.id);

const PATH = '/kontakt';
/* Old enough not to look hurried: the fill-time floor is a soft signal, and
   every test here wants to measure one thing at a time. */
const unhurried = (objId = 'placed') => issue(objId, PATH, Date.now() - 5000);

const post = (body) => fetch(`${base}/form/submit`, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(body),
});

const sent = (over = {}) => ({
  page: PATH, form: 'placed', namn: 'Macs',
  [TOKEN]: unhurried(), [EVIDENCE]: '1', ...over,
});

const latest = () => messages.list(1)[0];
const count = () => messages.list(500).length;

test.beforeEach(() => {
  resetGuard();
  set('form_guard', 'flag');
});

test('a drawn form carries a token, a trap and nothing a reader can see', async () => {
  const body = await (await fetch(base + PATH)).text();
  assert.match(body, new RegExp(`name="${TOKEN}" value="\\d+\\.`), 'a signed token');
  assert.match(body, new RegExp(`name="${EVIDENCE}"`), 'somewhere for evidence');
  assert.match(body, /class="b-form__trap" aria-hidden="true"/, 'the trap is hidden from AT');
  assert.match(body, /tabindex="-1"/, 'and out of the tab order');
  /* The trap is only hidden by the stylesheet the editor draws through too,
     so the markup itself must not go near display:none. */
  assert.ok(!body.includes('style="display:none"'));
});

test('an ordinary submission goes through and is not marked', async () => {
  const before = count();
  const res = await post(sent());
  assert.equal(res.status, 200);
  assert.equal(count(), before + 1);
  assert.equal(latest().suspect, '');
});

test('the measurements land on the row, marked or not', async () => {
  await post(sent());
  const row = latest();
  assert.ok(row.fill_ms >= 5000, `fill_ms was ${row.fill_ms}`);
  assert.equal(row.touched, 1);
});

test('a submission with no token is refused and stores nothing', async () => {
  const before = count();
  const res = await post({ page: PATH, form: 'placed', namn: 'Macs' });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /did not go through/);
  assert.equal(count(), before, 'nothing was stored');
});

test('a token signed for another form or page does not travel', async () => {
  const before = count();
  const wrongForm = await post(sent({ [TOKEN]: issue('clashing', PATH, Date.now() - 5000) }));
  assert.match(await wrongForm.text(), /did not go through/);

  const wrongPage = await post(sent({ [TOKEN]: issue('placed', '/annan', Date.now() - 5000) }));
  assert.match(await wrongPage.text(), /did not go through/);
  assert.equal(count(), before);
});

test('a token is spent once', async () => {
  const token = unhurried();
  assert.equal((await post(sent({ [TOKEN]: token }))).status, 200);
  const before = count();

  const again = await post(sent({ [TOKEN]: token }));
  assert.match(await again.text(), /did not go through/);
  assert.equal(count(), before, 'the replay stored nothing');
});

test('a filled trap is refused', async () => {
  const before = count();
  const res = await post(sent({ [HONEYPOT]: 'http://spam.example' }));
  assert.match(await res.text(), /did not go through/);
  assert.equal(count(), before);
});

test('no field an author can build is named like the trap', () => {
  /* The real guarantee, and the reason the name has an underscore in it: a
     field's posted name runs through slugify, which emits only [a-z0-9-], so
     `url_confirm` cannot be produced. The form below asks for exactly that
     name and is given `url-confirm` instead. */
  const saved = forms.byId(clash.id);
  const keys = formFields(saved).map(fieldKey);
  assert.deepEqual(keys, ['url-confirm'], 'the underscore did not survive');
  assert.ok(!keys.includes(HONEYPOT));
  assert.ok(keys.every((k) => !k.includes('_')), 'no field name can hold one');
});

test('and if one ever did collide, it is read as an answer, not a robot', () => {
  /* Belt to the braces above: should the naming rule ever change, a visitor
     filling in their own field must still not be refused. */
  const seen = verdict({
    mode: 'flag',
    objId: 'placed',
    path: PATH,
    fields: {
      [HONEYPOT]: 'macs.example',
      [TOKEN]: issue('placed', PATH, Date.now() - 5000),
      [EVIDENCE]: '1',
    },
    from: '198.51.100.7',
    honeypotLive: false,
  });
  assert.equal(seen.refuse, null);
  assert.equal(seen.suspect, null);
});

test('on flag, a soft signal travels with the message instead of stopping it', async () => {
  const before = count();
  const res = await post(sent({ [EVIDENCE]: '' }));
  assert.equal(res.status, 200);
  assert.equal(count(), before + 1, 'nothing was lost');
  assert.equal(latest().suspect, 'untouched');
  assert.equal(latest().touched, 0);
});

test('a form filled faster than anyone types is soft, not a refusal', async () => {
  const res = await post(sent({ [TOKEN]: issue('placed', PATH) }));
  assert.equal(res.status, 200);
  assert.equal(latest().suspect, 'fast');
});

test('on refuse, the same soft signal stops it', async () => {
  set('form_guard', 'refuse');
  const before = count();
  const res = await post(sent({ [EVIDENCE]: '' }));
  assert.match(await res.text(), /did not go through/);
  assert.equal(count(), before);
});

test('no setting lets an obvious bot through', async () => {
  for (const mode of ['flag', 'refuse']) {
    set('form_guard', mode);
    resetGuard();
    const before = count();
    const res = await post(sent({ [HONEYPOT]: 'spam' }));
    assert.match(await res.text(), /did not go through/, `honeypot on ${mode}`);
    assert.equal(count(), before, `stored nothing on ${mode}`);
  }
});

test('a flood from one address is cut off, and says so', async () => {
  let refused = null;
  for (let i = 0; i < 25; i++) {
    const res = await post(sent());
    const body = await res.text();
    if (/Too many submissions/.test(body)) { refused = i; break; }
  }
  assert.ok(refused !== null, 'the limit was reached');
  assert.ok(refused >= 20, `cut off after ${refused}, which is too eager`);
});
