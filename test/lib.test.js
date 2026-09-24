import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeHtml, stripTags, esc, attrs } from '../src/lib/html.js';
import { slugify, normalizePermalink, normalizePhone, isPhone, isEmail, safeEqual, numericCode } from '../src/lib/util.js';
import {
  imageSize, kindOf, srcsetFor, parseVariants, variantAtLeast, imgAttrs, pictureHtml, fallbackUrl, filesOf,
} from '../src/lib/media.js';
import { jpegOrientation, orientationSwapsAxes, pngHasAlpha, looksPhotographic } from '../src/lib/imagesize.js';
import { ladderFor, displayDimensions } from '../src/lib/images.js';
import {
  normalizeObjects, normalizeBlocks, wrapInSlice, firstImageId, walkObjects, instantiateSlice,
  reIdBlocks, anchorSlug, ARTICLE_OBJECT_ORDER, allowedInArticle, allowedInForm,
  FORM_OBJECT_ORDER, TEXT_SIZES, visibleBlocks, sliceDefinition,
} from '../src/lib/objects.js';
import { parseQuery, parseCookies, serializeCookie } from '../src/lib/http.js';
import { SCHEMA as SETTINGS_SCHEMA } from '../src/lib/settings.js';
import { hydrateForTest } from '../src/models.js';
import { renderObject, renderBlock, cellSurface } from '../src/views/render.js';
import { parseEmbed, embedProviderList } from '../src/lib/embed.js';
import { isUnlocked, unlockToken, unlockCookieName, passwordMatches } from '../src/lib/gate.js';
import {
  autoInk, normalizeColors, normalizeFonts, normalizeLayout, normalizeType, themeCss,
  fontStack,
  DEFAULT_COLORS, DEFAULT_FONTS, DEFAULT_LAYOUT, DEFAULT_TYPE, LAYOUT_LIMITS, SCALE_LIMITS,
  TYPE_LIMITS,
} from '../src/lib/theme.js';
import { sniffFont, guessFace, fontFaceCss, stackFor } from '../src/lib/fonts.js';
import { relativeDate, scheduleDate, parsePublishAt, parsePublishedOn, localDay } from '../src/lib/util.js';
import { statusPill, editorActions, addressState, scheduleCell } from '../src/views/cms/parts.js';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { zip, crc32 } from '../src/lib/zip.js';
import { loginView } from '../src/views/auth.js';
import { cmsLayout } from '../src/views/cms/layout.js';
import { siteWords, LANGUAGES } from '../src/lib/words.js';
import { siteLayout } from '../src/views/layout.js';
import { passwordGate } from '../src/views/gate.js';
import { feedItems } from '../src/views/render.js';
import { formatDateLong } from '../src/lib/util.js';
import { readdirSync } from 'node:fs';
import {
  countryList, countryOptions, isCountry, dialFor, flagFor, joinPhone, isDiallable,
} from '../src/lib/phone.js';

/* A stand-in for what is installed, so the theme's tests do not depend on
   which typefaces this particular machine happens to hold. */
const INSTALLED = [
  { slug: 'inter', name: 'Inter', fallback: 'sans',
    faces: [
      { weight: '100 900', style: 'normal', charset: 'latin', filename: 'inter-variable.woff2', format: 'woff2', bytes: 48432 },
      { weight: '100 900', style: 'normal', charset: 'latin-ext', filename: 'inter-ext.woff2', format: 'woff2', bytes: 85272 },
    ] },
  { slug: 'lora', name: 'Lora', fallback: 'serif',
    faces: [{ weight: '400', style: 'normal', charset: '', filename: 'lora-400-a1b2c3d4.woff2', format: 'woff2', bytes: 30000 }] },
];

test('sanitizeHtml keeps allowed markup', () => {
  assert.equal(sanitizeHtml('<p>Hej <strong>du</strong></p>'), '<p>Hej <strong>du</strong></p>');
  assert.equal(sanitizeHtml('<h2>Rubrik</h2><ul><li>ett</li></ul>'), '<h2>Rubrik</h2><ul><li>ett</li></ul>');
});

test('sanitizeHtml removes scripts, styles and their contents', () => {
  assert.equal(sanitizeHtml('<script>alert(1)</script><p>ok</p>'), '<p>ok</p>');
  assert.equal(sanitizeHtml('<style>p{color:red}</style><p>ok</p>'), '<p>ok</p>');
  assert.equal(sanitizeHtml('<p>a</p><script>bad</script'), '<p>a</p>');
});

test('sanitizeHtml blocks dangerous attributes and urls', () => {
  assert.equal(sanitizeHtml('<p onclick="evil()">hi</p>'), '<p>hi</p>');
  assert.equal(sanitizeHtml('<a href="javascript:alert(1)">x</a>'), '<a>x</a>');
  assert.equal(sanitizeHtml('<a href="data:text/html,<b>">x</a>'), '<a>x</a>');
  assert.equal(sanitizeHtml('<img src=x onerror=alert(1)>'), '');
});

test('sanitizeHtml adds rel to external targets and closes open tags', () => {
  assert.match(sanitizeHtml('<a href="/x" target="_blank">l</a>'), /rel="noopener noreferrer"/);
  assert.equal(sanitizeHtml('<p>oavslutad <em>kursiv'), '<p>oavslutad <em>kursiv</em></p>');
});

test('sanitizeHtml preserves prose containing angle brackets', () => {
  assert.equal(sanitizeHtml('5 < 10 och 20 > 3'), '5 &lt; 10 och 20 &gt; 3');
  assert.equal(sanitizeHtml('Salt & peppar'), 'Salt &amp; peppar');
});

test('sanitizeHtml only allows alignment classes', () => {
  assert.equal(sanitizeHtml('<p class="align-center evil">c</p>'), '<p class="align-center">c</p>');
  assert.equal(sanitizeHtml('<p class="evil">c</p>'), '<p>c</p>');
});

test('stripTags produces a plain excerpt', () => {
  assert.equal(stripTags('<p>Hej <b>du</b></p>'), 'Hej du');
  assert.equal(stripTags('<p>Hej du där borta i skogen</p>', 12), 'Hej du där…');
});

test('esc and attrs escape output', () => {
  assert.equal(esc('<a href="x">'), '&lt;a href=&quot;x&quot;&gt;');
  assert.equal(attrs({ href: '/a"b', disabled: true, title: null, hidden: false }), ' href="/a&quot;b" disabled');
});

test('slugify folds Swedish characters', () => {
  assert.equal(slugify('Produktion & Utveckling'), 'produktion-utveckling');
  assert.equal(slugify('Mjölby ÅÄÖ'), 'mjolby-aao');
  assert.equal(slugify(''), 'page');
});

test('normalizePermalink produces clean paths', () => {
  assert.equal(normalizePermalink('Nyheter/Företaget/'), '/nyheter/foretaget');
  assert.equal(normalizePermalink(''), '/');
  assert.equal(normalizePermalink('http://x.se/a/b'), '/a/b');
  assert.equal(normalizePermalink('///a//b//'), '/a/b');
});

test('normalizePhone reads a bare number as local to the country it is given', () => {
  assert.equal(normalizePhone('070-123 45 67', '46'), '+46701234567');
  assert.equal(normalizePhone('020 7946 0958', '44'), '+442079460958');
  // Written with its own country, a number keeps it whatever the default.
  assert.equal(normalizePhone('0046 70 1234567', '44'), '+46701234567');
  assert.equal(normalizePhone('+46701234567'), '+46701234567');
  assert.equal(normalizePhone(''), '');
  // With no country to read it in, a bare number cannot be placed.
  assert.equal(normalizePhone('070-123 45 67'), '');
  assert.ok(isPhone('070-1234567', '46'));
  assert.ok(!isPhone('070-1234567'));
  assert.ok(!isPhone('12', '46'));
});

test('isEmail accepts real addresses only', () => {
  assert.ok(isEmail('macsmoser@gmail.com'));
  assert.ok(!isEmail('nope'));
  assert.ok(!isEmail('a@b'));
});

test('safeEqual compares without leaking length', () => {
  assert.ok(safeEqual('123456', '123456'));
  assert.ok(!safeEqual('123456', '123457'));
  assert.ok(!safeEqual('12', '123456'));
});

test('numericCode returns the requested number of digits', () => {
  for (let i = 0; i < 50; i++) assert.match(numericCode(6), /^\d{6}$/);
});

test('imageSize reads dimensions from headers', () => {
  const png = Buffer.alloc(33);   // real PNGs always carry the full IHDR
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  assert.deepEqual(imageSize(png), { width: 640, height: 480 });

  const svg = Buffer.from('<svg viewBox="0 0 316.9 110.8"></svg>');
  assert.deepEqual(imageSize(svg, 'image/svg+xml'), { width: 317, height: 111 });

  assert.equal(imageSize(Buffer.from('not an image')), null);
});

test('kindOf classifies mime types', () => {
  assert.equal(kindOf('image/png'), 'image');
  assert.equal(kindOf('video/mp4'), 'video');
  assert.equal(kindOf('application/pdf'), 'pdf');
  assert.equal(kindOf('text/plain'), 'file');
});

test('normalizeObjects drops unknown kinds and bad spacing', () => {
  const out = normalizeObjects([
    { kind: 'heading', props: { text: 'A', align: 'center' }, style: { margin: { top: '24', left: 'x' } } },
    { kind: 'nonsense' },
    null,
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].props.text, 'A');
  assert.deepEqual(out[0].style.margin, { top: 24 });
});

test('legacy object kinds upgrade on read', () => {
  const out = normalizeObjects([
    { kind: 'header', props: { text: 'H' } },
    { kind: 'subheader', props: { text: 'S' } },
    { kind: 'body', props: { html: '<p>B</p>' } },
    { kind: 'list', props: { html: '<p>one</p><p>two</p>' } },
  ]);
  assert.deepEqual(out.map((o) => o.kind), ['heading', 'heading', 'text', 'text']);
  assert.equal(out[0].props.level, 'h2');
  assert.equal(out[1].props.level, 'h3');
  assert.equal(out[3].props.html, '<ul><li>one</li><li>two</li></ul>');
});

test('an existing list is not double-wrapped', () => {
  const [obj] = normalizeObjects([{ kind: 'list', props: { html: '<ul><li>a</li></ul>' } }]);
  assert.equal(obj.props.html, '<ul><li>a</li></ul>');
});

test('heading level is clamped to known values', () => {
  const [obj] = normalizeObjects([{ kind: 'heading', props: { text: 'x', level: 'h9' } }]);
  assert.equal(obj.props.level, 'h2');
});

test('a page says which form it wants, and nothing else about it', () => {
  /* A form used to be page content - its fields, its recipient and its
     confirmation message all lived inside the object - so the same contact
     form on three pages was three forms that drifted apart. The page stores
     one number now, and everything else is read from the form itself. */
  const [form] = normalizeObjects([{
    kind: 'form',
    props: { formId: '4', recipient: 'somewhere@else.se', submitLabel: 'Nope' },
    columns: [[{ kind: 'fieldEmail', props: { label: 'Email' } }]],
  }]);
  assert.deepEqual(form.props, { formId: 4 });
  assert.equal(form.columns, undefined);   // not a container any more

  assert.equal(normalizeObjects([{ kind: 'form', props: {} }])[0].props.formId, null);
  assert.equal(normalizeObjects([{ kind: 'form', props: { formId: 'x' } }])[0].props.formId, null);
  assert.equal(normalizeObjects([{ kind: 'form', props: { formId: -3 } }])[0].props.formId, null);
});

test('a near date is said in words, an old one is dated', () => {
  /* The lists answer "what was I last working on", and every page edited today
     carrying the same string is exactly where that answer stops working - so
     today gets a time of day and yesterday gets a name. */
  const now = new Date(2026, 8, 10, 12, 0, 0);            // 10 Sept, local
  const at = (y, m, d, h = 12, min = 0) =>
    new Date(Date.UTC(y, m, d, h, min)).toISOString().slice(0, 19).replace('T', ' ');

  assert.match(relativeDate(at(2026, 8, 10, 9, 5), undefined, now), /^Today \d{2}:\d{2}$/);
  assert.equal(relativeDate(at(2026, 8, 9), undefined, now), 'Yesterday');
  assert.equal(relativeDate(at(2026, 8, 7), undefined, now), '2026-09-07');
  assert.equal(relativeDate('', undefined, now), '');
  assert.equal(relativeDate(null, undefined, now), '');

  /* By calendar day, not by hours elapsed: something saved ten minutes before
     midnight is yesterday's work at ten past, not "twenty minutes ago". */
  const justAfterMidnight = new Date(2026, 8, 10, 0, 10, 0);
  assert.equal(relativeDate(at(2026, 8, 9, 21, 50), undefined, justAfterMidnight), 'Yesterday');
});

test('a phone number is stored as one dialable string', () => {
  /* The select is a default, not a ruling. A number written the way it is
     written at home gets the country's code and loses its trunk zero; one
     written in full has already said which country it means, more precisely
     than the dropdown can, so it keeps its own. */
  assert.equal(joinPhone('46', '070-123 45 67'), '+46701234567');
  assert.equal(joinPhone('46', '070 123 4567'), '+46701234567');   // spaces or dashes, same number
  assert.equal(joinPhone('46', '+44 20 7123 4567'), '+442071234567');
  assert.equal(joinPhone('46', '0044 20 7123 4567'), '+442071234567');
  assert.equal(joinPhone('', '701234567'), '+701234567');
  assert.equal(joinPhone('46', ''), '');
  assert.equal(joinPhone('46', '   '), '');

  /* Deliberately no guessing about a bare number that starts with the dial
     code's own digits: 46 opens a Kalmar area code as well as Sweden, and
     being clever there mangles a real number in silence. */
  assert.equal(joinPhone('46', '0480 123 45'), '+4648012345');

  // A sanity check on length, not a rule per country - which would be a
  // dependency this project does not take.
  assert.ok(isDiallable('+46701234567'));
  assert.ok(!isDiallable('+4612'));                    // too short to be anything
  assert.ok(!isDiallable('+4670123456789012'));        // past E.164's fifteen
  assert.ok(!isDiallable('0701234567'));               // never got its country
});

