/**
 * End-to-end checks against a running stack.
 *
 *   ./start.sh          # in one terminal
 *   npm run test:e2e    # in another
 *
 * Everything is created under a per-run tag and deleted again at the end, so
 * the suite can be run repeatedly without leaving anything behind. Use
 * `npm run test:clean` if an interrupted run ever does leave leftovers.
 */

const BASE = process.env.SITE_URL || 'http://localhost:8080';
const TAG = `E2E-${Date.now().toString(36)}`;

let pass = 0;
let fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${extra}`); }
};

/* The suite signs in for real rather than relying on the login bypass, which
   is off by default now and refused for anything but a local request anyway.
   It is worth more this way: the one flow nothing else exercises is the one
   standing between the internet and everything below. */
let session = '';

const req = async (path, opts = {}) => {
  const res = await fetch(BASE + path, {
    redirect: 'manual',
    ...opts,
    headers: {
      Accept: 'application/json',
      ...(session ? { Cookie: `slice_session=${session}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, location: res.headers.get('location'), raw: res };
};
const postJson = (path, data) =>
  req(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const postForm = (path, obj) =>
  req(path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(obj).toString() });
const idFrom = (location, segment) => Number(location?.match(new RegExp(`${segment}/(\\d+)`))?.[1] || 0);

/* A CMS screen, as HTML, signed in. The public-site fetches below stay bare
   on purpose: those pages have to work for somebody who is not signed in, and
   sending a session with them would stop the suite from noticing if they
   ever stopped. */
const cmsHtml = (path, extra = {}) =>
  fetch(BASE + path, {
    headers: {
      ...extra,
      // The session always goes last so a caller's own Cookie cannot drop it.
      Cookie: `slice_session=${session}${extra.Cookie ? `; ${extra.Cookie}` : ''}`,
    },
  }).then((x) => x.text());

const created = { pages: [], articles: [], slices: [], menus: [], categories: [], forms: [] };

