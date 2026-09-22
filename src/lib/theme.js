import { get as getSetting, set as setSetting } from './settings.js';
import { list as fontList, stackFor, fontFaceCss } from './fonts.js';

/**
 * The site's theme: colours, type and measure.
 *
 * Everything here is defined by whoever runs the CMS, not by this file - the
 * lists below are only what a fresh install starts with. That is the whole
 * point: this is a product, and the next site it runs will have nothing in
 * common with this one's brand.
 *
 * Colours are a single flat palette. Each entry knows the text colour that
 * belongs on it, which is what makes a palette entry usable as a *surface* -
 * pick "Ink" as a slice background and legible text comes with it. Two
 * independent lists (backgrounds here, text colours there) would offer every
 * unreadable pairing as a valid choice; one list offers none.
 *
 * Nothing here reaches the CMS chrome. cms-tokens.css owns that, under --ui-*.
 */

/** A fresh install's palette. Matches tokens.css so upgrading changes nothing. */
export const DEFAULT_COLORS = [
  { id: 'paper',  name: 'Paper',  value: '#f0ede8', ink: '#1e1e1e' },
  { id: 'white',  name: 'White',  value: '#ffffff', ink: '#1e1e1e' },
  { id: 'sand',   name: 'Sand',   value: '#dcd5c6', ink: '#1e1e1e' },
  { id: 'ink',    name: 'Ink',    value: '#1e1e1e', ink: '#ffffff' },
  { id: 'accent', name: 'Accent', value: '#357abb', ink: '#ffffff' },
  { id: 'brand',  name: 'Brand',  value: '#ffcc1b', ink: '#1e1e1e' },
];

/**
 * The faces on offer are the ones installed, and nothing else.
 *
 * There was a curated list of fourteen Google families here, each with the
 * query string that fetched it. That list was a promise this product could
 * not keep on its own terms: drawing any of them meant every visitor's
 * browser asking fonts.gstatic.com for the file, and handing over an address,
 * a browser and the page being read in order to get it. A server in your own
 * building that still phones a CDN on every view is not self-hosted.
 *
 * So the picker offers what src/lib/fonts.js has on disk. A fresh install
 * ships one family; the rest is somebody uploading a file.
 */
export const DEFAULT_FONT = 'inter';

/** A family's CSS stack, by the slug a theme stores. */
export const fontStack = (slug, installed = fontList()) =>
  stackFor(installed.find((f) => f.slug === slug));

/**
 * How wide content draws. Named rather than measured at the point of use, so
 * a slice stores "wide" and this decides what that means - which is what lets
 * the whole site's proportions change from one screen.
 */
/**
 * `centerText` is the odd one out and deliberately so: the four measures are
 * numbers, this is a switch. It says whether an article's reading column sits
 * centred on the page or starts at the same edge as its headline.
 */
export const DEFAULT_LAYOUT = { narrow: 700, body: 1000, wide: 1240, gutter: 24, centerText: false };

export const LAYOUT_LIMITS = {
  narrow: [320, 1200], body: [480, 1800], wide: [640, 2400], gutter: [0, 120],
};

export const DEFAULT_FONTS = { body: 'inter', heading: 'inter', scale: 100 };
export const SCALE_LIMITS = [80, 130];

/**
 * The nine sizes the editor's Size menus offer, in pixels at full width.
 *
 * Named for what the panel calls them, not for a step on an abstract scale:
 * the number changed here is the one attached to the word picked on the
 * object, which is the only way this is worth exposing at all. Matches
 * tokens.css, so a site with no saved theme draws exactly the same.
 *
 * What a phone does with each is blocks.css's, and deliberately not stored:
 * a display heading has to shrink far more than a section heading, so one
 * number could not have said it.
 */
export const DEFAULT_TYPE = {
  hSmall: 20, hMedium: 24, hLarge: 30, hXlarge: 48, hDisplay: 80,
  tSmall: 13, tBody: 17, tLarge: 20, tXlarge: 30,
};

/** The CSS name each carries. The key is the form field; this is the token. */
export const TYPE_VARS = {
  hSmall: 'h-small', hMedium: 'h-medium', hLarge: 'h-large',
  hXlarge: 'h-xlarge', hDisplay: 'h-display',
  tSmall: 't-small', tBody: 't-body', tLarge: 't-large', tXlarge: 't-xlarge',
};