test('the country list is sound, and short one entry on purpose', () => {
  const list = countryList();
  assert.ok(list.length > 100);
  const seen = new Set();
  for (const c of list) {
    assert.match(c.iso, /^[A-Z]{2}$/, c.iso);
    assert.match(c.dial, /^\d{1,4}$/, `${c.iso} ${c.dial}`);
    assert.ok(c.name, c.iso);
    assert.ok(!seen.has(c.iso), `duplicate ${c.iso}`);
    seen.add(c.iso);
  }

  /* Israel is left out at the site owner's instruction. The test is here so
     that adding it back has to be a decision rather than a tidy-up. */
  assert.ok(!seen.has('IL'));
  assert.ok(!countryOptions().some((o) => o.label.includes('972')));

  // Sorted the way the names read, which is not the way the codes sort.
  const names = list.map((c) => c.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en')));

  // The flag is the code shifted into its own block, so the two cannot drift.
  assert.equal(flagFor('SE'), '\u{1F1F8}\u{1F1EA}');
  assert.equal(flagFor('nope'), '');
  assert.equal(dialFor('se'), '46');
  assert.equal(dialFor('IL'), '');
  assert.ok(isCountry('NO') && !isCountry('IL'));
});

test('the slice a form is wrapped in carries an id', () => {
  /* The form screen hands the canvas one slice around its flat list of
     fields. That wrapper was built by hand and had no id, and the canvas
     addresses a drop target by its slice's - so `data-owner` came out empty,
     a drop looked up a slice that did not exist, and dragging a field in from
     the palette did nothing at all. Built by `wrapInSlice`, it gets one.
     Anything else handing the canvas blocks it did not get from
     `normalizeBlocks` needs the same. */
  const [block] = [wrapInSlice([{ kind: 'fieldText', props: { label: 'Namn' } }])];
  assert.match(block.id, /^[a-z0-9]{4,32}$/i);
  assert.equal(block.columns.length, 1);
  assert.equal(block.columns[0].objects[0].kind, 'fieldText');

  // And it keeps the ids the objects already had, so a save is not a reshuffle.
  const kept = wrapInSlice([{ id: 'abcd1234', kind: 'fieldText', props: {} }]);
  assert.equal(kept.columns[0].objects[0].id, 'abcd1234');
});

test('a form is written with the fields and the few things that frame them', () => {
  // The same canvas a page is, cut to what belongs in a form. A table or an
  // article feed inside one would be a form the editor cannot show you.
  assert.ok(allowedInForm('fieldEmail'));
  assert.ok(allowedInForm('heading'), 'a heading over the fields');
  assert.ok(allowedInForm('text'), 'a line of explanation');
  assert.ok(!allowedInForm('table'));
  assert.ok(!allowedInForm('articles'));
  assert.ok(!allowedInForm('form'), 'a form inside a form');
  assert.ok(FORM_OBJECT_ORDER.includes('fieldCheckbox'));
});

test('a field key is slugged, not gutted, and comes from the label by default', () => {
  const key = (props) => normalizeObjects([{ kind: 'fieldText', props }])[0].props.name;

  assert.equal(key({ name: 'my field!<>' }), 'my-field');
  /* The one that started this. The old rule deleted every character it did
     not recognise, so a Swedish word typed into this box came back mangled
     with nothing said about it: "Ärende" was stored as "rende". */
  assert.equal(key({ name: 'Ärende' }), 'arende');
  assert.equal(key({ name: 'Övrigt förslag' }), 'ovrigt-forslag');

  // Empty is the ordinary case: the label answers for it at render time, so
  // the author never has to think about the key at all.
  assert.equal(key({ label: 'Ärende' }), '');
  const [field] = normalizeObjects([{ kind: 'fieldText', props: { label: 'Ärende' } }]);
  assert.match(renderObject(field, {}), /name="arende"/);

  // A field with neither still has to post under something.
  const [bare] = normalizeObjects([{ kind: 'fieldText', props: {} }]);
  assert.match(renderObject(bare, {}), /name="f_[0-9a-f]+"/);
});

test('a form draws from the form, not from the page it sits on', () => {
  const [placed] = normalizeObjects([{ kind: 'form', props: { formId: 7 } }]);
  const [fieldObj] = normalizeObjects([{ kind: 'fieldEmail', props: { label: 'E-post', required: true } }]);
  const stored = {
    id: 7,
    name: 'Kontakt',
    submit_label: 'Skicka',
    colour: 'brand',
    outline: false,
    button_size: 'large',
    // A flat set. A form used to be a stack of slices, which made every
    // placed form a full-width band of its own.
    objects: [fieldObj],
  };
  const ctx = { forms: new Map([[7, stored]]), path: '/kontakt' };

  const html = renderObject(placed, ctx);
  assert.match(html, /name="e-post"/);
  assert.doesNotMatch(html, /b-slice/, 'a form brings no band of its own');
  assert.match(html, /Skicka/);
  /* The submit button used to emit `b-button__el--accent`, a class from the
     three-value palette that went when buttons took theme colours - so it
     named nothing and could not be coloured at all. */
  assert.doesNotMatch(html, /b-button__el--accent/);
  assert.match(html, /b-button__el--c-brand/);
  assert.match(html, /b-button__el--large/);
  // The page's own object id is what a submission posts back, so the page can
  // find which of its forms was sent without trusting the browser.
  assert.match(html, new RegExp(`name="form" value="${placed.id}"`));

  // A form deleted out from under a page is silence for a visitor, and a note
  // for whoever is looking at the draft.
  const orphan = renderObject(placed, { forms: new Map() });
  assert.equal(orphan, '');
  assert.match(renderObject(placed, { forms: new Map(), isPreview: true }), /has been deleted/);
});

test('select options are one per line and capped', () => {
  const [field] = normalizeObjects([{ kind: 'fieldSelect', props: { options: ' a \n\n b \n c ' } }]);
  assert.equal(field.props.options, 'a\nb\nc');
});

test('spacer height is clamped', () => {
  assert.equal(normalizeObjects([{ kind: 'spacer', props: { height: '9999' } }])[0].props.height, 240);
  assert.equal(normalizeObjects([{ kind: 'spacer', props: { height: 'x' } }])[0].props.height, 32);
});

test('normalizeObjects clamps a button to known values', () => {
  const [obj] = normalizeObjects([{
    kind: 'button', props: { label: 'x', align: 'diagonal', colour: 'not a colour', buttonSize: 'huge' },
  }]);
  assert.equal(obj.props.align, 'left');
  assert.equal(obj.props.colour, '');
  assert.equal(obj.props.buttonSize, 'medium');
});

test('a page block is always a slice, whatever arrives', () => {
  const blocks = normalizeBlocks([
    { type: 'slice', sliceId: '3', name: 'S', columns: [{ objects: [{ kind: 'image', props: { media: '7' } }] }] },
    // A loose object, as an older page or a bare drop would produce it.
    { type: 'object', object: { kind: 'quote', props: { text: 'Q' } } },
    { kind: 'heading', props: { text: 'barer still' } },
    { type: 'object', object: { kind: 'unknown' } },
    'garbage',
  ]);
  assert.equal(blocks.length, 3);
  assert.ok(blocks.every((b) => b.type === 'slice' && Array.isArray(b.columns)));
  assert.equal(blocks[0].sliceId, 3);
  assert.equal(blocks[0].columns[0].objects[0].props.media, 7);
  // The two loose objects each got a one-column slice of their own.
  assert.equal(blocks[1].columns.length, 1);
  assert.equal(blocks[1].columns[0].objects[0].props.text, 'Q');
  assert.equal(firstImageId(blocks), 7);
  assert.equal([...walkObjects(blocks)].length, 3);
});

test('a slice keeps its column settings and clamps the count', () => {
  const [wide] = normalizeBlocks([{
    type: 'slice',
    props: { ratio: 'wide-left', gap: 'large', width: 'half' },
    columns: [
      { objects: [], align: 'center', valign: 'middle', style: { padding: { top: 20 } } },
      { objects: [] }, { objects: [] },
    ],
  }]);
  assert.deepEqual(wide.props, {
    ratio: 'wide-left', gap: 'large', width: 'half',
    // A slice that predates bands gets the neutral one: capped to the body
    // column, no background - exactly how it drew before. And on the site.
    container: 'body', surface: '', anchor: '', hidden: false,
  });
  assert.equal(wide.columns[0].align, 'center');
  assert.equal(wide.columns[0].valign, 'middle');
  assert.equal(wide.columns[0].style.padding.top, 20);
  assert.equal(wide.columns[1].align, 'left');       // defaults fill in

  // Four is the ceiling; anything beyond it is dropped.
  const [many] = normalizeBlocks([{ type: 'slice', columns: new Array(9).fill({ objects: [] }) }]);
  assert.equal(many.columns.length, 4);

  // A split that belongs to another column count falls back rather than
  // emitting a class no stylesheet defines.
  const [two] = normalizeBlocks([{ type: 'slice', props: { ratio: 'wide-left' }, columns: [{}, {}] }]);
  assert.equal(two.props.ratio, '50-50');
  const [bad] = normalizeBlocks([{ type: 'slice', props: { width: '640px', gap: '3rem' }, columns: [{}] }]);
  assert.equal(bad.props.width, 'full');
  assert.equal(bad.props.gap, 'medium');
});

test('body html inside blocks is sanitised', () => {
  const [block] = normalizeBlocks([
    { type: 'object', object: { kind: 'text', props: { html: '<p>ok</p><script>bad()</script>' } } },
  ]);
  assert.equal(block.columns[0].objects[0].props.html, '<p>ok</p>');
});

test('instantiateSlice gives every object a fresh id', () => {
  const slice = {
    id: 5,
    name: 'S',
    definition: JSON.stringify({
      props: { ratio: '50-50' },
      columns: [{ objects: [{ kind: 'heading', props: { text: 'A' }, id: 'aaaaaa' }] }, { objects: [] }],
    }),
  };
  const a = instantiateSlice(slice);
  const b = instantiateSlice(slice);
  assert.equal(a.sliceId, 5);
  assert.equal(a.columns.length, 2);
  assert.equal(a.props.ratio, '50-50');
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.columns[0].objects[0].id, b.columns[0].objects[0].id);
  assert.equal(a.columns[0].objects[0].props.text, 'A');
});

test('parseQuery collects repeated and bracketed keys', () => {
  assert.deepEqual(parseQuery('a=1&tags[]=x&tags[]=y&b=hej%20du'), { a: '1', tags: ['x', 'y'], b: 'hej du' });
});

test('cookies round-trip', () => {
  assert.deepEqual(parseCookies('sid=abc; lang=sv'), { sid: 'abc', lang: 'sv' });
  const c = serializeCookie('x', 'a b', { maxAge: 60 });
  assert.match(c, /^x=a%20b; Path=\/; Max-Age=60; HttpOnly; SameSite=Lax$/);
});

/* ------------------------------------------------------------- settings */

import { parseLinks, linksToText, iconForUrl } from '../src/lib/settings.js';

test('parseLinks reads label and url per line', () => {
  assert.deepEqual(parseLinks('LinkedIn https://linkedin.com/company/x'),
    [{ label: 'LinkedIn', url: 'https://linkedin.com/company/x' }]);
});

test('parseLinks derives a label from a bare url', () => {
  assert.deepEqual(parseLinks('https://www.instagram.com/y'),
    [{ label: 'instagram.com', url: 'https://www.instagram.com/y' }]);
});

test('parseLinks drops lines without a url', () => {
  assert.deepEqual(parseLinks('just some text\n\n  '), []);
});

test('parseLinks accepts mailto and caps the list', () => {
  assert.equal(parseLinks('Mail mailto:a@b.se')[0].url, 'mailto:a@b.se');
  const many = Array.from({ length: 30 }, (_, i) => `L${i} https://e.se/${i}`).join('\n');
  assert.equal(parseLinks(many).length, 12);
});

test('links round-trip through the textarea format', () => {
  const links = [{ label: 'A', url: 'https://a.se' }, { label: 'B', url: 'https://b.se' }];
  assert.deepEqual(parseLinks(linksToText(links)), links);
});

test('iconForUrl recognises the common networks', () => {
  assert.equal(iconForUrl('https://www.linkedin.com/company/x'), 'linkedin');
  assert.equal(iconForUrl('https://instagram.com/y'), 'instagram');
  assert.equal(iconForUrl('mailto:a@b.se'), 'mail');
  assert.equal(iconForUrl('https://example.se'), 'external');
});

/* --------------------------------------------------------- WebP pipeline */

/** A JPEG carrying nothing but an EXIF APP1 segment with an orientation tag. */
function jpegWithOrientation(value) {
  // TIFF header: byte order, magic, offset to IFD0, then IFD0's entry count.
  const tiff = Buffer.alloc(10);
  tiff.write('MM', 0, 'ascii');
  tiff.writeUInt16BE(0x2a, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);          // one IFD entry
  const entry = Buffer.alloc(12);
  entry.writeUInt16BE(0x0112, 0);    // Orientation
  entry.writeUInt16BE(3, 2);         // SHORT
  entry.writeUInt32BE(1, 4);
  entry.writeUInt16BE(value, 8);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff, entry, Buffer.alloc(4)]);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(payload.length + 2, 0);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, payload]);
}

test('jpegOrientation reads the EXIF rotation tag', () => {
  assert.equal(jpegOrientation(jpegWithOrientation(6)), 6);
  assert.equal(jpegOrientation(jpegWithOrientation(1)), 1);
  // No EXIF at all, and outright garbage, both mean "no rotation".
  assert.equal(jpegOrientation(Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x02])), 1);
  assert.equal(jpegOrientation(Buffer.from('not a jpeg')), 1);
});

test('a quarter-turn orientation swaps the recorded axes', () => {
  assert.equal(orientationSwapsAxes(1), false);
  assert.equal(orientationSwapsAxes(3), false);   // 180 degrees keeps them
  assert.equal(orientationSwapsAxes(6), true);
  assert.deepEqual(displayDimensions({ width: 900, height: 600 }, 6), { width: 600, height: 900 });
  assert.deepEqual(displayDimensions({ width: 900, height: 600 }, 1), { width: 900, height: 600 });
});

test('pngHasAlpha reads the colour type', () => {
  const png = (colorType) => {
    const b = Buffer.alloc(33);
    b.writeUInt32BE(0x89504e47, 0);
    b[25] = colorType;
    return b;
  };
  assert.equal(pngHasAlpha(png(6)), true);    // RGBA
  assert.equal(pngHasAlpha(png(4)), true);    // grey + alpha
  assert.equal(pngHasAlpha(png(2)), false);   // RGB
});

test('looksPhotographic separates photos from flat artwork', () => {
  const size = { width: 100, height: 100 };
  assert.equal(looksPhotographic(Buffer.alloc(1), 'image/jpeg', size), true);
  // Flat artwork compresses well under PNG, so it stays under a byte per pixel.
  assert.equal(looksPhotographic(Buffer.alloc(2000), 'image/png', size), false);
  assert.equal(looksPhotographic(Buffer.alloc(40000), 'image/png', size), true);
  assert.equal(looksPhotographic(Buffer.alloc(10), 'image/png', null), true);
});