/* ------------------------------------------------------------------- login */
console.log('\n== Sign in ==');
{
  /* E2E_EMAIL and E2E_PASSWORD sign in with a password. Without a password
     the suite asks for a one-time code, which needs the sign-in method in
     Settings to allow codes. */
  const who = process.env.E2E_EMAIL || process.env.DEV_USER || '';
  const password = process.env.E2E_PASSWORD || '';
  if (!who) {
    console.error('  Set E2E_EMAIL (and E2E_PASSWORD) to an admin of the server under test.');
    process.exit(1);
  }
  const start = await fetch(`${BASE}/cms/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(password
      ? { identifier: who, password }
      : { identifier: who, via: 'code' }).toString(),
  });
  if (password) {
    session = start.headers.get('set-cookie')?.match(/slice_session=([^;]+)/)?.[1] || '';
    ok('the password buys a session', !!session);
  }
  const page = password ? '' : await start.text();
  /* Shown on the page only when no mail key is configured and only to a local
     request - which is exactly the shape of a machine running this suite. */
  const code = page.match(/the code is <strong>(\d+)</)?.[1];
  if (!password) ok('a code is issued', !!code, code ? '' : 'no code on the page — is BREVO_API_KEY set, or are codes off in Settings?');

  if (code) {
    const verify = await fetch(`${BASE}/cms/verify`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ identifier: who, code }).toString(),
    });
    session = verify.headers.get('set-cookie')?.match(/slice_session=([^;]+)/)?.[1] || '';
    ok('the code buys a session', !!session);
  }

  const guarded = await fetch(`${BASE}/cms/users`, { redirect: 'manual' });
  ok('and the CMS is shut without one', guarded.status === 303, `status ${guarded.status}`);
}

/* ------------------------------------------------------------------ slices */
console.log(`\n== Slices (tag ${TAG}) ==`);
let r = await postJson('/cms/api/slices', {
  name: `${TAG} slice`,
  definition: {
    props: { ratio: '67-33', gap: 'large', width: 'half' },
    columns: [
      {
        align: 'center',
        valign: 'middle',
        style: { padding: { top: 12 } },
        objects: [
          { kind: 'heading', props: { text: 'Rubrik', align: 'center' }, style: { margin: { top: 24 } } },
          { kind: 'text', props: { html: '<p>Text <strong>fet</strong></p>' } },
        ],
      },
      { objects: [{ kind: 'heading', props: { text: 'Höger', level: 'h3' } }] },
    ],
  },
});
ok('save slice', r.status === 200 && r.body.id, JSON.stringify(r.body));
const sliceId = r.body.id;
created.slices.push(sliceId);

r = await req(`/cms/api/slices/${sliceId}`);
const def = r.body.definition;
ok('slice reads back', r.status === 200 && def?.columns?.length === 2);
ok('layout survives the round trip',
  def.props.ratio === '67-33' && def.props.gap === 'large' && def.props.width === 'half');
ok('column settings survive',
  def.columns[0].align === 'center' && def.columns[0].valign === 'middle'
  && def.columns[0].style.padding.top === 12);
ok('objects land in the right columns',
  def.columns[0].objects.length === 2 && def.columns[1].objects[0].props.text === 'Höger');
ok('spacing survives', def.columns[0].objects[0]?.style?.margin?.top === 24);

r = await postJson('/cms/api/slices', {
  id: sliceId, name: `${TAG} slice`,
  definition: { columns: [{ objects: [{ kind: 'heading', props: { text: 'Uppdaterad' } }] }] },
});
ok('overwrite existing slice', r.status === 200 && r.body.updated === true);
r = await req(`/cms/api/slices/${sliceId}`);
ok('overwrite took effect',
  r.body.definition.columns.length === 1
  && r.body.definition.columns[0].objects[0].props.text === 'Uppdaterad');

ok('empty name rejected', (await postJson('/cms/api/slices', { name: '', blocks: [] })).status === 400);
ok('empty block rejected', (await postJson('/cms/api/slices', { name: 'Tom', blocks: [] })).status === 400);
ok('slice designer page is gone', (await req('/cms/slices')).status === 404);

/* ------------------------------------------------------------------- pages */
console.log('\n== Pages ==');
const permalink = `/${TAG.toLowerCase()}-sida`;
/* A page's address is a parent and a slug now, never a typed path - there is
   no permalink field on the form to send. */
r = await postForm('/cms/pages', {
  title: `${TAG} sida`, meta_description: 'Beskrivning',
  slug: permalink.slice(1), use_first_image: '1',
});
ok('create page', r.status === 303 && /\/cms\/pages\/\d+\/edit/.test(r.location), r.location);
const pageId = idFrom(r.location, 'pages');
created.pages.push(pageId);

/* A form exists once and pages point at it, so it is made before the page
   that carries it - on its own screen, with the same canvas and the palette
   cut down to what belongs in a form. */
r = await postForm('/cms/forms', { name: `${TAG} formulär` });
const contactFormId = idFrom(r.location, 'forms');
ok('create form', contactFormId > 0, r.location);
created.forms.push(contactFormId);
r = await postJson(`/cms/api/forms/${contactFormId}`, {
  recipient: 'inbox@exempel.se',
  subject: 'E2E',
  success_message: 'Tack!',
  submit_label: 'Skicka meddelande',
  colour: 'brand',
  /* A flat set, not a stack of slices: a form is a list of questions, so the
     canvas wraps it in one slice for its own convenience and the save
     unwraps it again. */
  blocks: [{ type: 'slice', columns: [{ objects: [
    { kind: 'fieldEmail', props: { label: 'Din e-post', name: 'epost', required: true } },
    { kind: 'fieldTextarea', props: { label: 'Meddelande', name: 'meddelande', required: true } },
    { kind: 'fieldRadio', props: { label: 'Ärende', options: 'Fråga\nOffert' } },
    { kind: 'fieldPhone', props: { label: 'Telefon', name: 'telefon', prefix: 'SE' } },
    // The palette does not offer these, so the server refuses them too.
    { kind: 'table', props: { rows: 1, cols: 1 } },
    { kind: 'articles', props: {} },
  ] }] }],
});
ok('the form saves its fields and its destination', r.status === 200);

r = await postJson(`/cms/api/pages/${pageId}`, {
  status: 'published',
  blocks: [
    { type: 'slice', sliceId, name: `${TAG} slice`, objects: [
      { kind: 'heading', props: { text: 'Publicerad rubrik', align: 'center' } },
      { kind: 'text', props: { html: '<p>Publicerad text</p><script>alert(1)</script>' } },
    ] },
    { type: 'object', object: { kind: 'quote', props: { text: 'Ett citat', source: 'Källa' } } },
    { type: 'object', object: { kind: 'form', props: { formId: contactFormId } } },
  ],
});
ok('publish page', r.status === 200 && r.body.status === 'published', JSON.stringify(r.body));

const page = await fetch(BASE + permalink).then((x) => x.text());
ok('renders heading', page.includes('Publicerad rubrik'));
ok('renders quote', page.includes('Ett citat') && page.includes('Källa'));
ok('strips injected script', !page.includes('alert(1)'));
/* Drawn from the form, not from the page: the page stores one number. */
ok('renders the form', page.includes('Skicka meddelande') && page.includes('Din e-post'));
ok('the submit button takes the form\u2019s colour', page.includes('b-button__el--c-brand'));
ok('a form refuses what its palette does not offer',
  !page.includes('b-table') && !page.includes('article-feed'));
ok('a choice field draws as a radio group', page.includes('type="radio"') && page.includes('Offert'));
/* A form is not a band: it flows in whatever holds it, so nothing about a
   slice comes with it. */
ok('a form brings no slice of its own', !page.split('<form class="b-form"')[1].startsWith('</form>')
  && !page.split('<form class="b-form"')[1].split('</form>')[0].includes('b-slice'));
ok('has breadcrumbs', page.includes('aria-label="Breadcrumbs"'));
ok('has meta description', page.includes('content="Beskrivning"'));

/* A browser is handed a fresh, single-use token with every drawn form, so
   the suite has to be too: re-read the page, lift the token out of it, and
   post that one. Posting the same token twice is refused on purpose, which
   is why this re-reads rather than keeping one. `interaction` is what
   site.js sets the moment anything human happens. */
const submitForm = async (obj) => {
  const drawn = String((await req(obj.page)).body);
  const issued = drawn.match(/name="issued" value="([^"]+)"/)?.[1] || '';
  return postForm('/form/submit', { ...obj, issued, interaction: '1' });
};

/* ------------------------------------------------------------ contact form */
console.log('\n== Forms ==');
const formId = page.match(/name="form" value="([a-f0-9]+)"/)?.[1];
ok('form id present in markup', !!formId, String(formId));
r = await submitForm({ page: permalink, form: formId,
  epost: 'test@exempel.se', meddelande: 'Ett testmeddelande.' });
ok('accepts a valid submission', r.status === 200 && String(r.body).includes('Tack!'));
r = await submitForm({ page: permalink, form: formId, epost: 'trasig', meddelande: '' });
ok('rejects an invalid one', String(r.body).includes('Please fill in:'));
ok('names the offending fields', String(r.body).includes('Meddelande'));

/* The guard itself, from outside: a post that never saw the form is refused,
   and says the one thing it says for every refusal. */
r = await postForm('/form/submit', { page: permalink, form: formId,
  epost: 'bot@exempel.se', meddelande: 'Direkt POST.' });
ok('an unsigned submission is refused', String(r.body).includes('gick inte igenom')
  || String(r.body).includes('did not go through'), String(r.status));

/* A phone field is a select and an input answering together. What is stored
   is the one number they make, so a Swedish number written the Swedish way
   arrives dialable from anywhere. */
ok('the phone field draws its prefix beside its number',
  page.includes('name="telefon_prefix"') && page.includes('name="telefon"'));
ok('the prefix list starts on the country the field was given',
  /<option value="SE" selected>/.test(page));
ok('and does not carry the prefix left out on purpose', !page.includes('(+972)'));
r = await submitForm({ page: permalink, form: formId,
  epost: 'test@exempel.se', meddelande: 'Med telefon.',
  telefon_prefix: 'SE', telefon: '070-123 45 67' });
ok('accepts a locally written number', r.status === 200 && String(r.body).includes('Tack!'));
r = await submitForm({ page: permalink, form: formId,
  epost: 'test@exempel.se', meddelande: 'Med skräp.',
  telefon_prefix: 'SE', telefon: '12' });
ok('rejects one too short to dial', String(r.body).includes('Telefon'));
r = await submitForm({ page: permalink, form: formId,
  epost: 'test@exempel.se', meddelande: 'Med eget prefix.',
  telefon_prefix: 'SE', telefon: '+44 20 7123 4567' });
ok('a number written in full keeps its own country',
  r.status === 200 && String(r.body).includes('Tack!'));

/* One form, two pages, one set of fields - the whole reason it moved out of
   the page. Renaming the button on the form changes both. */
r = await postForm('/cms/pages', { title: `${TAG} andra`, slug: `${permalink.slice(1)}-andra` });
const secondPageId = idFrom(r.location, 'pages');
created.pages.push(secondPageId);
await postJson(`/cms/api/pages/${secondPageId}`, {
  status: 'published',
  blocks: [{ type: 'object', object: { kind: 'form', props: { formId: contactFormId } } }],
});
await postJson(`/cms/api/forms/${contactFormId}`, { submit_label: 'Sänd' });
const bothPages = await Promise.all([permalink, `${permalink}-andra`]
  .map((path) => fetch(BASE + path).then((x) => x.text())));
ok('one form on two pages is one form', bothPages.every((html) => html.includes('Sänd')));
r = await req(`/cms/api/forms/${contactFormId}/usage`);
ok('a form knows what it is on', r.status === 200 && r.body.pages.length === 2,
  JSON.stringify(r.body));
await postJson(`/cms/api/forms/${contactFormId}`, { submit_label: 'Skicka meddelande' });

/* Sorting lives in the URL so it survives a reload and composes with the
   search box, which reloads the page. */
let sorted = await cmsHtml('/cms/pages?sort=title&dir=asc');
const titlesIn = (html) => [...html.matchAll(/class="cell-link truncate" href="[^"]*">([^<]*)</g)]
  .map((m) => m[1]);
const asc = titlesIn(sorted);
sorted = await cmsHtml('/cms/pages?sort=title&dir=desc');
const desc = titlesIn(sorted);
ok('the pages list sorts by title', asc.length > 1 && asc.join() === [...desc].reverse().join(),
  `${asc[0]} … ${desc[0]}`);
ok('and the header offers the other direction',
  sorted.includes('sort=title&amp;dir=asc') || sorted.includes('sort=title&dir=asc'));
sorted = await cmsHtml('/cms/pages?q=e2e&sort=title&dir=asc');
ok('a sort link keeps the search it was made under',
  sorted.includes('q=e2e'), 'search dropped');

/* And the choice outlives the visit: the nav rail links to /cms/pages with no
   query string, so without a cookie the list starts over every time. */
r = await req('/cms/pages?sort=title&dir=desc');
const sortCookieHeader = String(r.raw.headers.get('set-cookie') || '');
ok('choosing a sort sets the cookie that remembers it',
  /sm_sort_pages=title(%3A|:)desc/.test(sortCookieHeader), sortCookieHeader);
const remembered = await cmsHtml('/cms/pages', { Cookie: 'sm_sort_pages=title:desc' });
ok('and a bare list opens in it', titlesIn(remembered)[0] === desc[0],
  `${titlesIn(remembered)[0]} vs ${desc[0]}`);
const overridden = await cmsHtml('/cms/pages?sort=title&dir=asc', { Cookie: 'sm_sort_pages=title:desc' });
ok('a link that says otherwise still wins', titlesIn(overridden)[0] === asc[0],
  `${titlesIn(overridden)[0]} vs ${asc[0]}`);
const junk = await cmsHtml('/cms/pages', { Cookie: 'sm_sort_pages=drop%20table:asc' });
ok('and a nonsense cookie falls back rather than reaching the query',
  titlesIn(junk).length === asc.length, String(titlesIn(junk).length));

/* Autosave, not auto-publish. The split used to cover blocks alone, so a
   title typed into a live page was on the public site before the keystroke
   finished and Publish had nothing left to do. */
r = await postForm('/cms/pages', { title: `${TAG} levande`, slug: 'levande', page_type: 'default' });
const livePageId = idFrom(r.location, 'pages');
created.pages.push(livePageId);
await postJson(`/cms/api/pages/${livePageId}`, { blocks: [], status: 'published' });
const publicPage = () => fetch(`${BASE}/levande`).then((x) => x.text());
ok('a published page shows its title', (await publicPage()).includes(`${TAG} levande`));

await postJson(`/cms/api/pages/${livePageId}`, {
  blocks: [], title: 'ASDF placeholder', meta_description: 'lorem ipsum',
});
let out = await publicPage();
ok('a title typed into it does not reach the site',
  !out.includes('ASDF placeholder') && out.includes(`${TAG} levande`), 'leaked');
ok('nor does a meta description', !out.includes('lorem ipsum'), 'leaked');

const editing = await cmsHtml(`/cms/pages/${livePageId}/edit`);
ok('but the editor shows what is being typed', editing.includes('ASDF placeholder'));

/* And so does the preview, which is the whole of what it is for. It used to
   swap in the draft blocks and read everything else from the live row, so it
   showed the published title and page type while claiming to show what
   Publish was about to do. */
let preview = await cmsHtml(`/cms/preview/${livePageId}`);
ok('and so does the preview', preview.includes('ASDF placeholder'), 'preview shows the live title');
await postJson(`/cms/api/pages/${livePageId}`, { blocks: [], page_type: 'blank' });
preview = await cmsHtml(`/cms/preview/${livePageId}`);
ok('a pending page type reaches the preview',
  !preview.includes('<nav class="breadcrumbs"'), 'preview kept the published frame');
ok('and not the live page',
  (await publicPage()).includes('<nav class="breadcrumbs"'), 'frame went live unpublished');
await postJson(`/cms/api/pages/${livePageId}`, { blocks: [], page_type: 'default' });
ok('and the page reads as edited', editing.includes('Live · edited') || editing.includes('pill--edited'));

r = await postJson(`/cms/api/pages/${livePageId}`, { blocks: [], status: 'published' });
out = await publicPage();
ok('publishing is what puts it out', out.includes('ASDF placeholder'), 'not published');
ok('and nothing is left pending', !(await cmsHtml(`/cms/pages/${livePageId}/edit`)).includes('pill--edited'));

/* Set back to what is live and there is nothing pending, so the document does
   not read as edited over a change nobody made. */
await postJson(`/cms/api/pages/${livePageId}`, { blocks: [], title: 'Nytt namn' });
await postJson(`/cms/api/pages/${livePageId}`, { blocks: [], title: 'ASDF placeholder' });
ok('a value set back to what is live stops counting as a change',
  !(await cmsHtml(`/cms/pages/${livePageId}/edit`)).includes('pill--edited'));

/* Discard throws the pending metadata away with the blocks. */
await postJson(`/cms/api/pages/${livePageId}`, { blocks: [], title: 'Skräp igen' });
r = await req(`/cms/api/pages/${livePageId}/discard`, { method: 'POST' });
ok('discard drops pending metadata too',
  (await cmsHtml(`/cms/pages/${livePageId}/edit`)).includes('ASDF placeholder'), 'kept the junk');
/* And says so, because the editor's title field still holds the junk and its
   next autosave would send it straight back. */
ok('and tells the editor its fields need reloading', r.body.settingsReset === true,
  JSON.stringify(r.body.settingsReset));

/* ------------------------------------------------------------- scheduling */
console.log('\n== Scheduled publishing ==');
/* A publish that happens later, from a copy taken when Schedule is pressed.
   The clock itself is covered by test/schedule.test.js; waiting for it here
   costs a minute, so it is asked for with SCHEDULE_WAIT=1. */
const tomorrow = new Date(Date.now() + 86400000).toISOString();
r = await postForm('/cms/pages', { title: `${TAG} planerad`, slug: 'planerad', page_type: 'default' });
const plannedId = idFrom(r.location, 'pages');
created.pages.push(plannedId);
const plannedBlocks = [{ kind: 'text', props: { html: '<p>Planerad text</p>' } }];

r = await postJson(`/cms/api/pages/${plannedId}`, {
  blocks: plannedBlocks, status: 'scheduled', publish_at: '2020-01-01T08:00:00Z', title: 'Ska inte sparas',
});
ok('a time that has passed is refused', r.status === 400 && /passed/.test(r.body.error), JSON.stringify(r.body));
ok('and nothing is written when it is',
  !(await cmsHtml(`/cms/pages/${plannedId}/edit`)).includes('Ska inte sparas'), 'saved anyway');

r = await postJson(`/cms/api/pages/${plannedId}`, { blocks: plannedBlocks, status: 'scheduled', publish_at: tomorrow });
ok('a page can be scheduled', r.status === 200 && r.body.status === 'draft' && !!r.body.scheduledAt,
  JSON.stringify(r.body.scheduledAt));
ok('the editor is told what the bar and the pill now say',
  /Edit schedule/.test(r.body.actions) && /Publish now/.test(r.body.actions) && /Scheduled/.test(r.body.pill));
ok('it is not on the site yet', (await fetch(`${BASE}/planerad`)).status === 404);
ok('the list says it is scheduled', (await cmsHtml('/cms/pages')).includes('pill--scheduled'));
r = await req(`/cms/api/pages/${plannedId}`);
ok('and the editor can ask', r.status === 200 && !!r.body.scheduledAt && r.body.address === 'scheduled',
  JSON.stringify(r.body));

/* Frozen, because the link is usually handed out - in the newsletter that goes
   with it - before the page is live. */
r = await postJson(`/cms/api/pages/${plannedId}`, { blocks: plannedBlocks, slug: 'flyttad-planerad' });
ok('a scheduled address does not move', r.body.permalink === '/planerad', JSON.stringify(r.body.permalink));

r = await postJson(`/cms/api/pages/${plannedId}`, { blocks: plannedBlocks, status: 'unscheduled' });
ok('removing the schedule leaves a draft', r.body.status === 'draft' && r.body.scheduledAt === null
  && r.body.address === 'free', JSON.stringify(r.body));

await postJson(`/cms/api/pages/${plannedId}`, { blocks: plannedBlocks, status: 'scheduled', publish_at: tomorrow });
r = await postJson(`/cms/api/pages/${plannedId}`, { blocks: plannedBlocks, status: 'published' });
ok('publishing now calls the schedule off', r.body.status === 'published' && r.body.scheduledAt === null,
  JSON.stringify(r.body.scheduledAt));
ok('and puts it out', (await fetch(`${BASE}/planerad`).then((x) => x.text())).includes('Planerad text'));

/* A live page's changes, scheduled; then taken down, which has to mean down. */
const changed = [{ kind: 'text', props: { html: '<p>Ny version</p>' } }];
r = await postJson(`/cms/api/pages/${plannedId}`, { blocks: changed, status: 'scheduled', publish_at: tomorrow });
ok('changes to a live page can be scheduled', /Live · scheduled/.test(r.body.pill), r.body.pill);
ok('and the live page is untouched until then',
  !(await fetch(`${BASE}/planerad`).then((x) => x.text())).includes('Ny version'), 'went out early');
r = await postJson(`/cms/api/pages/${plannedId}`, { blocks: changed, status: 'draft' });
ok('taking it down calls the schedule off too', r.body.scheduledAt === null, JSON.stringify(r.body.scheduledAt));

if (process.env.SCHEDULE_WAIT === '1') {
  const nextMinute = new Date(Math.ceil((Date.now() + 5000) / 60000) * 60000);
  const late = [{ kind: 'text', props: { html: '<p>Efter schemat</p>' } }];
  await postJson(`/cms/api/pages/${plannedId}`, {
    blocks: plannedBlocks, status: 'scheduled', publish_at: nextMinute.toISOString(),
  });
  // Written after scheduling, so it must not be what goes out.
  await postJson(`/cms/api/pages/${plannedId}`, { blocks: late });
  console.log(`  ..   waiting for ${nextMinute.toTimeString().slice(0, 5)}`);
  await new Promise((done) => setTimeout(done, nextMinute - Date.now() + 3000));
  const html = await fetch(`${BASE}/planerad`).then((x) => x.text());
  ok('the clock puts it out on the minute', html.includes('Planerad text'), 'not published');
  ok('without the edits made after scheduling', !html.includes('Efter schemat'), 'published the later draft');
  r = await req(`/cms/api/pages/${plannedId}`);
  ok('which wait as edits on the live page', r.body.hasDraftChanges === true && r.body.scheduledAt === null,
    JSON.stringify(r.body));
}

/* --------------------------------------------------------- page parents */
/* A page's address is composed from a parent and a slug, so an address whose
   middle is nowhere cannot be written - there is no box to write it in. */
r = await postForm('/cms/pages', { title: `${TAG} barn`, parent_id: pageId, slug: 'barn' });
const childId = idFrom(r.location, 'pages');
created.pages.push(childId);
r = await req(`/cms/api/pages/${childId}/usage`);
const childPermalink = `${permalink}/barn`;
r = await postJson(`/cms/api/pages/${childId}`, { status: 'published', blocks: [] });
ok('a child is addressed through its parent', r.status === 200, JSON.stringify(r.body?.page));
r = await fetch(BASE + childPermalink);
ok('and answers on that address', r.status === 200, childPermalink);

/* Every segment of the trail is a page you can actually go to, which is the
   whole point of composing rather than typing. */
const childHtml = await fetch(BASE + childPermalink).then((x) => x.text());
ok('its breadcrumb links the parent',
  childHtml.includes(`href="${permalink}"`), childPermalink);

/* Two levels below the root and no further: /a/b/c is the longest address. */
const addressOf = async (id) => (await req(`/cms/api/pages/${id}/usage`)).body?.page?.permalink;

r = await postForm('/cms/pages', { title: `${TAG} barnbarn`, parent_id: childId, slug: 'barnbarn' });
const grandId = idFrom(r.location, 'pages');
created.pages.push(grandId);
ok('three segments is allowed', await addressOf(grandId) === `${childPermalink}/barnbarn`,
  await addressOf(grandId));

/* A parent already at the cap has no room under it, so the parent is dropped
   and the page lands at the root rather than growing a fourth step. */
r = await postForm('/cms/pages', { title: `${TAG} djupt`, parent_id: grandId, slug: 'djupt' });
const deepId = idFrom(r.location, 'pages');
created.pages.push(deepId);
ok('a fourth is refused and the page lands at the root',
  await addressOf(deepId) === '/djupt', await addressOf(deepId));

/* The editor saves the address through its own JSON route, not the meta form,
   and that route forwarded `permalink` - a field `update` had stopped reading.
   So every Appears under set in the editor was accepted and thrown away, and
   the breadcrumb was blamed for it. */
r = await postJson(`/cms/api/pages/${grandId}`, { blocks: [], parent_id: pageId, slug: 'flyttat' });
ok('the editor can move a page too', r.status === 200 && r.body.permalink === `${permalink}/flyttat`,
  JSON.stringify(r.body.permalink));

/* And cannot move one that is live: the address is a promise to whatever
   links to it, so it takes an Unpublish to break it. */
await postJson(`/cms/api/pages/${grandId}`, { blocks: [], status: 'published' });
r = await postJson(`/cms/api/pages/${grandId}`, { blocks: [], parent_id: '', slug: 'nytt' });
ok('but not one that is live', r.body.permalink === `${permalink}/flyttat`,
  JSON.stringify(r.body.permalink));
await postJson(`/cms/api/pages/${grandId}`, { blocks: [], status: 'draft' });
r = await postJson(`/cms/api/pages/${grandId}`, { blocks: [], parent_id: '', slug: 'nytt' });
ok('unpublishing lets it move again', r.body.permalink === '/nytt',
  JSON.stringify(r.body.permalink));

/* A menu item names a page, not a path, so moving the page moves the link.
   A path is a snapshot and goes stale the moment the page moves - which is
   exactly what happened the first time a page was restructured. On a page of
   its own, so moving it disturbs nothing else here. */
r = await postForm('/cms/pages', { title: `${TAG} lankmal`, slug: 'lankmal' });
const menuPageId = idFrom(r.location, 'pages');
created.pages.push(menuPageId);
r = await postForm('/cms/menus', { name: `${TAG} flyttmeny` });
/* Creating a menu redirects to the list rather than to the new menu, so the
   id comes off the card - the same way the Menus section below finds one. */
const moveCard = (html) => html.split('<section class="menu-card"')
  .find((chunk) => chunk.includes(`data-menu-name value="${TAG} flyttmeny"`));
const moveMenuId = Number(moveCard(await cmsHtml('/cms/menus'))?.match(/^\s*data-menu="(\d+)"/)?.[1] || 0);
ok('the moving menu resolves', moveMenuId > 0, String(moveMenuId));
created.menus.push(moveMenuId);

/* Read back off the editor, which renders each row's resolved address - the
   save endpoint answers with whether the menu is dirty, not with the tree. */
const linkNow = async () =>
  moveCard(await cmsHtml('/cms/menus'))?.match(/data-href value="([^"]*)"/)?.[1];

await postJson(`/cms/api/menus/${moveMenuId}`, {
  rows: [{ label: 'Sidan', href: '/lankmal', pageId: menuPageId, depth: 0 }],
});
ok('a menu item points where the page is', await linkNow() === '/lankmal', await linkNow());

await postJson(`/cms/api/pages/${menuPageId}`, { blocks: [], parent_id: pageId, slug: 'lankmal' });
ok('and follows it when it moves', await linkNow() === `${permalink}/lankmal`, await linkNow());

/* A custom link has no page behind it and is left exactly as typed. */
await postJson(`/cms/api/menus/${moveMenuId}`, {
  rows: [{ label: 'Utanför', href: 'https://exempel.se/nagot', pageId: null, depth: 0 }],
});
ok('a custom link is left alone', await linkNow() === 'https://exempel.se/nagot', await linkNow());

/* A page cannot be put under itself, or under anything below it. */
r = await postJson(`/cms/api/pages/${childId}`, {});
const before = await addressOf(childId);
await postForm(`/cms/pages/${childId}/meta`, { title: `${TAG} barn`, parent_id: grandId, slug: 'barn' });
ok('and cannot be moved under its own descendant', await addressOf(childId) === before,
  await addressOf(childId));

/* Deleting a parent re-homes what sat under it rather than leaving those
   pages pointing through a page that is not there. */
r = await postForm('/cms/pages', { title: `${TAG} tillfallig`, slug: 'tillfallig' });
const tempParent = idFrom(r.location, 'pages');
created.pages.push(tempParent);
r = await postForm('/cms/pages', { title: `${TAG} flyttas`, parent_id: tempParent, slug: 'flyttas' });
const tempChild = idFrom(r.location, 'pages');
created.pages.push(tempChild);
r = await req(`/cms/api/pages/${tempParent}/usage`);
ok('the delete dialogue is told what sits under the page',
  r.status === 200 && r.body.children.length === 1, JSON.stringify(r.body.children));
await postForm(`/cms/pages/${tempParent}/delete`, { reparent_to: '' });
ok('and the page under it moves to the root rather than being stranded',
  await addressOf(tempChild) === '/flyttas', await addressOf(tempChild));

/* The canvas addresses a drop target by the id of the slice holding it, and
   the form screen wraps its flat list of fields in one. Built by hand it had
   no id, `data-owner` came out empty, and dragging a field in from the
   palette silently did nothing. */
r = await req(`/cms/forms/${contactFormId}/edit`);
const canvasData = JSON.parse(String(r.body)
  .match(/<script id="cms-data" type="application\/json">([\s\S]*?)<\/script>/)[1]
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
ok('the form canvas gets a slice it can address',
  canvasData.blocks.length === 1 && /^[a-z0-9]{4,32}$/i.test(canvasData.blocks[0].id || ''),
  JSON.stringify(canvasData.blocks?.[0]?.id));

/* ---------------------------------------------------------------- articles */
console.log('\n== Articles ==');
/* Creating asks for a title and nothing else; everything after that happens
   in the editor, which writes blocks exactly as the page editor does. */
r = await postForm('/cms/articles', { title: `${TAG} artikel` });
ok('create article', r.status === 303, r.location);
const articleId = idFrom(r.location, 'articles');
created.articles.push(articleId);

r = await postJson(`/cms/api/articles/${articleId}`, { blocks: [], parent_id: pageId });
ok('file it under a page', r.status === 200 && r.body.permalink.startsWith(`${permalink}/`),
  JSON.stringify(r.body.permalink));

r = await postJson(`/cms/api/articles/${articleId}`, {
  title: `${TAG} artikel`, lead: 'Ingress här', status: 'published',
  blocks: [{ type: 'slice', columns: [{ objects: [
    { kind: 'text', props: { html: '<p>Brödtext</p>' } },
  ] }] }],
});
ok('write and publish', r.status === 200 && r.body.status === 'published', JSON.stringify(r.body));

/* An article lives under the page it was filed under, so its address starts
   there rather than at a feed it happens to be listed in. */
const articlePath = `${permalink}/${TAG.toLowerCase()}-artikel`;
ok('the address is composed from the parent', r.body.permalink === articlePath, r.body.permalink);

const article = await fetch(BASE + articlePath).then((x) => x.text());
ok('article lives under its parent page',
  article.includes('Brödtext') && article.includes('Ingress här'), articlePath);
ok('the trail runs through the parent', article.includes(`${TAG} sida`));
ok('the body is drawn by the block renderer', article.includes('b-text'));

/* Frozen at publish: re-filing a live article must not move a link that has
   already been given out. */
await postJson(`/cms/api/articles/${articleId}`, { blocks: [], parent_id: '' });
ok('a published address is frozen', (await fetch(BASE + articlePath)).status === 200);

/* Frozen while it is live, not once it ever was. Testing published_at made
   the address final for good, so an article filed under the wrong page on the
   day it went out could only be fixed by deleting and rewriting it. */
r = await postJson(`/cms/api/articles/${articleId}`, { blocks: [], status: 'draft' });
const frozenAt = r.body.permalink;
await postJson(`/cms/api/articles/${articleId}`, { blocks: [], parent_id: '' });
r = await postJson(`/cms/api/articles/${articleId}`, { blocks: [] });
ok('unpublishing lets an article move too',
  r.body.permalink !== frozenAt && !r.body.permalink.slice(1).includes('/'),
  `${frozenAt} -> ${r.body.permalink}`);
const movedTo = r.body.permalink;
await postJson(`/cms/api/articles/${articleId}`, { blocks: [], status: 'published' });
ok('and answers on the new one', (await fetch(BASE + movedTo)).status === 200, movedTo);
ok('while the old one stops', (await fetch(BASE + articlePath)).status === 404, articlePath);

/* The same bargain on an article, including the feed - `articles.list()`
   draws the cards on the public site as well as the list in the CMS, so a
   draft title overlaid at hydration would leak straight onto a feed. */
await postJson(`/cms/api/articles/${articleId}`, { blocks: [], status: 'published' });
const liveTitle = (await req(`/cms/api/articles/${articleId}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ blocks: [] }),
})).body.permalink;
await postJson(`/cms/api/articles/${articleId}`, { blocks: [], title: 'ASDF artikel', lead: 'skräp' });
const onSite = await fetch(BASE + liveTitle).then((x) => x.text());
ok('an article title typed in does not reach its page', !onSite.includes('ASDF artikel'), 'leaked');
const feedHtml = await fetch(BASE + permalink).then((x) => x.text());
ok('nor the feed that lists it', !feedHtml.includes('ASDF artikel'), 'leaked into the feed');
ok('the editor still shows it',
  (await cmsHtml(`/cms/articles/${articleId}/edit`)).includes('ASDF artikel'));
