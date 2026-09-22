import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { all, get, run } from '../db/index.js';
import { slugify } from './util.js';

/**
 * The typefaces a site draws with.
 *
 * Uploaded, never fetched. This product asks no font CDN for anything: a page
 * that pulls its faces from fonts.gstatic.com hands every visitor's address,
 * browser and current URL to a third party on every view, which is the one
 * thing a server standing in your own building was supposed to stop. So the
 * files live here, beside the pictures, and the only way one arrives is that
 * somebody put it there.
 *
 * The cost is honest and worth saying out loud: you have to go and get your
 * own fonts. A fresh install ships exactly one family so it is never
 * typeface-less, and the picker offers what is installed rather than a
 * catalogue it cannot deliver.
 */

/* What a font file starts with. Extensions are what an uploader typed;
   these are what the file actually is, which is the only version worth
   trusting when the result gets written into the web root. */
const SIGNATURES = [
  { magic: 'wOF2', format: 'woff2',    ext: '.woff2', mime: 'font/woff2' },
  { magic: 'wOFF', format: 'woff',     ext: '.woff',  mime: 'font/woff' },
  { magic: 'OTTO', format: 'opentype', ext: '.otf',   mime: 'font/otf' },
  { magic: 'true', format: 'truetype', ext: '.ttf',   mime: 'font/ttf' },
  { magic: 'ttcf', format: 'truetype', ext: '.ttc',   mime: 'font/collection' },
  // A plain TrueType file opens with the version number 1.0 as four bytes.
  { magic: '\x00\x01\x00\x00', format: 'truetype', ext: '.ttf', mime: 'font/ttf' },
];

/** What a buffer actually is, or null when it is not a font at all. */
export function sniffFont(data) {
  const head = Buffer.from(data || []).subarray(0, 4).toString('latin1');
  return SIGNATURES.find((s) => s.magic === head) || null;
}

/**
 * The weights a face can carry.
 *
 * `variable` is not a weight but a range, and has to be offered: a variable
 * font is one file covering the whole axis, which is how Inter ships and how
 * most modern families are downloaded. Declaring it as 400 would leave the
 * browser synthesising a fake bold from a file that already has a real one.
 */
export const WEIGHTS = [
  ['100 900', 'Variable — every weight'],
  ['100', '100 Thin'], ['200', '200 Extra light'], ['300', '300 Light'],
  ['400', '400 Regular'], ['500', '500 Medium'], ['600', '600 Semi bold'],
  ['700', '700 Bold'], ['800', '800 Extra bold'], ['900', '900 Black'],
];
const WEIGHT_VALUES = new Set(WEIGHTS.map((w) => w[0]));

export const STYLES = [['normal', 'Upright'], ['italic', 'Italic']];

export const FALLBACKS = [
  ['sans', 'Sans serif'], ['serif', 'Serif'], ['mono', 'Monospace'],
];

/**
 * Which characters a file actually holds.
 *
 * Open fonts are distributed subset: Fontsource and Google both hand you
 * `inter-latin-400-normal.woff2` and `inter-latin-ext-400-normal.woff2` as
 * separate files. Without saying which is which, two faces of the same weight
 * and style are the same declaration written twice and the second simply
 * replaces the first - so half an uploaded family would go quietly dead.
 *
 * Saying it also means nothing is downloaded until a page needs it. A Swedish
 * page never fetches the 85 KB of Latin Extended; the moment a name like
 * Șerban appears on one, it does.
 *
 * The ranges are Google's own, and a closed list on purpose: this string is
 * written straight into a stylesheet, so it is never something an upload can
 * choose the contents of.
 */
export const CHARSETS = [
  ['', 'Everything in the file'],
  ['latin', 'Latin'],
  ['latin-ext', 'Latin extended'],
  ['cyrillic', 'Cyrillic'],
  ['cyrillic-ext', 'Cyrillic extended'],
  ['greek', 'Greek'],
  ['greek-ext', 'Greek extended'],
  ['vietnamese', 'Vietnamese'],
];