test('the width ladder never upscales and caps very large sources', () => {
  assert.deepEqual(ladderFor(1080), [400, 800, 1080]);
  assert.deepEqual(ladderFor(8000), [400, 800, 1200, 1600, 2000]);
  assert.deepEqual(ladderFor(300), [300]);      // narrower than every rung
});

test('srcsetFor builds descriptors, and stays silent without a real choice', () => {
  const row = { filename: 'a-900.webp', variants: JSON.stringify([
    { filename: 'a-400.webp', width: 400, height: 267 },
    { filename: 'a-900.webp', width: 900, height: 600 },
  ]) };
  assert.equal(srcsetFor(row), '/media/a-400.webp 400w, /media/a-900.webp 900w');

  // One variant is no choice at all; rows predating conversion have none.
  assert.equal(srcsetFor({ variants: JSON.stringify([{ filename: 'a.webp', width: 400 }]) }), '');
  assert.equal(srcsetFor({ filename: 'old.jpg', variants: '' }), '');
  assert.equal(srcsetFor({ filename: 'old.jpg' }), '');
});

test('parseVariants survives a malformed column', () => {
  assert.deepEqual(parseVariants({ variants: '{{{not json' }), []);
  assert.deepEqual(parseVariants({ variants: '"a string"' }), []);
  assert.deepEqual(parseVariants({ variants: '[{"width":10}]' }), []);   // no filename
});

test('variantAtLeast picks the narrowest variant that covers a size', () => {
  const row = { variants: JSON.stringify([
    { filename: 'a-400.webp', width: 400 },
    { filename: 'a-800.webp', width: 800 },
  ]) };
  assert.equal(variantAtLeast(row, 300).filename, 'a-400.webp');
  assert.equal(variantAtLeast(row, 400).filename, 'a-400.webp');
  assert.equal(variantAtLeast(row, 500).filename, 'a-800.webp');
  assert.equal(variantAtLeast(row, 9000).filename, 'a-800.webp');   // largest available
  assert.equal(variantAtLeast({ variants: '' }, 400), null);
});

test('imgAttrs omits sizes when there is no srcset to size', () => {
  const plain = imgAttrs({ filename: 'logo.svg', width: 317, height: 111 });
  assert.equal(plain, 'src="/media/logo.svg" width="317" height="111"');
  assert.ok(!plain.includes('sizes'));
});

test('a WebP with a fallback is a picture, the JPG its img', () => {
  const row = {
    filename: 'a-900.webp', width: 900, height: 600, fallback_filename: 'a-800.jpg',
    variants: JSON.stringify([
      { filename: 'a-400.webp', width: 400, height: 267 },
      { filename: 'a-900.webp', width: 900, height: 600 },
    ]),
  };
  assert.equal(pictureHtml(row, { sizes: '100vw', img: 'alt="A"' }),
    '<picture><source type="image/webp" srcset="/media/a-400.webp 400w, /media/a-900.webp 900w" sizes="100vw">'
    + '<img src="/media/a-800.jpg" width="900" height="600" alt="A"></picture>');
  // The browsers that take the fallback are the ones that cannot choose, so
  // the img gets one file and no srcset of its own.
  assert.ok(!/<img[^>]*srcset/.test(pictureHtml(row)));
});

test('one WebP still needs a srcset, since a source has no src', () => {
  const row = { filename: 'up.webp', width: 640, height: 480, fallback_filename: 'up-640.jpg', variants: '' };
  assert.equal(pictureHtml(row, { sizes: '100vw' }),
    '<picture><source type="image/webp" srcset="/media/up.webp">'
    + '<img src="/media/up-640.jpg" width="640" height="480"></picture>');
  const avif = pictureHtml({ ...row, filename: 'up.avif' });
  assert.ok(avif.includes('type="image/avif"'));
});

test('without a fallback an image stays the plain img it was', () => {
  const svg = { filename: 'logo.svg', width: 317, height: 111 };
  assert.equal(pictureHtml(svg, { img: 'alt=""' }), '<img src="/media/logo.svg" width="317" height="111" alt="">');
  // A fallback beside something that is not WebP or AVIF has nothing to stand in for.
  assert.ok(!pictureHtml({ ...svg, fallback_filename: 'logo-800.png' }).includes('<picture'));
});

test('a link preview gets the fallback, and the fallback goes when the row does', () => {
  const row = { filename: 'a-900.webp', source_filename: 'a.jpg', fallback_filename: 'a-800.jpg',
    variants: JSON.stringify([{ filename: 'a-900.webp', width: 900 }]) };
  assert.equal(fallbackUrl(row), '/media/a-800.jpg');
  assert.equal(fallbackUrl({ filename: 'logo.svg' }), '/media/logo.svg');
  assert.deepEqual(filesOf(row).sort(), ['a-800.jpg', 'a-900.webp', 'a.jpg']);
});

/* ------------------------------------------------- layout intent props */

test('image size is a named intent, never a stored measurement', () => {
  const size = (raw) => normalizeObjects([{ kind: 'image', props: raw }])[0].props.size;
  assert.equal(size({}), 'full');                 // default
  assert.equal(size({ size: 'medium' }), 'medium');
  assert.equal(size({ size: 'small' }), 'small');
  // Anything that looks like CSS is refused outright.
  assert.equal(size({ size: '420px' }), 'full');
  assert.equal(size({ size: '50%' }), 'full');
  assert.equal(size({ size: 'enormous' }), 'full');
});

test('an image’s corners are a name on the card scale, and default to what images had', () => {
  const radius = (raw) => normalizeObjects([{ kind: 'image', props: raw }])[0].props.radius;
  // Every image placed before this was a choice drew at the large radius.
  assert.equal(radius({}), 'large');
  for (const name of ['none', 'small', 'medium', 'large']) assert.equal(radius({ radius: name }), name);
  assert.equal(radius({ radius: '0px' }), 'large');
  assert.equal(radius({ radius: 0 }), 'large');
  assert.equal(radius({ radius: 'square' }), 'large');
});

test('square corners reach the markup, and the old look emits nothing new', () => {
  const media = new Map([[7, { id: 7, filename: 'logo.webp', mime: 'image/webp', width: 720, height: 720 }]]);
  const draw = (props) => renderObject(normalizeObjects([{ kind: 'image', props: { media: 7, ...props } }])[0], { media });
  assert.match(draw({ radius: 'none' }), /class="b-image b-image--r-none"/);
  assert.match(draw({ radius: 'small', size: 'small' }), /class="b-image b-image--small b-image--r-small"/);
  // An image stored before corners existed renders exactly as it did.
  assert.match(draw({}), /class="b-image"/);
  assert.doesNotMatch(draw({ radius: 'large' }), /b-image--r-/);
});


/* --------------------------------------------------------------- tables */

test('a table is sized by its row and column counts', () => {
  const t = (props) => normalizeObjects([{ kind: 'table', props }])[0].props;

  const fresh = t({});
  assert.equal(fresh.rows, 3);
  assert.equal(fresh.cols, 3);
  assert.equal(fresh.cells.length, 3);
  // A cell is a list of objects, empty until something is put in it.
  assert.ok(fresh.cells.every((row) => row.length === 3 && row.every((c) => Array.isArray(c) && !c.length)));

  // Growing adds empty cells at the bottom and on the right.
  const grown = t({ rows: 2, cols: 2, cells: [[[{ kind: 'button', props: { label: 'Go' } }]]] });
  assert.equal(grown.cells[0][0][0].kind, 'button');
  assert.deepEqual(grown.cells[0][1], []);
  assert.deepEqual(grown.cells[1], [[], []]);

  // Stored cells are exactly rows x cols: content outside the table would be
  // data on the page that nobody can see.
  const shrunk = t({ rows: 1, cols: 1, cells: [[['a'], ['b']], [['c'], ['d']]] });
  assert.equal(shrunk.cells.length, 1);
  assert.equal(shrunk.cells[0].length, 1);

  // The caps hold, and nothing CSS-shaped gets through.
  assert.equal(t({ rows: 999 }).rows, 20);
  assert.equal(t({ cols: 999 }).cols, 8);
  assert.equal(t({ rows: 0 }).rows, 1);
  assert.equal(t({ borders: '1px solid red' }).borders, 'all');
  assert.equal(t({ cellPadding: '12px' }).cellPadding, 'medium');
});

test('a cell holds objects, but never another table', () => {
  const cells = normalizeObjects([{
    kind: 'table',
    props: {
      rows: 1,
      cols: 1,
      cells: [[[
        { kind: 'image', props: { media: 4 } },
        { kind: 'button', props: { label: 'Buy' } },
        { kind: 'table', props: {} },          // nesting refused
        { kind: 'fieldText', props: {} },      // belongs to a form
      ]]],
    },
  }])[0].props.cells;
  assert.deepEqual(cells[0][0].map((o) => o.kind), ['image', 'button']);

  // An image in a cell still counts as the page's first image.
  const blocks = normalizeBlocks([{
    type: 'slice',
    columns: [{ objects: [{ kind: 'table', props: { rows: 1, cols: 1,
      cells: [[[{ kind: 'image', props: { media: 9 } }]]] } }] }],
  }]);
  assert.equal(firstImageId(blocks), 9);
});

test('a cell that used to be a string keeps its text', () => {
  const [table] = normalizeObjects([{
    kind: 'table', props: { rows: 1, cols: 2, cells: [['Havre', '']] },
  }]);
  assert.equal(table.props.cells[0][0][0].kind, 'text');
  assert.match(table.props.cells[0][0][0].props.html, /Havre/);
  assert.deepEqual(table.props.cells[0][1], []);   // empty string means empty cell
});

test('a table renders as real table markup', () => {
  const [table] = normalizeObjects([{
    kind: 'table',
    props: {
      rows: 2, cols: 2, headerRow: true, borders: 'rows', cellPadding: 'small',
      cells: [['Sort', 'Pris'], ['Havre', '12,50']],
    },
  }]);
  const html = renderObject(table, {});
  assert.match(html, /<table class="b-table b-table--rows b-table--pad-small">/);
  // The header row is a real thead/th, not a styled first row.
  assert.match(html, /<thead><tr><th>.*Sort.*<\/th>/);
  assert.match(html, /<tbody><tr><td>.*Havre/);
  // Wrapped so a wide table scrolls instead of pushing the page sideways.
  assert.match(html, /<div class="b-table-wrap"/);

  // Without a header row every cell is a td.
  const plain = normalizeObjects([{ kind: 'table', props: { rows: 1, cols: 1, cells: [['x']] } }])[0];
  assert.doesNotMatch(renderObject(plain, {}), /<th>/);
});

test('a table\u2019s colours are theme ids, one per row and column', () => {
  const t = (props) => normalizeObjects([{ kind: 'table', props }])[0].props;

  // Fresh: nothing coloured, and a list per axis exactly as long as the axis.
  const fresh = t({});
  assert.equal(fresh.surface, '');
  assert.equal(fresh.stripes, '');
  assert.deepEqual(fresh.rowSurfaces, ['', '', '']);
  assert.deepEqual(fresh.colSurfaces, ['', '', '']);

  // Sized against the table, like the cells: a colour on a row that is gone
  // is a value nobody can see or clear.
  const sized = t({ rows: 2, cols: 4, rowSurfaces: ['ink', 'sand', 'brand'], colSurfaces: ['paper'] });
  assert.deepEqual(sized.rowSurfaces, ['ink', 'sand']);
  assert.deepEqual(sized.colSurfaces, ['paper', '', '', '']);

  // Ids only. Nothing CSS-shaped survives, here or on the two single colours.
  const dirty = t({ rows: 1, cols: 1, surface: '#ff0000', stripes: 'red; }', rowSurfaces: ['url(x)'] });
  assert.equal(dirty.surface, '');
  assert.equal(dirty.stripes, '');
  assert.deepEqual(dirty.rowSurfaces, ['']);
});

test('a cell takes its row\u2019s colour, then its column\u2019s, then the stripe', () => {
  const p = {
    rows: 4, cols: 3, headerRow: true, stripes: 'paper',
    rowSurfaces: ['ink', '', '', ''],
    colSurfaces: ['', 'brand', ''],
  };
  // The row wins where both apply - the order the browser paints a table in.
  assert.equal(cellSurface(p, 0, 1), 'ink');
  assert.equal(cellSurface(p, 1, 1), 'brand');
  // A stripe loses to a column, and only reaches what neither claims.
  assert.equal(cellSurface(p, 1, 0), '');
  assert.equal(cellSurface(p, 2, 0), 'paper');
  assert.equal(cellSurface(p, 3, 0), '');

  // The header is not part of the alternation: without one the count starts a
  // row earlier, so the stripe lands on different rows.
  const bare = { ...p, headerRow: false, rowSurfaces: ['', '', '', ''] };
  assert.equal(cellSurface(bare, 0, 0), '');
  assert.equal(cellSurface(bare, 1, 0), 'paper');
  assert.equal(cellSurface(bare, 2, 0), '');

  // No stripe colour is what "not striped" means; there is no second switch.
  assert.equal(cellSurface({ ...bare, stripes: '' }, 1, 0), '');
});

test('a table with no background lets the band behind it show through', () => {
  const table = (props) => renderObject(
    normalizeObjects([{ kind: 'table', props: { rows: 2, cols: 2, ...props } }])[0], {});

  // The default emits no surface at all - not white, which on a coloured band
  // drew a white slab under text the band had already turned white.
  const plain = table({});
  assert.doesNotMatch(plain, /b-surface--/);
  assert.match(plain, /<td>/);

  // Chosen, the colour lands on the table and on the cells it reaches, as the
  // same class a band and a card use - so the ink comes with it.
  const painted = table({ surface: 'sand', headerRow: true, rowSurfaces: ['ink', ''] });
  assert.match(painted, /<table class="b-table b-table--all b-table--pad-medium b-surface--sand">/);
  assert.match(painted, /<thead><tr><th class="b-surface--ink">/);
  assert.match(painted, /<tbody><tr><td>/);

  const striped = table({ rows: 3, cols: 1, stripes: 'paper' });
  assert.match(striped, /<tbody><tr><td><\/td><\/tr><tr><td class="b-surface--paper">/);
});

test('cell text is sanitised like any other text', () => {
  const [table] = normalizeObjects([{
    kind: 'table',
    props: { rows: 1, cols: 1, cells: [['<script>bad()</script>']] },
  }]);
  const html = renderObject(table, {});
  assert.doesNotMatch(html, /<script>/);
});