/* The list's own row, found by the link to this article's editor: it never
   said Live · edited, because the list was never hydrated. */
const articleRow = async () => (await cmsHtml('/cms/articles')).split('<tr>')
  .find((row) => row.includes(`href="/cms/articles/${articleId}/edit"`)) || '';
ok('and so does the articles list', (await articleRow()).includes('pill--edited'), 'the list says Live');
await req(`/cms/api/articles/${articleId}/discard`, { method: 'POST' });
ok('and discarding it puts the title back',
  !(await cmsHtml(`/cms/articles/${articleId}/edit`)).includes('ASDF artikel'));

/* An article schedules the way a page does. */
r = await postJson(`/cms/api/articles/${articleId}`, {
  blocks: [], title: `${TAG} artikel`, status: 'scheduled',
  publish_at: new Date(Date.now() + 86400000).toISOString(),
});
ok('an article can have its changes scheduled', r.status === 200 && /Live · scheduled/.test(r.body.pill),
  JSON.stringify(r.body));
ok('and its row says so', (await articleRow()).includes('pill--scheduled'));
r = await postJson(`/cms/api/articles/${articleId}`, { blocks: [], status: 'unscheduled' });
ok('and the schedule can be removed', r.body.scheduledAt === null, JSON.stringify(r.body.scheduledAt));