const RANGES = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,'
    + 'U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,'
    + 'U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,'
    + 'U+2C60-2C7F,U+A720-A7FF',
  cyrillic: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
  'cyrillic-ext': 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F',
  greek: 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF',
  'greek-ext': 'U+1F00-1FFF',
  vietnamese: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,'
    + 'U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
};
const CHARSET_VALUES = new Set(CHARSETS.map((c) => c[0]));

/* Appended after the family, so a missing glyph lands somewhere sensible
   rather than in whatever the browser keeps for last resort. */
const FALLBACK_STACK = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
};

/* What a filename tends to say about the face inside it. Google's download
   gives `Inter-SemiBold.ttf`, Fontsource gives `inter-latin-600-normal.woff2`
   - between a word list and a bare number the common shapes are covered, and
   a wrong guess is a select away from right. */
const WEIGHT_WORDS = [
  [/(thin|hairline)/, '100'], [/(extra|ultra)[-_ ]?light/, '200'], [/light/, '300'],
  [/(regular|normal|book)/, '400'], [/medium/, '500'],
  [/(semi|demi)[-_ ]?bold/, '600'], [/(extra|ultra)[-_ ]?bold/, '800'],
  [/(black|heavy)/, '900'], [/bold/, '700'],
];

/* The subset a filename names, longest first so `latin-ext` is not read as
   `latin` with a stray suffix. */
const CHARSET_WORDS = ['cyrillic-ext', 'latin-ext', 'greek-ext',
  'cyrillic', 'vietnamese', 'greek', 'latin'];

/** The face a filename is probably describing. */
export function guessFace(filename = '') {
  const name = String(filename).toLowerCase();
  const style = /(italic|oblique)/.test(name) ? 'italic' : 'normal';
  const charset = CHARSET_WORDS.find((c) => name.includes(c)) || '';
  if (/(variable|\bvf\b|wght)/.test(name)) return { weight: '100 900', style, charset };
  /* A bare number first, and only one that reads as a weight: `v20` and
     `latin1` say nothing about the face. Before the words, because
     Fontsource writes `inter-latin-600-normal`, where `normal` is the style
     and reading it as a weight would answer 400 with a 600 in plain sight. */
  const digits = name.match(/(?:^|[-_. ])([1-9]00)(?:[-_. ]|$)/);
  if (digits) return { weight: digits[1], style, charset };
  for (const [pattern, weight] of WEIGHT_WORDS) {
    if (pattern.test(name)) return { weight, style, charset };
  }
  return { weight: '400', style, charset };
}