test('line appearance is named, and only non-defaults reach the markup', () => {
  const n = (kind, props) => normalizeObjects([{ kind, props }])[0];

  const t = n('table', { rows: 1, cols: 1, cells: [['x']] });
  assert.equal(t.props.borderStyle, 'solid');
  assert.equal(t.props.borderWidth, 'thin');
  assert.equal(t.props.borderColor, 'soft');
  // Defaults are carried by CSS fallbacks, so they need no class.
  assert.doesNotMatch(renderObject(t, {}), /b-line--/);

  const styled = n('table', {
    rows: 1, cols: 1, cells: [['x']],
    borderStyle: 'dotted', borderWidth: 'thick', borderColor: 'accent',
  });
  const html = renderObject(styled, {});
  assert.match(html, /b-line--dotted/);
  assert.match(html, /b-line--w-thick/);
  assert.match(html, /b-line--c-accent/);

  // A divider shares the vocabulary.
  assert.match(renderObject(n('divider', { borderStyle: 'dashed' }), {}), /b-divider b-line--dashed/);
  assert.doesNotMatch(renderObject(n('divider', {}), {}), /b-line--/);

  // Anything CSS-shaped is refused.
  assert.equal(n('table', { borderStyle: '2px groove' }).props.borderStyle, 'solid');
  assert.equal(n('table', { borderColor: '#ff0000' }).props.borderColor, 'soft');
  assert.equal(n('table', { borderWidth: '4px' }).props.borderWidth, 'thin');
});

/* ------------------------------------------------------------------ theme */

test('autoInk picks a legible text colour for a background', () => {
  assert.equal(autoInk('#ffffff'), '#1e1e1e');
  assert.equal(autoInk('#f0ede8'), '#1e1e1e');
  assert.equal(autoInk('#1e1e1e'), '#ffffff');
  assert.equal(autoInk('#357abb'), '#ffffff');
  // Mid yellow is bright enough to need dark text, unlike mid blue.
  assert.equal(autoInk('#ffcc1b'), '#1e1e1e');
});

test('normalizeColors derives ids and keeps them unique', () => {
  const out = normalizeColors([
    { name: 'Deep Sea', value: '#1b2a41' },
    { name: 'Deep sea', value: '#223355' },
    { id: 'paper', name: 'Cream', value: '#f0ede8' },
  ]);
  assert.deepEqual(out.map((c) => c.id), ['deep-sea', 'deep-sea-2', 'paper']);
  // A rename keeps the stored id, so pages referring to the colour still work.
  assert.equal(out[2].name, 'Cream');
});

test('normalizeColors fills in a missing or invalid ink', () => {
  const [dark, light] = normalizeColors([
    { name: 'Night', value: '#101014' },
    { name: 'Snow', value: '#fdfdfd', ink: 'not-a-colour' },
  ]);
  assert.equal(dark.ink, '#ffffff');
  assert.equal(light.ink, '#1e1e1e');
});

test('normalizeColors rejects junk and falls back to the defaults', () => {
  assert.deepEqual(normalizeColors(null), DEFAULT_COLORS);
  assert.deepEqual(normalizeColors([null, 3, 'red']), DEFAULT_COLORS);
  // A name of pure punctuation still yields a usable id.
  assert.equal(normalizeColors([{ name: '!!!', value: '#000000' }])[0].id, 'color-1');
});

test('normalizeColors clamps the palette to something a person can hold', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ name: `C${i}`, value: '#123456' }));
  assert.equal(normalizeColors(many).length, 24);
});

test('normalizeLayout and normalizeFonts clamp to their limits', () => {
  const layout = normalizeLayout({ narrow: 10, body: 99999, wide: '1400', gutter: -5 });
  assert.equal(layout.narrow, LAYOUT_LIMITS.narrow[0]);
  assert.equal(layout.body, LAYOUT_LIMITS.body[1]);
  assert.equal(layout.wide, 1400);
  assert.equal(layout.gutter, 0);
  assert.deepEqual(normalizeLayout('nonsense'), DEFAULT_LAYOUT);

  const fonts = normalizeFonts({ body: 'no-such-face', heading: 'lora', scale: 500 }, INSTALLED);
  // A face that is not installed cannot stay chosen: the theme would name a
  // family with no files behind it and every page would quietly draw the
  // fallback while the panel insisted otherwise.
  assert.equal(fonts.body, 'inter');
  assert.equal(fonts.heading, 'lora');
  assert.equal(fonts.scale, SCALE_LIMITS[1]);
});

test('themeCss emits a custom property and a surface class per colour', () => {
  const css = themeCss({
    colors: normalizeColors([{ name: 'Deep Sea', value: '#1b2a41', ink: '#ffffff' }]),
    fonts: normalizeFonts({ body: 'lora', heading: 'lora', scale: 110 }),
    layout: normalizeLayout({ narrow: 700, body: 1100, wide: 1400, gutter: 32 }),
  });
  assert.match(css, /--c-deep-sea:#1b2a41/);
  assert.match(css, /--c-deep-sea-ink:#ffffff/);
  assert.match(css, /\.b-surface--deep-sea\{background:var\(--c-deep-sea\);color:var\(--c-deep-sea-ink\);/);
  assert.match(css, /\.b-ink--deep-sea\{color:var\(--c-deep-sea\)\}/);
  assert.match(css, /--font-scale:1\.1/);
  assert.match(css, /--body-max:1100px/);
  // The whole point of naming a colour: nothing here is a value from a page.
  assert.ok(!css.includes('undefined'));
});

test('a surface redefines the text tokens blocks.css would otherwise win with', () => {
  const css = themeCss({
    colors: normalizeColors([{ name: 'Night', value: '#101014', ink: '#ffffff' }]),
    fonts: normalizeFonts({}),
    layout: normalizeLayout({}),
  });
  // Setting `color` alone is not enough: .b-heading sets --ink, .b-text sets
  // --graphite and a cite sets --grey-500, and each would beat inheritance.
  for (const token of ['--ink', '--graphite', '--grey-700', '--grey-500', '--line']) {
    assert.match(css, new RegExp(`\\.b-surface--night\\{[^}]*${token}:`));
  }
  // Mixed toward the background, so a caption stays a caption on any colour
  // rather than every shade flattening to the one ink.
  assert.match(css, /--grey-500:color-mix\(in srgb, var\(--c-night-ink\) 60%, var\(--c-night\)\)/);
});

test('themeCss never emits an id that could break out of a CSS rule', () => {
  const css = themeCss({
    colors: normalizeColors([{ name: '} body { display:none', value: '#000000' }]),
    fonts: normalizeFonts({}),
    layout: normalizeLayout({}),
  });
  assert.ok(!css.includes('display:none'));
  assert.match(css, /\.b-surface--body-display-none\{/);
});

test('nothing about a typeface is fetched from anywhere', () => {
  // The one assertion this whole feature exists for: no theme CSS, on any
  // theme, may name a font service. A page that pulls a face from a CDN hands
  // it every visitor's address, browser and current URL.
  const css = themeCss({
    colors: DEFAULT_COLORS, fonts: { body: 'lora', heading: 'inter', scale: 100 },
    layout: DEFAULT_LAYOUT, type: DEFAULT_TYPE, installed: INSTALLED,
  });
  assert.doesNotMatch(css, /googleapis|gstatic|https?:/);

  // The faces come first: a @font-face has to be known before anything asks
  // for the family, and this is all one inline <style>.
  assert.ok(css.indexOf('@font-face') < css.indexOf(':root'));
  assert.match(css, /@font-face\{font-family:"Inter";[^}]*url\(\/fonts\/inter-variable\.woff2\) format\("woff2"\)/);
  assert.match(css, /--font-sans:"Lora", Georgia/);
  assert.match(css, /--font-heading:"Inter", -apple-system/);
});

test('a variable face is declared as the range it covers', () => {
  const css = fontFaceCss(INSTALLED);
  // 100 900, not 400: declared as a single weight the browser would
  // synthesise a fake bold out of a file that already holds a real one.
  assert.match(css, /font-family:"Inter";font-style:normal;font-weight:100 900/);
  assert.match(css, /font-family:"Lora";font-style:normal;font-weight:400/);
  assert.equal(fontFaceCss([]), '');
});

test('two subsets of one weight stay two faces, not one replacing the other', () => {
  const css = fontFaceCss(INSTALLED);
  // Same family, same weight, same style, two files. Without a unicode-range
  // that is the same declaration written twice and the second wins outright -
  // which is how half an uploaded family goes quietly dead. The range is what
  // keeps them apart, and what stops a Swedish page fetching the 85 KB of
  // Latin Extended it has no character for.
  assert.equal(css.match(/inter-variable\.woff2/g).length, 1);
  assert.equal(css.match(/inter-ext\.woff2/g).length, 1);
  assert.match(css, /inter-variable\.woff2\) format\("woff2"\);unicode-range:U\+0000-00FF/);
  assert.match(css, /inter-ext\.woff2\) format\("woff2"\);unicode-range:U\+0100-02BA/);
  // Ș is U+0218, inside latin-ext and outside latin: the reason this exists.
  assert.match(css, /U\+0100-02BA/);

  // A face with no charset says nothing, so the whole file answers for
  // everything in it - which is what a single unsubset upload wants.
  assert.doesNotMatch(css.match(/[^}]*lora-400[^}]*}/)[0], /unicode-range/);
});

test('a family name cannot climb out of the stylesheet it is written into', () => {
  const evil = { slug: 'x', name: 'Evil\n}body{display:none}', fallback: 'sans',
    faces: [{ weight: '400', style: 'normal', charset: '', filename: 'x.woff2', format: 'woff2' }] };

  // A CSS string ends at a newline: one there closes the string, the `}`
  // closes the @font-face block, and everything after it becomes live rules.
  // A font named this way blanked every page on the site.
  const css = fontFaceCss([evil]);
  assert.doesNotMatch(css, /[\r\n\f]/);
  assert.match(css, /font-family:"Evil \}body\{display:none\}"/);

  // The same name is also written into --font-sans by the stack.
  assert.doesNotMatch(stackFor(evil), /[\r\n\f]/);

  // A quote would end the string early on its own, so it is escaped, not
  // dropped - dropping it silently renames somebody's typeface.
  const quoted = fontFaceCss([{ ...evil, name: 'A" , sans-serif ; x: "y' }]);
  assert.match(quoted, /font-family:"A\\" , sans-serif ; x: \\"y"/);
});

test('a charset is off the list or absent, never whatever was posted', () => {
  const css = fontFaceCss([{
    slug: 'x', name: 'X', fallback: 'sans',
    faces: [{ weight: '400', style: 'normal', charset: 'U+0;} body{display:none', filename: 'x.woff2', format: 'woff2' }],
  }]);
  // The range is written straight into a stylesheet, so an unknown name has
  // to come out as no range at all rather than as itself.
  assert.doesNotMatch(css, /display:none/);
  assert.doesNotMatch(css, /unicode-range/);
});

test('fontStack always ends in a fallback', () => {
  assert.match(fontStack('lora', INSTALLED), /Georgia, "Times New Roman", serif$/);
  assert.match(fontStack('inter', INSTALLED), /sans-serif$/);
  // A family that is not installed still has to produce a usable stack.
  assert.match(fontStack('no-such-face', INSTALLED), /sans-serif$/);
  assert.match(stackFor(null), /sans-serif$/);
});

test('a font file is taken for what it contains, not what it is called', () => {
  assert.equal(sniffFont(Buffer.from('wOF2\x00\x01')).format, 'woff2');
  assert.equal(sniffFont(Buffer.from('wOFF')).format, 'woff');
  assert.equal(sniffFont(Buffer.from('OTTO')).format, 'opentype');
  assert.equal(sniffFont(Buffer.from([0, 1, 0, 0])).format, 'truetype');
  // The thing that matters: a file named .woff2 that is a script is not one.
  assert.equal(sniffFont(Buffer.from('<script>alert(1)</script>')), null);
  assert.equal(sniffFont(Buffer.from('')), null);
  assert.equal(sniffFont(null), null);
});

test('a face is guessed from its filename, however the file was named', () => {
  const g = (name) => JSON.stringify(guessFace(name));
  // Google's download names the weight; Fontsource numbers it and uses
  // `normal` for the *style*, which is why a bare number is read first.
  assert.equal(g('Inter-SemiBold.ttf'), '{"weight":"600","style":"normal","charset":""}');
  assert.equal(g('Lora-BoldItalic.otf'), '{"weight":"700","style":"italic","charset":""}');
  assert.equal(g('DMSans-ExtraBold.ttf'), '{"weight":"800","style":"normal","charset":""}');
  // A variable file covers the axis, so it is offered as the range.
  assert.equal(g('InterVariable.woff2'), '{"weight":"100 900","style":"normal","charset":""}');
  // The subset is read too, longest name first so `latin-ext` is not taken
  // for `latin` with something after it.
  assert.equal(g('inter-latin-ext-600-normal.woff2'), '{"weight":"600","style":"normal","charset":"latin-ext"}');
  assert.equal(g('inter-latin-400-normal.woff2'), '{"weight":"400","style":"normal","charset":"latin"}');
  // A version or a subset number says nothing about the face.
  assert.equal(g('roboto-v20-latin.woff2'), '{"weight":"400","style":"normal","charset":"latin"}');
  assert.equal(g(''), '{"weight":"400","style":"normal","charset":""}');
});

test('a slice carries a band: a theme colour and a container width', () => {
  const [slice] = normalizeBlocks([{
    type: 'slice',
    props: { surface: 'deep-sea', container: 'wide' },
    columns: [{ objects: [] }],
  }]);
  assert.equal(slice.props.surface, 'deep-sea');
  assert.equal(slice.props.container, 'wide');
});

test('a slice refuses a surface that is not a colour id', () => {
  const bad = (surface) => normalizeBlocks([{ type: 'slice', props: { surface }, columns: [{}] }])[0];
  // Anything that could escape the class name it becomes.
  assert.equal(bad('red; } body {').props.surface, '');
  assert.equal(bad('<script>').props.surface, '');
  assert.equal(bad('#ff0000').props.surface, '');
  // An unknown but well-formed id is kept: the palette may simply not have
  // been saved yet, and rewriting it would lose the author's choice.
  assert.equal(bad('not-in-the-palette').props.surface, 'not-in-the-palette');
  assert.equal(bad('body').props.container, 'body');
});