/* The palette does not offer a page's furniture, but the palette is in the
   browser - so the server refuses it too. */
await postJson(`/cms/api/articles/${articleId}`, {
  blocks: [{ type: 'slice', columns: [{ objects: [
    { kind: 'text', props: { html: '<p>Brödtext</p>' } },
    { kind: 'breadcrumbs', props: {} },
    { kind: 'form', props: { heading: 'Nej' } },
  ] }] }],
});
const draft = await cmsHtml(`/cms/articles/${articleId}/preview`);
ok('page furniture is refused in an article',
  draft.includes('b-text') && !draft.includes('b-breadcrumbs') && !draft.includes('b-form'));

/* -------------------------------------------------------------- categories */
console.log('\n== Categories ==');
r = await postForm('/cms/categories', { name: `${TAG} kategori` });
ok('create category', r.status === 303);
const catsHtml = await cmsHtml('/cms/categories');
const catRow = catsHtml.split('<tr').find((chunk) => chunk.includes(`${TAG} kategori`));
const categoryId = Number(catRow?.match(/categories\?edit=(\d+)/)?.[1] || 0);
ok('category id resolves', categoryId > 0, String(categoryId));
created.categories.push(categoryId);
r = await req(`/cms/api/categories/${categoryId}/usage`);
ok('usage endpoint responds', r.status === 200 && Array.isArray(r.body.alternatives));