export const TYPE_LIMITS = [10, 200];

const MAX_COLORS = 24;
const HEX = /^#[0-9a-f]{6}$/i;

/** Slug for CSS class and custom-property names. Never trusted from input. */
const slug = (value) => String(value ?? '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);

const hex = (value, fallback) => (HEX.test(String(value || '')) ? String(value).toLowerCase() : fallback);

/**
 * Relative luminance, used to pick a legible ink when one is not given.
 * Plain sRGB gamma - close enough to choose between black and white, which is
 * the only question being asked.
 */
export function luminance(color) {
  const value = hex(color, '#000000');
  const channel = (i) => {
    const c = parseInt(value.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** The ink that reads on a background, when the author has not chosen one. */
export const autoInk = (background) => (luminance(background) > 0.42 ? '#1e1e1e' : '#ffffff');

/**
 * Normalise a palette from untrusted input. Ids are made unique because they
 * become CSS class names - two "Brand" entries would otherwise silently
 * collapse into one and the second would appear to do nothing.
 */
export function normalizeColors(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name ?? '').trim().slice(0, 40);
    // A name of nothing but punctuation still slugs to '', so fall back to a
    // position rather than dropping a colour the author can see they typed.
    const base = slug(item.id) || slug(name) || `color-${out.length + 1}`;
    let id = base;
    for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
    seen.add(id);
    const value = hex(item.value, '#ffffff');
    out.push({ id, name: name || id, value, ink: hex(item.ink, autoInk(value)) });
    if (out.length >= MAX_COLORS) break;
  }
  return out.length ? out : DEFAULT_COLORS.map((c) => ({ ...c }));
}

/**
 * The chosen faces, checked against what is actually installed.
 *
 * A font that has been removed cannot stay chosen: the theme would name a
 * family with no files behind it and every page would quietly draw in the
 * fallback while the panel insisted otherwise. It falls back to the first
 * installed family instead, which is why the last one can never be removed.
 */
export function normalizeFonts(raw, installed = fontList()) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const first = installed[0]?.slug || DEFAULT_FONT;
  const pick = (id) => (installed.some((f) => f.slug === id) ? id : first);
  const n = Number.parseInt(source.scale, 10);
  return {
    body: pick(source.body),
    heading: pick(source.heading),
    scale: Number.isFinite(n) ? Math.max(SCALE_LIMITS[0], Math.min(SCALE_LIMITS[1], n)) : DEFAULT_FONTS.scale,
  };
}

export function normalizeType(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const [key, fallback] of Object.entries(DEFAULT_TYPE)) {
    const n = Number.parseInt(source[key], 10);
    out[key] = Number.isFinite(n)
      ? Math.max(TYPE_LIMITS[0], Math.min(TYPE_LIMITS[1], n))
      : fallback;
  }
  return out;
}

export function normalizeLayout(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const [key, fallback] of Object.entries(DEFAULT_LAYOUT)) {
    const limits = LAYOUT_LIMITS[key];
    // A key with no range is a switch. Parsing one as a number would make
    // "off" come out as the smallest width the measure allows.
    if (!limits) {
      out[key] = source[key] === undefined ? fallback : (!!source[key] && source[key] !== 'false');
      continue;
    }
    const n = Number.parseInt(source[key], 10);
    out[key] = Number.isFinite(n) ? Math.max(limits[0], Math.min(limits[1], n)) : fallback;
  }
  return out;
}

/** The whole theme, normalised and ready to render. */
export function theme() {
  const installed = fontList();
  return {
    colors: normalizeColors(getSetting('theme_colors')),
    fonts: normalizeFonts(getSetting('theme_fonts'), installed),
    layout: normalizeLayout(getSetting('theme_layout')),
    type: normalizeType(getSetting('theme_type')),
    installed,
  };
}

export function saveTheme({ colors, fonts, layout, type }) {
  if (colors !== undefined) setSetting('theme_colors', normalizeColors(colors));
  if (fonts !== undefined) setSetting('theme_fonts', normalizeFonts(fonts));
  if (layout !== undefined) setSetting('theme_layout', normalizeLayout(layout));
  if (type !== undefined) setSetting('theme_type', normalizeType(type));
}