test('a slice renders as a band around an inner box', () => {
  const [slice] = normalizeBlocks([{
    type: 'slice',
    props: { surface: 'ink', container: 'narrow', ratio: '50-50' },
    columns: [{ objects: [{ kind: 'heading', props: { text: 'A' } }] }, { objects: [] }],
  }]);
  const html = renderBlock(slice, {});
  assert.match(html, /<section class="b-slice b-surface--ink"/);
  assert.match(html, /<div class="b-slice__inner b-slice__inner--narrow b-slice--cols-2 b-slice--50-50">/);
  // The band carries the colour; the inner box carries the layout. Never both.
  assert.ok(!/b-slice__inner[^"]*b-surface/.test(html));
});

test('a text colour is a theme colour id, and only on text', () => {
  const [heading] = normalizeObjects([{ kind: 'heading', props: { text: 'A', ink: 'brand' } }]);
  assert.match(renderObject(heading, {}), /class="b-heading b-heading--large b-ink--brand"/);

  // Left empty the object inherits from its surface, and emits no class.
  const [plain] = normalizeObjects([{ kind: 'heading', props: { text: 'A' } }]);
  assert.ok(!renderObject(plain, {}).includes('b-ink--'));

  // A button's text colour comes from its own colour, so it has no ink prop.
  const [button] = normalizeObjects([{ kind: 'button', props: { label: 'B', ink: 'brand' } }]);
  assert.equal(button.props.ink, undefined);
});

/* -------------------------------------------------------------- copying */

test('reIdBlocks mints a fresh id for everything nested', () => {
  const source = normalizeBlocks([{
    type: 'slice',
    columns: [{ objects: [
      { kind: 'heading', props: { text: 'A' } },
      { kind: 'form', columns: [[{ kind: 'fieldText', props: { label: 'Name' } }]] },
      { kind: 'table', props: { rows: 1, cols: 1,
        cells: [[[{ kind: 'text', props: { html: '<p>In a cell</p>' } }]]] } },
    ] }],
  }]);

  const collect = (blocks) => {
    const out = [];
    for (const block of blocks) {
      out.push(block.id);
      for (const obj of walkObjects([block])) out.push(obj.id);
    }
    return out;
  };

  const before = collect(source);
  const after = collect(reIdBlocks(source));
  assert.equal(before.length, after.length);
  // Nothing shared: a copy sharing an object id with its original makes
  // "which block did you mean" a real question the editor cannot answer.
  assert.equal(before.filter((id) => after.includes(id)).length, 0);
  // Including the one in a table cell, which used to keep its id.
  assert.equal(new Set(after).size, after.length);
});

test('reIdBlocks keeps the content it is copying', () => {
  const [copy] = reIdBlocks([{
    type: 'slice',
    props: { surface: 'ink', container: 'wide' },
    columns: [{ objects: [{ kind: 'heading', props: { text: 'Investor overview' } }] }],
  }]);
  assert.equal(copy.props.surface, 'ink');
  assert.equal(copy.props.container, 'wide');
  assert.equal(copy.columns[0].objects[0].props.text, 'Investor overview');
});

/* ---------------------------------------------------------- hidden slices */

const hiddenSlice = (hidden) => normalizeBlocks([{ type: 'slice', props: { hidden }, columns: [{}] }])[0];

test('a slice is shown unless it says it is hidden', () => {
  // Every slice written before there was a choice stays on the site.
  assert.equal(hiddenSlice(undefined).props.hidden, false);
  assert.equal(hiddenSlice(true).props.hidden, true);
  assert.equal(hiddenSlice('false').props.hidden, false);
});

test('what the site gets is every slice that is not hidden', () => {
  const shown = hiddenSlice(false);
  assert.deepEqual(visibleBlocks([hiddenSlice(true), shown]), [shown]);
  assert.deepEqual(visibleBlocks(undefined), []);
});

test('a hidden slice stays hidden when its page is copied, not when it is saved', () => {
  // Duplicating a page or planting a template copies the page as it is.
  assert.equal(reIdBlocks([hiddenSlice(true)])[0].props.hidden, true);
  // The library holds building blocks, and one placed from it should arrive
  // where it can be seen.
  assert.equal(sliceDefinition(hiddenSlice(true)).props.hidden, false);
  assert.equal(instantiateSlice({ id: 1, name: 'S', definition: sliceDefinition(hiddenSlice(true)) })
    .props.hidden, false);
});

/* -------------------------------------------------------- code and embeds */

test('code is stored as text and escaped on the way out', () => {
  const [obj] = normalizeObjects([{
    kind: 'code',
    props: { code: '<script>alert(1)</script>', language: 'js!! rm -rf', filename: 'a.js' },
  }]);
  // The language is a label that becomes no class, but it is still narrowed:
  // a field that only ever holds a name should not hold a sentence.
  assert.equal(obj.props.language, 'js');
  const html = renderObject(obj, {});
  assert.match(html, /<pre class="b-code__pre"><code>&lt;script&gt;/);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /<div class="b-code__label">a\.js<\/div>/);
});

test('parseEmbed builds the frame itself, from the providers it knows', () => {
  const yt = parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42');
  assert.equal(yt.src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(parseEmbed('https://youtu.be/abc123XYZ_-').src,
    'https://www.youtube-nocookie.com/embed/abc123XYZ_-');
  assert.equal(parseEmbed('https://vimeo.com/76979871').src,
    'https://player.vimeo.com/video/76979871');
  assert.equal(parseEmbed('https://open.spotify.com/track/abc123').src,
    'https://open.spotify.com/embed/track/abc123');
});

test('parseEmbed refuses anything it cannot frame itself', () => {
  // Not a provider, so nothing is framed - the renderer links it instead.
  assert.equal(parseEmbed('https://example.com/video'), null);
  // Not https.
  assert.equal(parseEmbed('http://www.youtube.com/watch?v=abc'), null);
  assert.equal(parseEmbed('javascript:alert(1)'), null);
  assert.equal(parseEmbed('data:text/html,<script>'), null);
  assert.equal(parseEmbed(''), null);
  // Right host, but no id to build a frame from.
  assert.equal(parseEmbed('https://www.youtube.com/'), null);
  assert.equal(parseEmbed('https://vimeo.com/not-a-number'), null);
  // A Maps share link is not an embed URL, and cannot be turned into one here.
  assert.equal(parseEmbed('https://maps.app.goo.gl/abc'), null);
  assert.ok(parseEmbed('https://www.google.com/maps/embed?pb=!1m18'));
});

test('an embed renders a frame, a link, or nothing at all', () => {
  const render = (url) => renderObject(normalizeObjects([{ kind: 'embed', props: { url } }])[0], {});

  assert.match(render('https://youtu.be/abc123'), /<iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/abc123"/);
  // A real destination no provider matched is still worth showing.
  assert.match(render('https://example.com/x'), /b-embed--plain[^>]*><a href="https:\/\/example\.com\/x"/);
  // Something that is not a destination at all is dropped, payload and all.
  assert.equal(render('javascript:alert(1)'), '');
  assert.equal(render(''), '');
});

test('a breadcrumbs object draws the trail it is given, and nothing without one', () => {
  const [obj] = normalizeObjects([{ kind: 'breadcrumbs', props: { align: 'center' } }]);
  const trail = [{ label: 'Om oss', href: '/om-oss' }];
  assert.match(renderObject(obj, { trail }), /class="b-breadcrumbs b-align-center"/);
  assert.match(renderObject(obj, { trail }), /Om oss/);
  // The landing page has no trail, so the object is silent rather than empty
  // furniture.
  assert.equal(renderObject(obj, { trail: [] }), '');
  assert.equal(renderObject(obj, {}), '');
});

/* --------------------------------------------------------- draft / publish */

test('a page hydrates two block lists, and says when they differ', () => {
  const live = JSON.stringify(normalizeBlocks([
    { type: 'slice', columns: [{ objects: [{ kind: 'heading', props: { text: 'Live' } }] }] },
  ]));
  const edited = JSON.stringify(normalizeBlocks([
    { type: 'slice', columns: [{ objects: [{ kind: 'heading', props: { text: 'Edited' } }] }] },
  ]));

  const settled = hydrateForTest({ status: 'published', content: live, draft_content: live });
  assert.equal(settled.hasDraftChanges, false);
  assert.equal(settled.blocks[0].columns[0].objects[0].props.text, 'Live');

  const pending = hydrateForTest({ status: 'published', content: live, draft_content: edited });
  assert.equal(pending.hasDraftChanges, true);
  // What the public sees and what the editor loads are different lists.
  assert.equal(pending.blocks[0].columns[0].objects[0].props.text, 'Live');
  assert.equal(pending.draftBlocks[0].columns[0].objects[0].props.text, 'Edited');

  // An unpublished page is never "edited": there is nothing live to differ from.
  assert.equal(hydrateForTest({ status: 'draft', content: live, draft_content: edited })
    .hasDraftChanges, false);
});

test('a page that predates the split reads its draft from what is live', () => {
  const live = JSON.stringify(normalizeBlocks([
    { type: 'slice', columns: [{ objects: [{ kind: 'heading', props: { text: 'Old' } }] }] },
  ]));
  const row = hydrateForTest({ status: 'published', content: live });   // no draft_content
  assert.equal(row.draftBlocks[0].columns[0].objects[0].props.text, 'Old');
  assert.equal(row.hasDraftChanges, false);
});

test('content that predates a prop does not read as edited', () => {
  // The real case: `content` was written before slices had a band, and the
  // draft is the same page re-saved since. The bytes differ; the meaning does
  // not. Comparing raw would leave every older page showing "edited" forever.
  const old = JSON.stringify([{
    type: 'slice', id: 'aaaaaaaaaaaa',
    props: { ratio: 'full', gap: 'medium', width: 'full' },     // no container, no surface
    columns: [{ align: 'left', valign: 'top', style: { padding: {} }, objects: [
      { id: 'bbbbbbbbbbbb', kind: 'heading', props: { text: 'A', level: 'h2', align: 'left' },
        style: { margin: {}, padding: {} } },
    ] }],
  }]);
  const current = JSON.stringify(normalizeBlocks(JSON.parse(old)));
  assert.notEqual(old, current);
  assert.equal(hydrateForTest({ status: 'published', content: old, draft_content: current })
    .hasDraftChanges, false);

  // Ids are load-bearing in that comparison: normalising content that has
  // none mints fresh ones, so it can only be trusted on stored content.
  assert.ok(current.includes('aaaaaaaaaaaa'));
});

/* --------------------------------------------------- heading and button */

test('a heading sizes itself separately from the tag it uses', () => {
  const [obj] = normalizeObjects([{
    kind: 'heading', props: { text: 'Vår plattform', level: 'h1', headingSize: 'display' },
  }]);
  const html = renderObject(obj, {});
  // The tag says where it sits in the outline; the class says how big it draws.
  assert.match(html, /^<h1 class="b-heading b-heading--display"/);
  assert.match(html, /<\/h1>$/);
});

test('a heading written before sizes existed keeps the size its level implied', () => {
  const size = (level) => normalizeObjects([{ kind: 'heading', props: { text: 'x', level } }])[0]
    .props.headingSize;
  assert.equal(size('h2'), 'large');
  assert.equal(size('h3'), 'medium');
  assert.equal(size('h4'), 'small');
  // An unknown size falls back the same way rather than to a default.
  assert.equal(normalizeObjects([{ kind: 'heading', props: { text: 'x', level: 'h4', headingSize: 'huge' } }])[0]
    .props.headingSize, 'small');
});

test('a button takes a theme colour, and outline turns it into the edge', () => {
  const render = (props) => renderObject(normalizeObjects([{ kind: 'button', props }])[0], {});

  assert.match(render({ label: 'Go', colour: 'accent' }), /b-button__el b-button__el--c-accent"/);
  assert.match(render({ label: 'Go', colour: 'accent', outline: true }),
    /b-button__el--c-accent b-button__el--outline/);
  assert.match(render({ label: 'Go', colour: 'brand', buttonSize: 'large' }), /b-button__el--large/);
  // Medium is the default and carries no class of its own.
  assert.ok(!render({ label: 'Go', buttonSize: 'medium' }).includes('--medium'));
  // A colour is an id, never a value - the same rule as every other colour.
  assert.equal(normalizeObjects([{ kind: 'button', props: { label: 'x', colour: '#ff0000' } }])[0]
    .props.colour, '');
});

test('a button or a link can be asked to open in a new tab', () => {
  const draw = (kind, props) => renderObject(normalizeObjects([{ kind, props }])[0], {});

  for (const kind of ['button', 'link']) {
    const opened = draw(kind, { label: 'Go', href: 'https://example.com', newTab: true });
    assert.match(opened, /target="_blank"/, kind);
    /* Never `target` on its own: without `noopener` the page that opens can
       reach back through `window.opener` and navigate the tab it came from.
       `noreferrer` matches what the rich-text sanitiser adds to an author's
       own link, so the same link behaves the same made either way. */
    assert.match(opened, /rel="noopener noreferrer"/, kind);

    // Off, and unset, are the same thing: no attributes at all.
    for (const props of [{ label: 'Go', href: '/x', newTab: false }, { label: 'Go', href: '/x' }]) {
      const stays = draw(kind, props);
      assert.doesNotMatch(stays, /target=/, kind);
      assert.doesNotMatch(stays, /rel=/, kind);
    }
  }
});

test('a linked image opens in a new tab on the same switch', () => {
  /* An image is a link too when it carries one, and it is the *wrapper* that
     has to take the attributes - the picture inside is not the anchor. */
  const media = new Map([[7, { id: 7, filename: 'a.webp', mime: 'image/webp', variants: '', alt: '' }]]);
  const draw = (props) => renderObject(
    normalizeObjects([{ kind: 'image', props: { media: 7, ...props } }])[0], { media });

  const opened = draw({ href: 'https://example.com', newTab: true });
  assert.match(opened, /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">/);
  assert.doesNotMatch(draw({ href: 'https://example.com' }), /target=/);
  // Ticked with no link to open, there is simply no anchor to put it on.
  assert.doesNotMatch(draw({ newTab: true }), /<a /);
});

test('a PDF or a video is its own link, so the object never wraps one round it', () => {
  /* An anchor may not contain interactive content. A file chip and a video
     with controls are both interactive, so nesting the object's own link
     round them is markup the browser silently rewrites - it closes the outer
     anchor early - and a click would fight over what it meant. */
  const item = (mime, filename) => new Map([[7, {
    id: 7, filename, mime, variants: '', alt: '', original_name: filename,
  }]]);
  const draw = (media, props) => renderObject(
    normalizeObjects([{ kind: 'image', props: { media: 7, href: 'https://example.com', ...props } }])[0],
    { media });

  const pdf = draw(item('application/pdf', 'report.pdf'));
  // Its own link is there and opens away; the object's is not drawn at all.
  assert.match(pdf, /<a class="block-file"[^>]*target="_blank"/);
  assert.doesNotMatch(pdf, /<a href="https:\/\/example\.com"/);
  // One anchor on the figure, never two.
  assert.equal((pdf.match(/<a /g) || []).length, 1);

  const video = draw(item('video/mp4', 'clip.mp4'));
  assert.match(video, /<video controls/);
  assert.equal((video.match(/<a /g) || []).length, 0);

  // A picture is not interactive, so it takes the link as it always did.
  const picture = draw(item('image/webp', 'photo.webp'), { newTab: true });
  assert.match(picture, /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">/);
});

test('a button or a link written before the new-tab switch existed stays put', () => {
  /* The stored shape gains a `false`, which is what the panel needs to show a
     cleared checkbox - but nothing already on a page starts opening tabs. */
  for (const kind of ['button', 'link']) {
    const [obj] = normalizeObjects([{ kind, props: { label: 'x', href: '/y' } }]);
    assert.equal(obj.props.newTab, false, kind);
    assert.doesNotMatch(renderObject(obj, {}), /target=/, kind);
  }
  const [img] = normalizeObjects([{ kind: 'image', props: { media: 3, href: '/y' } }]);
  assert.equal(img.props.newTab, false);
  // Anything truthy but the string "false" turns it on, as the other switches do.
  const on = (v) => normalizeObjects([{ kind: 'link', props: { label: 'x', newTab: v } }])[0].props.newTab;
  assert.equal(on('false'), false);
  assert.equal(on(''), false);
  assert.equal(on(undefined), false);
  assert.equal(on(true), true);
  assert.equal(on('on'), true);
});

test('a button written as a variant keeps the look it had', () => {
  const props = (variant) => normalizeObjects([{ kind: 'button', props: { label: 'x', variant } }])[0].props;
  // Accent was the one filled style.
  assert.deepEqual([props('accent').colour, props('accent').outline], ['accent', false]);
  // Default and ghost were both outlines, and neither named a palette colour.
  assert.deepEqual([props('default').colour, props('default').outline], ['', true]);
  assert.deepEqual([props('ghost').colour, props('ghost').outline], ['', true]);
});

test('themeCss gives every colour a filled and an outlined button', () => {
  const css = themeCss({
    colors: normalizeColors([{ name: 'Brand', value: '#ffcc1b', ink: '#1e1e1e' }]),
    fonts: normalizeFonts({}), layout: normalizeLayout({}),
  });
  assert.match(css, /\.b-button__el--c-brand\{background:var\(--c-brand\)/);
  assert.match(css, /\.b-button__el--outline\.b-button__el--c-brand\{background:transparent/);
  // Hover is a shade of the colour, not of its ink: mostly the colour.
  assert.match(css, /--c-brand:hover\{background:color-mix\(in srgb, var\(--c-brand-ink\) 16%/);
});

/* ---------------------------------------------------------------- anchors */

test('an anchor is a written name, folded to something a URL can hold', () => {
  assert.equal(anchorSlug('Vår plattform'), 'var-plattform');
  assert.equal(anchorSlug('  Two / three & four '), 'two-three-four');
  assert.equal(anchorSlug(''), '');
  // Nothing usable in it means no anchor at all, rather than a placeholder
  // that would look like a working link.
  assert.equal(anchorSlug('!!!'), '');
  assert.ok(anchorSlug('x'.repeat(200)).length <= 60);
});

test('an anchor survives every edit to the text beside it', () => {
  // The whole promise of an anchor: a link that keeps working. It is its own
  // stored field, never derived from the heading, so rewriting the heading -
  // or its size, level, colour or alignment - cannot move the link.
  const render = (text) => renderObject(normalizeObjects([{
    kind: 'heading', props: { text, anchor: 'var-plattform', headingSize: 'display', level: 'h1' },
  }])[0], {});
  assert.match(render('Vår plattform'), /id="var-plattform"/);
  assert.match(render('Something entirely different'), /id="var-plattform"/);
});

test('an anchor is emitted only when one was asked for', () => {
  const [plain] = normalizeObjects([{ kind: 'heading', props: { text: 'A' } }]);
  assert.ok(!renderObject(plain, {}).includes('id='));
  const [slice] = normalizeBlocks([{ type: 'slice', columns: [{ objects: [] }] }]);
  assert.ok(!renderBlock(slice, {}).includes('id='));
});

test('a section claims its anchor before anything inside it does', () => {
  const blocks = normalizeBlocks([
    { type: 'slice', props: { anchor: 'kontakt' },
      columns: [{ objects: [{ kind: 'heading', props: { text: 'K', anchor: 'kontakt' } }] }] },
    { type: 'slice', props: { anchor: 'kontakt' }, columns: [{ objects: [] }] },
  ]);
  const ctx = {};
  const html = blocks.map((b) => renderBlock(b, ctx)).join('');
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  // The section is what a link points at, so it wins its own name; duplicates
  // are numbered rather than silently colliding, which would send every link
  // to whichever came first.
  assert.deepEqual(ids, ['kontakt', 'kontakt-2', 'kontakt-3']);
});

/* ---------------------------------------------------------- page password */

/** A context carrying exactly the cookie a visitor would have after unlocking. */
const unlockedCtx = (pageId, password) => ({
  cookies: { [unlockCookieName(pageId)]: unlockToken(pageId, password) },
});

test('a page with no password is open to everyone', () => {
  assert.equal(isUnlocked({ cookies: {} }, { id: 1, password: '' }), true);
  assert.equal(isUnlocked({}, { id: 1, password: '' }), true);
});

test('a locked page opens only for the cookie its own password makes', () => {
  const page = { id: 7, password: 'sesam' };
  assert.equal(isUnlocked(unlockedCtx(7, 'sesam'), page), true);
  assert.equal(isUnlocked({ cookies: {} }, page), false);
  assert.equal(isUnlocked({ cookies: { [unlockCookieName(7)]: 'made-up' } }, page), false);
});

test('an unlock cookie is good for one page only', () => {
  // Otherwise unlocking the cheap page would open the expensive one.
  assert.equal(isUnlocked(unlockedCtx(8, 'sesam'), { id: 7, password: 'sesam' }), false);
  assert.notEqual(unlockToken(7, 'sesam'), unlockToken(8, 'sesam'));
});

test('changing the password shuts out everyone already let in', () => {
  // The cookie is an HMAC of the password, so there is no separate list of
  // visitors to invalidate - the old cookie simply stops matching.
  const before = unlockedCtx(7, 'sesam');
  assert.equal(isUnlocked(before, { id: 7, password: 'sesam' }), true);
  assert.equal(isUnlocked(before, { id: 7, password: 'nytt-losen' }), false);
});

test('a preview is the editor\u2019s own view and is never gated', () => {
  // It already sits behind the CMS guard; asking again would ask the person
  // who set the password to type it.
  assert.equal(isUnlocked({ cookies: {} }, { id: 7, password: 'sesam', isPreview: true }), true);
});

test('an empty submission never matches, password or not', () => {
  assert.equal(passwordMatches({ id: 7, password: 'sesam' }, ''), false);
  assert.equal(passwordMatches({ id: 7, password: 'sesam' }, 'sesam'), true);
  // An unprotected page has nothing to match, so nothing does.
  assert.equal(passwordMatches({ id: 7, password: '' }, ''), false);
});

/* ------------------------------------------------------------ article feeds */

const feedBlock = (props) => normalizeObjects([{ kind: 'articles', props }])[0];

test('a feed written before subjects were plural keeps the one it had', () => {
  // `category` was a single id. Nothing already placed on a page may change.
  assert.deepEqual(feedBlock({ category: 5, limit: 6 }).props.categories, [5]);
  assert.deepEqual(feedBlock({ category: '5' }).props.categories, [5]);
  assert.deepEqual(feedBlock({ category: null }).props.categories, []);
});

test('a feed draws from several subjects, deduped and cleaned', () => {
  assert.deepEqual(feedBlock({ categories: [5, '6', 5, 0, 'x', -2] }).props.categories, [5, 6]);
  // No subjects is not "no articles": it is every subject, which is the
  // news page - so the empty list has to survive normalisation intact.
  assert.deepEqual(feedBlock({ categories: [] }).props.categories, []);
});

test('what a feed does past its first batch is one of three things', () => {
  assert.equal(feedBlock({}).props.more, 'none');
  assert.equal(feedBlock({ more: 'scroll' }).props.more, 'scroll');
  assert.equal(feedBlock({ more: 'button' }).props.more, 'button');
  assert.equal(feedBlock({ more: 'everything' }).props.more, 'none');
  // `limit` is the batch size now, and still capped: "all at once" is what
  // `more` is for, never a number big enough to render the whole table.
  assert.equal(feedBlock({ limit: 999 }).props.limit, 24);
});

test('a feed is newest first unless it asks to be random', () => {
  // Feeds placed before there was a choice keep the order they always had.
  assert.equal(feedBlock({}).props.order, 'newest');
  assert.equal(feedBlock({ order: 'random' }).props.order, 'random');
  assert.equal(feedBlock({ order: 'shuffle' }).props.order, 'newest');
});

test('a random feed never loads more', () => {
  // The next batch would be a new shuffle, and repeat what the first showed.
  assert.equal(feedBlock({ order: 'random', more: 'scroll' }).props.more, 'none');
  assert.equal(feedBlock({ order: 'random', more: 'button' }).props.more, 'none');
  assert.equal(feedBlock({ order: 'newest', more: 'scroll' }).props.more, 'scroll');
});

/** A feed rendered against a stubbed resolver, so no database is involved. */
const renderFeed = (props, feed) => renderObject(
  { id: 'feed01', kind: 'articles', props: feedBlock(props).props, style: {} },
  { path: '/nyheter', feedFor: () => feed });

const oneArticle = { id: 1, title: 'A', slug: 'a', created_at: '2026-01-01 00:00:00' };

test('a feed only offers to load more while there is more', () => {
  // A "Show more" that loads nothing is worse than no button at all.
  const withMore = renderFeed({ more: 'button' },
    { items: [oneArticle], hasMore: true, chips: [], active: null });
  assert.match(withMore, /data-feed-more/);
  assert.match(withMore, /data-offset="1"/);

  const atEnd = renderFeed({ more: 'button' },
    { items: [oneArticle], hasMore: false, chips: [], active: null });
  assert.ok(!atEnd.includes('data-feed-more'));
});

test('a feed set to show nothing more carries no loading hooks at all', () => {
  const plain = renderFeed({ more: 'none' },
    { items: [oneArticle], hasMore: true, chips: [], active: null });
  assert.ok(!plain.includes('data-feed='));
  assert.ok(!plain.includes('data-feed-more'));
});

test('a random feed carries no loading hooks, whatever it was stored with', () => {
  const random = renderFeed({ order: 'random', more: 'scroll' },
    { items: [oneArticle], hasMore: true, chips: [], active: null });
  assert.ok(!random.includes('data-feed='));
  assert.ok(!random.includes('data-feed-more'));
});

test('subject chips are drawn only when the feed was asked for them', () => {
  const chips = [{ id: 5, name: 'Produktion', slug: 'produktion' }];
  const feed = { items: [oneArticle], hasMore: false, chips, active: 5, activeSlug: 'produktion' };
  const on = renderFeed({ filter: true }, feed);
  assert.match(on, /chip-row/);
  assert.match(on, /category=produktion/);
  // The chip standing for what is showing says so, and "All" then does not.
  assert.match(on, /class="chip is-active"[^>]*href="\/nyheter\?category=produktion"/);
  assert.match(on, /<a class="chip" href="\/nyheter">All<\/a>/);
  assert.ok(!renderFeed({ filter: false }, feed).includes('chip-row'));
});

test('each layout puts its articles in the box that layout needs', () => {
  const feed = { items: [oneArticle], hasMore: false, chips: [], active: null };
  assert.match(renderFeed({ layout: 'grid' }, feed), /class="card-grid" data-feed-items/);
  assert.match(renderFeed({ layout: 'list' }, feed), /class="article-list" data-feed-items/);
  assert.match(renderFeed({ layout: 'feature' }, feed), /class="article-features" data-feed-items/);
});

test('a document stored without block ids does not read as edited', () => {
  // normalizeBlocks mints an id for any block that arrives without one, so
  // comparing the raw normalised output made a page compare unequal to
  // itself - and read as "Live · edited" forever, with nothing to publish.
  const stored = JSON.stringify([
    { type: 'slice', columns: [{ objects: [{ kind: 'text', props: { html: '<p>Samma</p>' } }] }] },
  ]);
  const row = hydrateForTest({ status: 'published', content: stored, draft_content: stored });
  assert.equal(row.hasDraftChanges, false);
});

test('a real edit is still an edit once ids are ignored', () => {
  const live = JSON.stringify([
    { type: 'slice', id: 'aaaa1111', columns: [{ objects: [{ kind: 'text', props: { html: '<p>Ett</p>' } }] }] },
  ]);
  const draft = JSON.stringify([
    { type: 'slice', id: 'aaaa1111', columns: [{ objects: [{ kind: 'text', props: { html: '<p>Två</p>' } }] }] },
  ]);
  assert.equal(hydrateForTest({ status: 'published', content: live, draft_content: draft })
    .hasDraftChanges, true);
});

test('an article is written with the page objects, less a page\u2019s furniture', () => {
  // A comparison piece wants a table and a two-up wants columns, and both
  // were already built. What an article has no use for is the three objects
  // about a *page's* place in the site.
  assert.ok(ARTICLE_OBJECT_ORDER.includes('table'));
  assert.ok(ARTICLE_OBJECT_ORDER.includes('image'));
  assert.ok(ARTICLE_OBJECT_ORDER.includes('quote'));
  for (const kind of ['breadcrumbs', 'articles', 'form']) {
    assert.ok(!ARTICLE_OBJECT_ORDER.includes(kind), kind);
    assert.equal(allowedInArticle(kind), false, kind);
  }
  // A form field has nowhere to live once the form itself is gone.
  assert.equal(allowedInArticle('fieldEmail'), false);
});

test('a block of text sizes itself without becoming a heading', () => {
  // An intro under a hero is body copy that happens to be larger. Making it
  // an h2 to get the size puts a rung in the page's outline nobody asked for.
  const size = (props) => normalizeObjects([{ kind: 'text', props }])[0].props.textSize;
  assert.equal(size({ html: '<p>x</p>' }), 'body');
  assert.equal(size({ html: '<p>x</p>', textSize: 'xlarge' }), 'xlarge');
  assert.equal(size({ html: '<p>x</p>', textSize: 'gigantic' }), 'body');
  assert.deepEqual(TEXT_SIZES, ['small', 'body', 'large', 'xlarge']);
});

test('body is the default size and emits no class of its own', () => {
  // So a page written before text had sizes renders exactly as it always did.
  const render = (props) => renderObject(normalizeObjects([{ kind: 'text', props }])[0], {});
  assert.match(render({ html: '<p>x</p>' }), /class="b-text"/);
  assert.match(render({ html: '<p>x</p>', textSize: 'body' }), /class="b-text"/);
  assert.match(render({ html: '<p>x</p>', textSize: 'large' }), /class="b-text b-text--large"/);
});

/* ------------------------------------------------------------------ cards */

const colClasses = (col) => {
  const [block] = normalizeBlocks([{ type: 'slice', columns: [col] }]);
  return /class="([^"]*b-slice__col[^"]*)"/.exec(renderBlock(block, {}))[1];
};

test('a plain column carries no card classes at all', () => {
  const classes = colClasses({ objects: [] });
  assert.equal(classes, 'b-slice__col');
});

test('a surface or an outline turns a column into a card', () => {
  // A card is a box, and a box is layout - which is the slice's business,
  // not an object's. It also means columns line up for free.
  assert.match(colClasses({ surface: 'white', objects: [] }), /\bb-card\b/);
  assert.match(colClasses({ surface: 'white', objects: [] }), /\bb-surface--white\b/);
  assert.match(colClasses({ border: true, objects: [] }), /\bb-card--bordered\b/);
  // A background needs no outline and an outline needs no background.
  assert.ok(!colClasses({ surface: 'white', objects: [] }).includes('b-card--bordered'));
  assert.ok(!colClasses({ border: true, objects: [] }).includes('b-surface--'));
});

test('the default corner carries no class, like every other default', () => {
  assert.ok(!colClasses({ surface: 'white', objects: [] }).includes('b-card--r-'));
  assert.match(colClasses({ surface: 'white', radius: 'none', objects: [] }), /b-card--r-none/);
  assert.match(colClasses({ surface: 'white', radius: 'large', objects: [] }), /b-card--r-large/);
  // Nonsense falls back to the default, which is the demo site's 16px.
  assert.ok(!colClasses({ surface: 'white', radius: 'enormous', objects: [] }).includes('b-card--r-'));
});

test('an outline reuses the line vocabulary tables already share', () => {
  const classes = colClasses({ border: true, borderStyle: 'dashed', borderWidth: 'thick',
    borderColor: 'accent', objects: [] });
  assert.match(classes, /b-line--dashed/);
  assert.match(classes, /b-line--w-thick/);
  assert.match(classes, /b-line--c-accent/);
  // Line classes belong to the outline, not to a column that has none.
  assert.ok(!colClasses({ surface: 'white', borderStyle: 'dashed', objects: [] })
    .includes('b-line--dashed'));
});

test('a column surface is a theme colour id, never a value', () => {
  assert.equal(colClasses({ surface: '#ff0000', objects: [] }), 'b-slice__col');
  assert.match(colClasses({ surface: 'brand-yellow', objects: [] }), /b-surface--brand-yellow/);
});

test('a card survives being planted from the slice library', () => {
  // The whole column travels, not a list of the props someone remembered to
  // name: a card that arrives stripped is what a whitelist copy looks like.
  const block = instantiateSlice({
    id: 4,
    name: 'Two cards',
    definition: JSON.stringify({
      type: 'slice',
      props: { ratio: 'half' },
      columns: [
        { surface: 'sand', border: true, radius: 'large', borderStyle: 'dashed',
          borderWidth: 'thick', borderColor: 'accent', align: 'center',
          objects: [{ kind: 'heading', props: { text: 'Left' } }] },
        { objects: [] },
      ],
    }),
  });
  const [card, plain] = block.columns;
  assert.equal(card.surface, 'sand');
  assert.equal(card.border, true);
  assert.equal(card.radius, 'large');
  assert.equal(card.borderStyle, 'dashed');
  assert.equal(card.borderWidth, 'thick');
  assert.equal(card.borderColor, 'accent');
  assert.equal(card.align, 'center');
  // The objects are the one part rebuilt, because only they carry ids.
  assert.equal(card.objects[0].props.text, 'Left');
  assert.equal(plain.surface, '');
  assert.equal(plain.border, false);
});

test('a table\u2019s rows and a message box\u2019s rows are different numbers', () => {
  const props = (kind, raw) => normalizeObjects([{ kind, props: raw }])[0].props;

  // A table may have exactly one row - two buttons side by side is a 1 x 2
  // table, and one shared floor of 2 made that impossible to express.
  assert.equal(props('table', { rows: 1, cols: 2 }).rows, 1);
  assert.equal(props('table', { rows: 1, cols: 2 }).cells.length, 1);
  assert.equal(props('table', {}).rows, 3);

  // A message box is a height in lines, and one line is not a box.
  assert.equal(props('fieldTextarea', { rows: 1 }).rows, 2);
  assert.equal(props('fieldTextarea', {}).rows, 6);
  assert.equal(props('fieldTextarea', { rows: 9 }).rows, 9);

  // Both still cap.
  assert.equal(props('table', { rows: 999 }).rows, 20);
  assert.equal(props('fieldTextarea', { rows: 999 }).rows, 20);
});

test('the type scale is nine numbers the theme owns', () => {
  // The steps are far enough apart to be told apart. Extra large used to sit
  // nearer Large than Display, and small text nearer body than a caption.
  const d = DEFAULT_TYPE;
  assert.ok(d.hXlarge / d.hLarge > 1.4, 'extra large is a step up from large');
  assert.ok(d.hDisplay / d.hXlarge > 1.4, 'display is a step up from extra large');
  assert.ok(d.tBody / d.tSmall > 1.25, 'small text reads as smaller than body');

  const t = normalizeType({ hLarge: 44, tSmall: '11', hDisplay: 'huge', tBody: 9999 });
  assert.equal(t.hLarge, 44);
  assert.equal(t.tSmall, 11);              // a number as a string is a number
  assert.equal(t.hDisplay, d.hDisplay);    // nonsense falls back
  assert.equal(t.tBody, TYPE_LIMITS[1]);   // and everything caps
  assert.equal(normalizeType(null).hMedium, d.hMedium);
  assert.equal(normalizeType({ hSmall: 0 }).hSmall, TYPE_LIMITS[0]);
});

test('every theme setting has a home in the settings schema', () => {
  // SCHEMA is an allowlist: a key missing from it reads back null and writes
  // nowhere, so a whole theme section saves to a redirect and no error.
  for (const key of ['theme_colors', 'theme_fonts', 'theme_layout', 'theme_type']) {
    assert.ok(key in SETTINGS_SCHEMA, `${key} is missing from the settings schema`);
  }
});

test('the theme emits every named size as a pixel value', () => {
  const css = themeCss({
    colors: DEFAULT_COLORS, fonts: DEFAULT_FONTS, layout: DEFAULT_LAYOUT,
    type: { ...DEFAULT_TYPE, hXlarge: 52 }, installed: INSTALLED,
  });
  assert.match(css, /--h-xlarge:52px/);
  assert.match(css, /--t-small:13px/);
  assert.match(css, /--h-display:80px/);

  // A theme saved before sizes existed still emits the full set, or every
  // heading on the site would fall back to whatever tokens.css last said.
  const old = themeCss({ colors: DEFAULT_COLORS, fonts: DEFAULT_FONTS, layout: DEFAULT_LAYOUT, installed: INSTALLED });
  assert.match(old, /--h-large:30px/);
  assert.match(old, /--t-body:17px/);
});

/* ------------------------------------------------------ scheduled publishing */

test('a schedule is said as a day and a time', () => {
  /* Nobody schedules for 2026-09-14 in their head; they schedule for Monday.
     Within the week it is the weekday, past that the date. */
  const now = new Date(2026, 8, 10, 12, 0, 0);            // Thursday 10 Sept, local
  const at = (y, m, d, h, min = 0) =>
    new Date(y, m, d, h, min).toISOString().slice(0, 19).replace('T', ' ');

  assert.deepEqual(scheduleDate(at(2026, 8, 10, 15), undefined, now), { day: 'today', time: '15:00' });
  assert.deepEqual(scheduleDate(at(2026, 8, 11, 8), undefined, now), { day: 'tomorrow', time: '08:00' });
  assert.deepEqual(scheduleDate(at(2026, 8, 14, 8, 30), undefined, now), { day: 'Monday', time: '08:30' });
  assert.deepEqual(scheduleDate(at(2026, 8, 17, 8), undefined, now), { day: '2026-09-17', time: '08:00' });
  assert.equal(scheduleDate('', undefined, now), null);

  // By calendar day: half past midnight is tomorrow, however close it is.
  const lateEvening = new Date(2026, 8, 10, 23, 50);
  assert.equal(scheduleDate(at(2026, 8, 11, 0, 30), undefined, lateEvening).day, 'tomorrow');
});

test('a publish time is stored to the minute, and only if it is still ahead', () => {
  const now = new Date('2026-09-16T10:00:00Z');
  assert.deepEqual(parsePublishAt('2026-09-17T06:00:00.000Z', now), { at: '2026-09-17 06:00:00' });
  // The clock ticks on the minute, so seconds would only make it late.
  assert.deepEqual(parsePublishAt('2026-09-17T06:00:42.500Z', now), { at: '2026-09-17 06:00:00' });

  assert.match(parsePublishAt('2026-09-16T09:59:00Z', now).error, /passed/);
  // The current minute has passed too, once its seconds are dropped.
  assert.match(parsePublishAt('2026-09-16T10:00:30Z', now).error, /passed/);
  for (const nonsense of ['', null, undefined, 'tomorrow', '+020266-09-17T06:00:00Z']) {
    assert.ok(parsePublishAt(nonsense, now).error, String(nonsense));
  }
});

/* In this server's own time, like every date the site shows - so the
   expected values are built the same way rather than written out in UTC. */
const sqlOf = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

test('an article is dated today or earlier, at midday, and never ahead', () => {
  const now = new Date(2026, 8, 22, 9, 30);
  assert.deepEqual(parsePublishedOn('2023-05-12', now), { at: sqlOf(new Date(2023, 4, 12, 12)) });
  // Today is midday or now, whichever came first: dated a few hours ahead, a
  // live article would sort above everything that went out this morning.
  assert.deepEqual(parsePublishedOn('2026-09-22', now), { at: sqlOf(now) });
  assert.deepEqual(parsePublishedOn('2026-09-22', new Date(2026, 8, 22, 15)),
    { at: sqlOf(new Date(2026, 8, 22, 12)) });
  // Later is what Schedule is for.
  assert.match(parsePublishedOn('2026-09-23', now).error, /Schedule/);
  // Empty is an answer: the day the article goes out.
  assert.deepEqual(parsePublishedOn('', now), { at: null });
  // Not dates: rolled over, a year half typed, the wrong shape.
  for (const bad of ['2026-02-31', '0002-01-01', '0202-05-12', '12/05/2023', 'igår']) {
    assert.ok(parsePublishedOn(bad, now).error, bad);
  }
});

test('the date field shows the day a stored time falls on here', () => {
  // Half past midnight in Sweden is still the day before in UTC.
  assert.equal(localDay(sqlOf(new Date(2023, 4, 12, 0, 30))), '2023-05-12');
  assert.equal(localDay(null), '');
});

const SOON = '2099-01-05 07:00:00';

test('a schedule outranks edited in the status pill, and carries a clock', () => {
  const scheduled = statusPill('draft', false, { at: SOON, edited: false });
  assert.match(scheduled, /pill--scheduled/);
  assert.match(scheduled, />Scheduled</);
  assert.match(scheduled, /<svg/);

  const liveScheduled = statusPill('published', true, { at: SOON, edited: true });
  assert.match(liveScheduled, /Live · scheduled/);
  assert.doesNotMatch(liveScheduled, /edited/);

  // Nothing scheduled: the three states it always had.
  assert.match(statusPill('draft'), /Draft/);
  assert.match(statusPill('published', true), /Live · edited/);
  assert.match(statusPill('published', false), />Live</);
});

test('the action bar offers what each state can do', () => {
  const buttons = (doc) => [...editorActions(doc).matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)]
    .map(([, attrs, label]) => `${label.replace(/<svg[\s\S]*?<\/svg>/g, '').trim()}${/\shidden/.test(attrs) ? ' (hidden)' : ''}`);

  assert.deepEqual(buttons({ status: 'draft' }), ['Schedule', 'Publish']);
  // Nothing to put out on a settled live page, so nothing to schedule.
  assert.deepEqual(buttons({ status: 'published' }),
    ['Discard changes (hidden)', 'Unpublish', 'Schedule (hidden)', 'Publish changes']);
  assert.deepEqual(buttons({ status: 'published', hasDraftChanges: true }),
    ['Discard changes', 'Unpublish', 'Schedule', 'Publish changes']);

  // Publishing overtakes a schedule, so the button says so.
  assert.deepEqual(buttons({ status: 'draft', schedule: { at: SOON, edited: false } }),
    ['Discard changes (hidden)', 'Edit schedule', 'Publish now']);
  assert.deepEqual(buttons({ status: 'published', hasDraftChanges: true, schedule: { at: SOON, edited: true } }),
    ['Include them', 'Discard changes', 'Unpublish', 'Edit schedule', 'Publish now']);
});

test('while scheduled, Discard goes back to the scheduled copy and the bar says when', () => {
  const bar = editorActions({ status: 'published', hasDraftChanges: true, schedule: { at: SOON, edited: false } });
  assert.match(bar, /data-discard="scheduled"/);
  assert.match(bar, /Changes go live/);
  assert.match(bar, new RegExp(`data-at="${SOON}"`));
  // Edits made since are named only once there are some.
  assert.doesNotMatch(bar, /latest edits/);
  assert.match(editorActions({ status: 'draft', schedule: { at: SOON, edited: true } }),
    /Goes live [^<]*, without the latest edits/);

  assert.match(editorActions({ status: 'published', hasDraftChanges: true }), /data-discard="live"/);
});

test('an address is frozen by being live or by being scheduled', () => {
  assert.equal(addressState({ status: 'draft' }), 'free');
  assert.equal(addressState({ status: 'draft', schedule: { at: SOON } }), 'scheduled');
  // Live wins: taking the page down is what frees it, and that calls the schedule off too.
  assert.equal(addressState({ status: 'published', schedule: { at: SOON } }), 'live');
  assert.equal(addressState(null), 'free');
  assert.equal(scheduleCell(null), '');
  assert.match(scheduleCell({ at: SOON }), /2099-01-05 \d{2}:\d{2}/);
});

test('a scheduled document knows whether it has moved on since', () => {
  const body = (text) => JSON.stringify([
    { type: 'slice', columns: [{ objects: [{ kind: 'text', props: { html: `<p>${text}</p>` } }] }] },
  ]);
  const base = {
    status: 'draft', title: 'Kampanj', page_type: 'default', content: '[]',
    draft_content: body('Ett'), scheduled_at: SOON, scheduled_content: body('Ett'),
    scheduled_meta: JSON.stringify({ title: 'Kampanj', page_type: 'default' }),
  };
  assert.equal(hydrateForTest({ ...base, scheduled_at: null }).schedule, null);
  assert.equal(hydrateForTest(base).schedule.edited, false);
  assert.equal(hydrateForTest(base).schedule.at, SOON);
  assert.equal(hydrateForTest({ ...base, draft_content: body('Två') }).schedule.edited, true);
  // A setting counts, whether it sits on the row or waits in draft_meta.
  assert.equal(hydrateForTest({ ...base, title: 'Kampanj!' }).schedule.edited, true);
  assert.equal(hydrateForTest({ ...base, status: 'published', draft_meta: '{"page_type":"blank"}' })
    .schedule.edited, true);
});

/* ------------------------------------------------------------- appearance */

const cmsTokens = readFileSync(new URL('../www/assets/cms-tokens.css', import.meta.url), 'utf8');
const cmsCss = readFileSync(new URL('../www/assets/cms.css', import.meta.url), 'utf8');
const tokenBlock = (selector) => {
  const start = cmsTokens.indexOf(`${selector} {`);
  assert.ok(start >= 0, `no ${selector} block`);
  const body = cmsTokens.slice(start, cmsTokens.indexOf('\n}', start));
  // Declarations, not uses: a name followed by a colon, several to a line at times.
  return new Set([...body.matchAll(/(--ui-[\w-]+)\s*:/g)].map((m) => m[1]));
};

test('every token the CMS stylesheet asks for is one the light set defines', () => {
  // A misspelt var() does not fail - it silently draws nothing, which in dark
  // mode means a dark rule quietly left in its light colour.
  const light = tokenBlock(':root[data-appearance="dark"] .theme-preview__type');
  const used = new Set([...cmsCss.matchAll(/var\((--ui-[\w-]+)/g)].map((m) => m[1]));
  const missing = [...used].filter((name) => !light.has(name));
  assert.deepEqual(missing, []);
});

test('the dark set only overrides names the light set has', () => {
  // A dark-only name would be a colour light mode never draws.
  const light = tokenBlock(':root[data-appearance="dark"] .theme-preview__type');
  const dark = tokenBlock(':root[data-appearance="dark"]');
  assert.ok(dark.size > 20);
  assert.deepEqual([...dark].filter((name) => !light.has(name)), []);
});

test('the appearance is decided in the head, before any stylesheet', () => {
  /* Deferred, or placed after the stylesheets, it would paint a light screen
     and then switch - the white flash that dark mode exists to avoid. */
  for (const [where, page] of [
    ['CMS', cmsLayout({ title: 'T', user: { full_name: 'A B', email: 'a@b.se' }, path: '/cms', center: '' })],
    ['sign-in', loginView()],
  ]) {
    const head = page.slice(0, page.indexOf('</head>'));
    const script = head.search(/<script src="\/assets\/cms-appearance\.js[^"]*"><\/script>/);
    assert.ok(script > 0, `${where}: no appearance script in the head`);
    assert.ok(script < head.indexOf('rel="stylesheet"'), `${where}: script comes after a stylesheet`);
    // The mark is drawn in the chrome's ink, so it follows either appearance.
    assert.match(page, /<svg[^>]*>\s*<rect[^>]*fill="currentColor"/);
    assert.doesNotMatch(page, /--for-(light|dark)/);
  }
});


/* ---------------------------------------------------- the site's own words */

const EN = siteWords('en');

/** A site context of the kind buildContext makes, in a given language. */
const siteCtx = (lang, extra = {}) => ({
  lang, words: siteWords(lang), settings: { site_name: 'S' },
  mainTree: [], extraTree: [], footerTree: [], path: '/', ...extra,
});

test('every language says everything English says, in the same shape', () => {
  // A missing word draws as nothing at all, and a missing *function* draws as
  // a crash - so the shapes have to match, not just the key names.
  for (const lang of LANGUAGES) {
    const words = siteWords(lang);
    for (const [key, value] of Object.entries(EN)) {
      assert.equal(typeof words[key], typeof value, `${lang}.${key} is the wrong kind`);
      assert.ok(words[key], `${lang}.${key} is empty`);
    }
  }
});

test('nothing but English still reads in English', () => {
  /* English sits underneath every other language so a word added and not yet
     translated draws as English rather than as a blank. That is a safety net,
     not a way of working: anything actually falling through is meant to be
     found here rather than on a page. */
  for (const lang of LANGUAGES.filter((l) => l !== 'en')) {
    const words = siteWords(lang);
    const untranslated = Object.keys(EN).filter((key) => String(words[key]) === String(EN[key]));
    assert.deepEqual(untranslated, [], `${lang}: still English`);
  }
});

test('a language is found by its own subtag, and keeps the region it named', () => {
  // sv, sv-SE and sv-FI are all Swedish; only the dates differ.
  assert.equal(siteWords('sv').readMore, siteWords('sv-FI').readMore);
  assert.equal(siteWords('SV').readMore, siteWords('sv').readMore);
  assert.equal(siteWords('sv-FI').locale, 'sv-FI');
  // A plain tag takes the language's own default region.
  assert.equal(siteWords('sv').locale, 'sv-SE');
  assert.equal(siteWords('en').locale, 'en-GB');
  // ...and a site that asks for another one gets it, which is the only way
  // to say "September 7" rather than "7 September".
  assert.equal(siteWords('en-US').locale, 'en-US');
});

test('a language with no words of its own is furnished in English, and still says what it is', () => {
  assert.equal(siteWords('de').readMore, 'Read more');
  assert.equal(siteWords('').readMore, 'Read more');
  // The lang attribute is about the content, not about the furniture: a
  // German site is German even where the CMS has nothing German to say.
  const page = siteLayout({ title: 'T', content: '', ctx: siteCtx('de') });
  assert.match(page, /<html lang="de">/);
  assert.match(page, /Skip to content/);
});

test('the shell speaks the site\'s language, aria-labels included', () => {
  /* An aria-label is a word too - it is what a screen reader says out loud -
     so a Swedish site announcing "Main menu" is making the same mistake as
     one printing it, just to fewer people. */
  const page = siteLayout({
    title: 'T', content: '', trail: [{ label: 'Om oss', href: '/om-oss' }],
    submenu: [{ label: 'Historia', href: '/om-oss/historia' }],
    ctx: siteCtx('sv', { mainTree: [{ label: 'Hem', href: '/' }] }),
  });
  assert.match(page, /<html lang="sv">/);
  assert.match(page, /href="#main">Hoppa till innehållet</);
  assert.match(page, /aria-label="Meny"/);
  assert.match(page, /aria-label="Huvudmeny"/);
  assert.match(page, /aria-label="Undermeny"/);
  assert.match(page, /aria-label="Brödsmulor"/);
  assert.match(page, /aria-label="Startsida"/);
  assert.doesNotMatch(page, /Skip to content|Breadcrumbs/);
});

test('the password gate asks in the site\'s language', () => {
  const gate = passwordGate({ title: 'Intern', permalink: '/intern' }, siteCtx('sv'));
  assert.match(gate, /Den här sidan är skyddad/);
  assert.match(gate, />Lösenord</);
  assert.match(gate, />Visa</);
  // A gate rendered with no context at all is still a gate, in English.
  assert.match(passwordGate({ title: 'X', permalink: '/x' }, null), />View</);
});

test('a feed says Read more, Show more and All in the site\'s language', () => {
  const ctx = { ...siteCtx('sv'), path: '/nyheter' };
  const feed = (props, batch) => renderObject(
    { id: 'feed01', kind: 'articles', props: feedBlock(props).props, style: {} },
    { ...ctx, feedFor: () => batch });

  const withChips = feed({ more: 'button', filter: true }, {
    items: [oneArticle], hasMore: true, active: null,
    chips: [{ id: 3, name: 'Nyheter', slug: 'nyheter' }],
  });
  assert.match(withChips, /aria-label="Ämnen"/);
  assert.match(withChips, /class="chip is-active" href="\/nyheter">Alla</);
  assert.match(withChips, /data-feed-more>Visa fler</);

  const empty = feed({}, { items: [], hasMore: false, chips: [], active: null });
  assert.match(empty, /Inga publicerade artiklar än\./);

  /* The load-more endpoint renders the next batch with feedItems directly,
     so the words have to reach it by the same route the first batch's did -
     or a Swedish feed would turn English halfway down. */
  assert.match(feedItems([oneArticle], 'list', siteWords('sv')), /Läs mer/);
  assert.match(feedItems([oneArticle], 'list'), /Read more/);
});

test('a form is sent and thanked for in the site\'s language', () => {
  const [placed] = normalizeObjects([{ kind: 'form', props: { formId: 4 } }]);
  const stored = { id: 4, name: 'Kontakt', objects: [], colour: 'brand', button_size: 'normal' };
  const ctx = { ...siteCtx('sv'), forms: new Map([[4, stored]]), path: '/kontakt' };

  assert.match(renderObject(placed, ctx), /type="submit">Skicka</);
  // A form with its own wording keeps it: the author has spoken.
  assert.match(renderObject(placed, { ...ctx, forms: new Map([[4, { ...stored, submit_label: 'Iväg' }]]) }),
    /type="submit">Iväg</);
  assert.match(renderObject(placed, { ...ctx, flash: { formSentId: placed.id } }),
    /Tack för ditt meddelande!/);
});

test('what a form refuses is said in the site\'s language, and says which field', () => {
  const sv = siteWords('sv');
  assert.equal(sv.fillIn('Namn, E-post'), 'Fyll i: Namn, E-post.');
  assert.equal(EN.fillIn('Name'), 'Please fill in: Name.');
  // The field's own label leads, because that is what the visitor is looking
  // for on the page; only the qualifier is the site's to translate.
  assert.match(sv.needsEmail('E-post'), /^E-post \(/);
  assert.match(EN.needsPhone('Phone'), /^Phone \(a valid number\)$/);
});

test('a date on the site is written the way the site\'s language writes it', () => {
  const day = '2026-09-07 10:00:00';
  assert.equal(formatDateLong(day, siteWords('en').locale), '7 September 2026');
  assert.equal(formatDateLong(day, siteWords('sv').locale), '7 september 2026');
  assert.equal(formatDateLong(day, siteWords('en-US').locale), 'September 7, 2026');
  // The CMS is English whatever the site is, so its own default is unmoved.
  assert.equal(formatDateLong(day), '7 September 2026');
  assert.match(relativeDate('2026-09-07 10:00:00', undefined, new Date(2026, 8, 8)), /^Yesterday$/);
});

test('the CMS has no dictionary, and is not quietly growing one', () => {
  /* The house rule: the CMS interface is English and its strings sit inline
     beside their neighbours. The site's words are a separate thing, for the
     separate reason that the site has a language setting. A CMS screen
     reaching for this dictionary would be the first half of a second one. */
  const files = [
    ...readdirSync(new URL('../src/routes/cms', import.meta.url)).map((f) => `src/routes/cms/${f}`),
    ...readdirSync(new URL('../src/views/cms', import.meta.url)).map((f) => `src/views/cms/${f}`),
    'src/routes/cms.js', 'src/views/auth.js', 'src/views/icons.js',
  ];
  for (const file of files) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(!/words\.js/.test(src), `${file} imports the site's dictionary`);
  }
});


/* ------------------------------------------------------------------- zip */

/** Read an archive back far enough to check it says what it should. */
const readZip = (buf) => {
  // An empty archive is nothing but the end record, so index 0 is legal.
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'no end-of-central-directory record');
  const count = buf.readUInt16LE(end + 10);
  const dirAt = buf.readUInt32LE(end + 16);
  const entries = [];
  let at = dirAt;
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(at), 0x02014b50, 'central header signature');
    const method = buf.readUInt16LE(at + 10);
    const sum = buf.readUInt32LE(at + 16);
    const compressed = buf.readUInt32LE(at + 20);
    const size = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const offset = buf.readUInt32LE(at + 42);
    const name = buf.slice(at + 46, at + 46 + nameLen).toString('utf8');
    // Follow the offset to the local header and take the bytes back out.
    assert.equal(buf.readUInt32LE(offset), 0x04034b50, `local header for ${name}`);
    const localNameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const bodyAt = offset + 30 + localNameLen + extraLen;
    const body = buf.slice(bodyAt, bodyAt + compressed);
    entries.push({ name, method, sum, size, data: method === 8 ? zlib.inflateRawSync(body) : body });
    at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return entries;
};

test('crc32 matches the check value every implementation agrees on', () => {
  // The standard vector: "123456789" is 0xcbf43926. A wrong table produces an
  // archive that unpacks and then reports itself corrupt, which is worse than
  // one that fails outright.
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test('an archive round-trips its entries, names and bytes', () => {
  const files = [
    { name: 'manifest.json', data: Buffer.from('{"format":"slice-backup/1"}') },
    { name: 'data/cms.db', data: Buffer.from('x'.repeat(5000)) },
    { name: 'www/media/bild-å.svg', data: Buffer.from('<svg>Ärende</svg>', 'utf8') },
  ];
  const out = readZip(zip(files));
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((e) => e.name), files.map((f) => f.name));
  for (const [i, entry] of out.entries()) {
    assert.deepEqual(entry.data, files[i].data, entry.name);
    assert.equal(entry.size, files[i].data.length);
    assert.equal(entry.sum, crc32(files[i].data));
  }
});

test('what does not compress is stored rather than grown', () => {
  /* A WebP or a woff2 comes out of deflate larger than it went in. Storing it
     saves the bytes and the time, and an archive of a media folder is almost
     entirely this case. */
  const random = randomBytes(4096);
  const [stored] = readZip(zip([{ name: 'photo.webp', data: random }]));
  assert.equal(stored.method, 0, 'incompressible data should be stored');
  assert.deepEqual(stored.data, random);

  const [deflated] = readZip(zip([{ name: 'page.html', data: Buffer.from('a'.repeat(4096)) }]));
  assert.equal(deflated.method, 8, 'repetitive data should deflate');
});

test('an empty archive and an empty file are both legal', () => {
  // Both happen: a site with no uploads, and a zero-byte file in the library.
  assert.deepEqual(readZip(zip([])), []);
  const [empty] = readZip(zip([{ name: 'empty.txt', data: Buffer.alloc(0) }]));
  assert.equal(empty.size, 0);
  assert.equal(empty.data.length, 0);
});

test('a name is stored with forward slashes and flagged as UTF-8', () => {
  const buf = zip([{ name: 'www\\media\\x.png', data: Buffer.from('x') }]);
  assert.equal(readZip(buf)[0].name, 'www/media/x.png');
  // Bit 11 of the flags says the name is UTF-8; without it "å" is mojibake
  // on the other end.
  assert.equal(buf.readUInt16LE(6) & 0x0800, 0x0800);
});