/* The article gets a subject of its own *and goes out with it*, before the
   feed asks for chips. A chip row offers the subjects of published articles,
   and filing one is a draft change like any other - so filing without
   publishing left the row with nothing to offer, and the check could only
   pass where the database already held some *other* published article
   carrying a category. It passed on a developer's machine and failed on an
   empty one, which is the opposite of what an end-to-end run is for.

   `status: 'published'` rides the same save: the ids land in the draft, and
   publish applies them to the join table the chips are read from. */
r = await postJson(`/cms/api/articles/${articleId}`,
  { blocks: [], category_id: categoryId, status: 'published' });
const filed = await cmsHtml(`/cms/articles/${articleId}/edit`);
ok('the article is filed under a subject',
  r.status === 200 && new RegExp(`<option value="${categoryId}" selected`).test(filed),
  String(r.status));
/* The live copy, not the draft: a subject waiting in a draft is exactly the
   state that made the chip check fail, and it looks identical in the editor.
   At `movedTo`, not `articlePath` - the article was moved to the site root
   several checks ago, and the address it was born at has 404'd ever since. */
ok('and goes out carrying it',
  (await fetch(BASE + movedTo).then((x) => x.text())).includes(`${TAG} kategori`), movedTo);

/* ------------------------------------------------------------------- feeds */
console.log('\n== Feeds ==');
const feedPermalink = `/${TAG.toLowerCase()}-flode`;
r = await postForm('/cms/pages', { title: `${TAG} flode`, permalink: feedPermalink });
const feedPageId = idFrom(r.location, 'pages');
created.pages.push(feedPageId);