/**
 * The theme as CSS, overriding the defaults in tokens.css.
 *
 * Emitted inline rather than served as a file: it is small, it changes the
 * moment the screen is saved, and a generated stylesheet would need a cache
 * key of its own. Nothing here is site-specific in the source - every value
 * comes from settings.
 */
export function themeCss(current = theme()) {
  const { colors, fonts, layout } = current;
  const type = normalizeType(current.type);
  const installed = current.installed || [];
  const vars = [
    `--font-sans:${fontStack(fonts.body, installed)}`,
    `--font-heading:${fontStack(fonts.heading, installed)}`,
    `--font-scale:${fonts.scale / 100}`,
    `--measure-max:${layout.narrow}px`,
    `--body-max:${layout.body}px`,
    `--shell-max:${layout.wide}px`,
    `--gutter:${layout.gutter}px`,
  ];
  for (const [key, name] of Object.entries(TYPE_VARS)) vars.push(`--${name}:${type[key]}px`);
  for (const c of colors) {
    vars.push(`--c-${c.id}:${c.value}`, `--c-${c.id}-ink:${c.ink}`);
  }

  /*
   * A surface is a background and the ink that belongs on it, always together.
   *
   * Setting `color` is not enough: blocks.css gives headings `--ink`, body
   * copy `--graphite` and captions `--grey-500`, and every one of those would
   * beat an inherited colour - which is how a dark band ends up with black
   * text on it. So a surface redefines the text tokens *locally*, mixing its
   * own ink toward its own background. One rule per surface keeps the whole
   * greyscale relationship intact on any colour, rather than flattening every
   * shade to one and losing the difference between a heading and a caption.
   */
  const rules = colors.map((c) => {
    const mix = (pct) => `color-mix(in srgb, var(--c-${c.id}-ink) ${pct}%, var(--c-${c.id}))`;
    return `.b-surface--${c.id}{background:var(--c-${c.id});color:var(--c-${c.id}-ink);`
      + `--ink:var(--c-${c.id}-ink);--graphite:${mix(88)};--grey-700:${mix(76)};`
      + `--grey-500:${mix(60)};--grey-300:${mix(40)};--line:${mix(18)};`
      + `--line-soft:${mix(10)}}`
      // The same colour used as text, for the rare accent word.
      + `.b-ink--${c.id}{color:var(--c-${c.id})}`
      /*
       * A button in this colour, filled and outlined.
       *
       * Buttons used to carry a private three-value palette of their own
       * (default / accent / ghost) beside the real one, so "the accent
       * colour" meant two different things depending on what you were
       * looking at. Outlined is transparent rather than white: it has to sit
       * on a coloured band as readily as on the page.
       */
      + `.b-button__el--c-${c.id}{background:var(--c-${c.id});border-color:var(--c-${c.id});`
        + `color:var(--c-${c.id}-ink)}`
      // A shade of itself on hover: mostly the colour, a little of its ink.
      + `.b-button__el--c-${c.id}:hover{background:${mix(16)};border-color:${mix(16)}}`
      + `.b-button__el--outline.b-button__el--c-${c.id}{background:transparent;`
        + `border-color:var(--c-${c.id});color:var(--c-${c.id})}`
      + `.b-button__el--outline.b-button__el--c-${c.id}:hover{background:var(--c-${c.id});`
        + `color:var(--c-${c.id}-ink)}`;
  }).join('');

  /*
   * An article's reading column, centred on the page rather than starting at
   * the same edge as the headline. The words inside stay left-aligned: it is
   * the *column* that moves, which is a different thing from centred text and
   * far easier to read.
   *
   * The head is capped to the theme's own Narrow measure and centred; in the
   * body it is the text objects that move, since a text object caps itself at
   * a reading measure already. Everything else on the canvas - pictures,
   * tables, coloured bands - keeps the full column, which is the wide-picture
   * / narrow-text shape falling out of the block model rather than being
   * arranged for.
   */
  const centered = layout.centerText
    ? '.is-article .page-header--article{max-width:var(--measure-max);margin-inline:auto}'
      + '.is-article .article-body .b-text{margin-inline:auto}'
    : '';

  /* The faces come first: a @font-face has to be known before anything asks
     for the family, and this whole block is one inline <style>. */
  return `${fontFaceCss(installed)}:root{${vars.join(';')}}${rules}${centered}`;
}