const facesOf = (row) => {
  try {
    const list = JSON.parse(row?.faces || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
};

const hydrate = (row) => row && {
  id: row.id,
  slug: row.slug,
  name: row.name,
  fallback: FALLBACK_STACK[row.fallback] ? row.fallback : 'sans',
  builtin: !!row.builtin,
  faces: facesOf(row),
};

/** Every installed family, alphabetical - the order the picker offers them. */
export const list = () =>
  all('SELECT * FROM fonts ORDER BY name COLLATE NOCASE').map(hydrate);

export const bySlug = (slug) =>
  hydrate(get('SELECT * FROM fonts WHERE slug = ?', String(slug ?? '')));

export const byId = (id) =>
  hydrate(get('SELECT * FROM fonts WHERE id = ?', Number.parseInt(id, 10) || 0));

/**
 * A family name as a CSS string.
 *
 * Quotes and backslashes are escaped, and a newline cannot survive at all: a
 * CSS string ends at one, so the next `}` closes the @font-face block and
 * everything after it becomes live rules. A family called
 * `Evil<newline>}body{display:none}` blanked every page on the site.
 *
 * Escaped on the way out as well as cleaned on the way in, because only one
 * of those two places is about CSS - the stored name is also what the panel
 * shows and what a browser is asked for.
 */
const cssString = (value) => String(value ?? '')
  .replace(/[\\"]/g, '\\$&')
  .replace(/[\r\n\f\u0000-\u001f]/g, ' ');

/** The CSS stack for a family: the family itself, then somewhere to land. */
export const stackFor = (font) => (font
  ? `"${cssString(font.name)}", ${FALLBACK_STACK[font.fallback] || FALLBACK_STACK.sans}`
  : FALLBACK_STACK.sans);

/**
 * The @font-face rules for every installed family.
 *
 * `font-display: swap` so text is readable while a face loads - on a local
 * network that window is short, but a blank paragraph is never the better
 * trade. Emitted inline with the rest of the theme, for the same reason: it
 * changes the moment a font is uploaded, and a generated stylesheet would
 * need a cache key of its own.
 */
export function fontFaceCss(fonts = list()) {
  return fonts.flatMap((font) => font.faces.map((face) => {
    const range = RANGES[face.charset];
    return `@font-face{font-family:"${cssString(font.name)}";`
      + `font-style:${face.style};font-weight:${face.weight};font-display:swap;`
      + `src:url(/fonts/${encodeURIComponent(face.filename)}) format("${face.format}")`
      + `${range ? `;unicode-range:${range}` : ''}}`;
  })).join('');
}

/* --------------------------------------------------------------- writing */

const uniqueSlug = (name, exceptId = 0) => {
  const base = slugify(name, 'font').slice(0, 40);
  let slug = base;
  for (let n = 2; get('SELECT id FROM fonts WHERE slug = ? AND id != ?', slug, exceptId); n++) {
    slug = `${base}-${n}`;
  }
  return slug;
};

/**
 * Write one uploaded file into www/fonts under a name of our own making.
 *
 * The uploader's filename contributes a slug and nothing else - never a path,
 * never the extension. What the file *is* decides the extension, so a
 * `.woff2` that turns out to be something else cannot land as one.
 */
export function storeFontFile({ filename, data }) {
  const kind = sniffFont(data);
  if (!kind) return null;
  const base = slugify(path.basename(filename || 'font', path.extname(filename || '')), 'font').slice(0, 50);
  const stored = `${base}-${crypto.randomBytes(4).toString('hex')}${kind.ext}`;
  fs.mkdirSync(config.paths.fonts, { recursive: true });
  fs.writeFileSync(path.join(config.paths.fonts, stored), data);
  return { filename: stored, format: kind.format, bytes: data.length };
}

const cleanFace = (face) => ({
  weight: WEIGHT_VALUES.has(String(face.weight)) ? String(face.weight) : '400',
  style: face.style === 'italic' ? 'italic' : 'normal',
  // Off the closed list or not at all: this ends up inside a stylesheet.
  charset: CHARSET_VALUES.has(String(face.charset)) ? String(face.charset) : '',
  filename: String(face.filename || ''),
  format: String(face.format || 'woff2'),
  bytes: Number.parseInt(face.bytes, 10) || 0,
});

const saveFaces = (id, faces) =>
  run('UPDATE fonts SET faces = ? WHERE id = ?', JSON.stringify(faces.map(cleanFace)), id);

/* A name is one line of text. Control characters are not part of any family
   anyone has ever shipped, and they are exactly what a stylesheet cannot
   survive - so they never reach the database either. */
const cleanName = (value, fallback = 'Untitled') =>
  String(value ?? '').replace(/[\r\n\f\t\u0000-\u001f]/g, ' ').trim().slice(0, 60) || fallback;

export function create({ name, fallback = 'sans', faces = [], builtin = false }) {
  const clean = cleanName(name);
  const result = run(
    'INSERT INTO fonts (slug, name, faces, fallback, builtin) VALUES (?, ?, ?, ?, ?)',
    uniqueSlug(clean), clean, JSON.stringify(faces.map(cleanFace)),
    FALLBACK_STACK[fallback] ? fallback : 'sans', builtin ? 1 : 0);
  return byId(result.lastInsertRowid);
}

/** Add faces to a family that already exists, or start one that does not. */
export function addFaces(fontId, faces) {
  const font = byId(fontId);
  if (!font) return null;
  saveFaces(font.id, [...font.faces, ...faces]);
  return byId(font.id);
}

export function rename(fontId, { name, fallback }) {
  const font = byId(fontId);
  if (!font) return null;
  const clean = cleanName(name, font.name);
  run('UPDATE fonts SET name = ?, slug = ?, fallback = ? WHERE id = ?',
    clean, uniqueSlug(clean, font.id), FALLBACK_STACK[fallback] ? fallback : font.fallback, font.id);
  return byId(font.id);
}

/** Correct what a face is, when the filename was guessed wrong. */
export function setFaces(fontId, faces) {
  const font = byId(fontId);
  if (!font) return null;
  // Only faces this family already holds: the list posted back is a
  // correction of what is there, never a way to name a file on disk.
  const known = new Map(font.faces.map((f) => [f.filename, f]));
  const kept = faces
    .filter((f) => known.has(f.filename))
    .map((f) => ({
      ...known.get(f.filename), weight: f.weight, style: f.style, charset: f.charset,
    }));
  saveFaces(font.id, kept);
  return byId(font.id);
}

const unlink = (filename) => {
  try { fs.unlinkSync(path.join(config.paths.fonts, filename)); } catch { /* already gone */ }
};

export function removeFace(fontId, filename) {
  const font = byId(fontId);
  if (!font) return null;
  const kept = font.faces.filter((f) => f.filename !== filename);
  if (kept.length !== font.faces.length) unlink(filename);
  saveFaces(font.id, kept);
  return byId(font.id);
}

/**
 * Remove a family, unless it is the only one left.
 *
 * A site with no typeface installed is a site drawing in whatever the visitor's
 * browser keeps for last resort, which is not a state anyone chooses on
 * purpose. So the last one stays - upload the replacement first, then this
 * lets go. That rule is what makes the shipped family removable at all.
 */
export function remove(fontId) {
  const font = byId(fontId);
  if (!font) return { ok: false, why: 'missing' };
  if (list().length <= 1) return { ok: false, why: 'last' };
  font.faces.forEach((f) => unlink(f.filename));
  run('DELETE FROM fonts WHERE id = ?', font.id);
  return { ok: true, font };
}

/**
 * The family a fresh install draws with.
 *
 * Registered from whatever is actually on disk rather than from a list here,
 * so a missing file shows as a family with no faces instead of a row that
 * lies about what it can render. Runs once at boot and does nothing after
 * that - including nothing at all once the row has been removed on purpose.
 */
export const BUILTIN = {
  name: 'Inter',
  slug: 'inter',
  fallback: 'sans',
  weight: '100 900',
  /* Two subsets of one variable file, which is how a family is normally
     distributed. Latin alone covers English and Swedish whole; Latin Extended
     is what draws a name like Șerban or Ćwikła in the site's own face rather
     than in whatever the reader's machine substitutes. Declared apart, so the
     85 KB is fetched only by a page that actually contains one. */
  files: [
    { file: 'inter-variable.woff2', charset: 'latin' },
    { file: 'inter-variable-latin-ext.woff2', charset: 'latin-ext' },
  ],
};

export function ensureBuiltin() {
  if (get('SELECT id FROM fonts LIMIT 1')) return null;
  const faces = BUILTIN.files
    .map(({ file, charset }) => {
      const full = path.join(config.paths.fonts, file);
      return fs.existsSync(full) && {
        weight: BUILTIN.weight,
        style: 'normal',
        charset,
        filename: file,
        format: 'woff2',
        bytes: fs.statSync(full).size,
      };
    })
    .filter(Boolean);
  return create({ name: BUILTIN.name, fallback: BUILTIN.fallback, faces, builtin: true });
}