r = await postJson(`/cms/api/pages/${feedPageId}`, {
  status: 'published',
  blocks: [{ type: 'slice', columns: [{ objects: [{
    id: 'e2efeed1', kind: 'articles',
    props: { categories: [], limit: 1, layout: 'grid', more: 'scroll', filter: true },
  }] }] }],
});
ok('publish a page carrying a feed', r.status === 200 && r.body.status === 'published');

const feedPage = await fetch(BASE + feedPermalink).then((x) => x.text());
ok('the feed lists the article', feedPage.includes(`${TAG} artikel`));
ok('the feed carries its loading hooks', feedPage.includes('data-feed="e2efeed1"'));
ok('the feed offers its subject chips', feedPage.includes('chip-row'));

r = await req(`/api/feed?path=${encodeURIComponent(feedPermalink)}&block=e2efeed1&offset=1`);
ok('the next batch is served', r.status === 200 && typeof r.body.html === 'string',
  JSON.stringify(r.body).slice(0, 100));
r = await req(`/api/feed?path=${encodeURIComponent(feedPermalink)}&block=nope&offset=0`);
ok('an unknown feed is refused', r.status === 404);

/* ------------------------------------------------------------------- menus */
console.log('\n== Menus ==');
r = await postForm('/cms/menus', { name: `${TAG} meny` });
ok('create menu', r.status === 303);
const menusHtml = await cmsHtml('/cms/menus');
const section = menusHtml.split('<section class="menu-card"')
  .find((chunk) => chunk.includes(`data-menu-name value="${TAG} meny"`));
/* Anchored to the start of the card. Every card lists every page title in
   its link picker, so `includes` on a name matches cards that merely *offer*
   a page whose title starts the same way - which is how a page called
   "…menysida" pointed this at the first card on the screen and the cleanup
   deleted the site's main menu. */
const menuId = Number(section?.match(/^\s*data-menu="(\d+)"/)?.[1] || 0);
ok('menu id resolves', menuId > 0, String(menuId));
created.menus.push(menuId);

r = await postJson(`/cms/api/menus/${menuId}`, {
  name: `${TAG} meny`,
  rows: [
    { label: 'Topp', href: '/kunskap', depth: 0 },
    { label: 'Under', href: '/nyheter', depth: 1 },
    { label: 'För djupt', href: '/kontakt', depth: 5 },
  ],
});
ok('draft saves and marks dirty', r.status === 200 && r.body.dirty === true, JSON.stringify(r.body));
r = await postJson(`/cms/api/menus/${menuId}/publish`, {});
ok('publishing clears dirty', r.status === 200 && r.body.dirty === false);

/* ---------------------------------------------------------------- security */
console.log('\n== Security ==');
ok('media traversal blocked', [400, 404].includes((await req('/media/../src/server.js')).status));
ok('assets traversal blocked', [400, 404].includes((await req('/assets/../../etc/passwd')).status));

/* ----------------------------------------------------------------- cleanup */
console.log('\n== Cleanup ==');
for (const id of created.pages) await req(`/cms/pages/${id}/delete`, { method: 'POST' });
for (const id of created.articles) await req(`/cms/articles/${id}/delete`, { method: 'POST' });
for (const id of created.slices) await req(`/cms/slices/${id}/delete`, { method: 'POST' });
/* Menus are deleted by name, not by the id the tests guessed at. A lookup
   that resolves to the wrong card deletes somebody's real menu, and it did:
   the main menu went three times before this was noticed. The id has to be
   confirmed against a name this run owns before anything is removed. */
const menuCards = (await cmsHtml('/cms/menus')).split('<section class="menu-card"');
for (const card of menuCards) {
  const id = card.match(/^\s*data-menu="(\d+)"/)?.[1];
  const name = card.match(/data-menu-name value="([^"]*)"/)?.[1];
  if (id && name && name.startsWith(TAG)) await req(`/cms/menus/${id}/delete`, { method: 'POST' });
}

for (const id of created.categories) await req(`/cms/categories/${id}/delete`, { method: 'POST' });

ok('page removed', (await fetch(BASE + permalink)).status === 404);
/* The address the article actually answers on. `articlePath` is where it was
   born, and it has 404'd since "unpublishing lets an article move too" moved
   the piece to the site root - so checking that one proved nothing about
   whether the article was ever deleted. */
ok('article removed', (await fetch(BASE + movedTo)).status === 404, movedTo);
const after = await cmsHtml('/cms/menus');
ok('menu removed', !after.includes(`${TAG} meny`));
const catsAfter = await cmsHtml('/cms/categories');
ok('category removed', !catsAfter.includes(`${TAG} kategori`));
const slicesAfter = await req('/cms/api/slices');
for (const id of created.forms) await postForm(`/cms/forms/${id}/delete`, {});
ok('form removed', !(await req(`/cms/api/forms/${created.forms[0]}/usage`)).body.pages?.length);
ok('slice removed', !slicesAfter.body.items.some((s) => s.name.startsWith(TAG)));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
