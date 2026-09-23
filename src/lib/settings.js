import { setting as store, json } from '../db/index.js';
import { config } from '../config.js';
import { LANGUAGES } from './words.js';

/**
 * Site settings.
 *
 * Everything here is what makes one installation of this CMS different from
 * another: name, logos, footer, social links, the address forms deliver to.
 * Each has a working default, so a fresh install is usable before anyone
 * opens the settings screen.
 */
export const SCHEMA = {
  site_name:        { type: 'text', default: 'My site',
                      label: 'Site name', hint: 'Used in the browser tab and share previews.' },
  site_url:         { type: 'text', default: config.siteUrl,
                      label: 'Site address', hint: 'Base URL used for canonical links and share images.' },
  /* What the site is written in. It sets the page's `lang` attribute, picks
     the language of the few words the site supplies itself, and decides how
     dates are written. A language with no words of its own (see
     src/lib/words.js) still gets an honest `lang` and English furniture. */
  site_language:    { type: 'text', default: config.defaultLang,
                      label: 'Content language',
                      hint: `Two-letter code for the page's lang attribute, the site's own words and its dates. `
                            + `Words exist in: ${LANGUAGES.join(', ')}.` },
  /* Where the site is, which is not the same question as what it is written
     in: a Swedish site can be read in English. Only a phone field uses it so
     far, as the country its prefix starts on. */
  site_country:     { type: 'text', default: config.defaultCountry,
                      label: 'Country', hint: 'Two-letter code. A phone field starts on this country.' },

  logo_media:       { type: 'media', default: null,
                      label: 'Logo', hint: 'Shown in the top bar and footer. With none, the site name stands in.' },
  favicon_media:    { type: 'media', default: null,
                      label: 'Favicon', hint: 'Square image, ideally SVG or PNG.' },

  /* How the CMS lets people in - see SIGN_IN_METHODS in src/lib/auth.js. A
     fresh install uses passwords, the one way in that needs no mail service. */
  signin_method:    { type: 'text', default: 'password',
                      label: 'How people sign in',
                      hint: 'A one-time code is sent by email or SMS, so it needs BREVO_API_KEY to reach anyone.' },

  contact_email:    { type: 'text', default: config.mail.contactTo,
                      label: 'Default form recipient', hint: 'Where forms deliver unless a form overrides it.' },

  /* Which page a new article appears under, and so what its address starts
     with. A default rather than a rule: each article can be moved, and the
     address is frozen once it is published. */
  article_parent:   { type: 'page', default: null,
                      label: 'Where new articles appear',
                      hint: 'The page a new article sits under, which decides the start of its address.' },

  footer_text:      { type: 'textarea', default: '',
                      label: 'Footer contact block', hint: 'Address, phone, email. One item per line.' },
  footer_note:      { type: 'text', default: '',
                      label: 'Footer small print', hint: 'Company name and registration. The year is added automatically.' },
  social_links:     { type: 'links', default: [],
                      label: 'Social links', hint: 'One per line as "Label https://…".' },

  /* Theme. Edited on its own screen, not in Settings - but stored here,
     because it is site-specific in exactly the way everything else here is.
     `null` defaults let src/lib/theme.js own what a fresh install looks like,
     so there is one description of the starting palette, not two. */
  theme_colors:     { type: 'json', default: null },
  theme_fonts:      { type: 'json', default: null },
  theme_layout:     { type: 'json', default: null },
  theme_type:       { type: 'json', default: null },
};

const cache = new Map();
let generation = 0;

/** Read one setting, typed, falling back to its default. */
export function get(key) {
  const spec = SCHEMA[key];
  if (!spec) return null;
  const cacheKey = `${generation}:${key}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const raw = store.get(key, null);
  let value;
  if (raw === null || raw === '') {
    value = spec.default;
  } else if (spec.type === 'media' || spec.type === 'page') {
    const n = Number.parseInt(raw, 10);
    value = Number.isFinite(n) && n > 0 ? n : null;
  } else if (spec.type === 'links' || spec.type === 'json') {
    value = json(raw, spec.default);
  } else {
    value = raw;
  }
  cache.set(cacheKey, value);
  return value;
}

export function set(key, value) {
  const spec = SCHEMA[key];
  if (!spec) return;
  if (spec.type === 'links') store.set(key, JSON.stringify(value || []));
  else if (spec.type === 'json') store.set(key, value == null ? '' : JSON.stringify(value));
  else if (spec.type === 'media' || spec.type === 'page') store.set(key, value ? String(value) : '');
  else store.set(key, String(value ?? ''));
  generation++;              // cheapest possible cache bust
  cache.clear();
}

/** Every setting at once, for rendering. */
export function all() {
  const out = {};
  for (const key of Object.keys(SCHEMA)) out[key] = get(key);
  return out;
}

/**
 * Parse the social-links textarea. Each line is "Label https://url", or just
 * a URL, in which case the host becomes the label.
 */
export function parseLinks(text) {
  return String(text || '').split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(.*?)\s*(https?:\/\/\S+|mailto:\S+)$/i.exec(line);
      if (!match) return null;
      const url = match[2];
      let label = match[1].trim();
      if (!label) {
        try { label = new URL(url).hostname.replace(/^www\./, ''); } catch { label = url; }
      }
      return { label: label.slice(0, 60), url: url.slice(0, 500) };
    })
    .filter(Boolean)
    .slice(0, 12);
}

export const linksToText = (links) =>
  (links || []).map((l) => `${l.label} ${l.url}`).join('\n');

/** Icon name for a social URL, so the footer picks the right glyph. */
export function iconForUrl(url) {
  const host = String(url || '').toLowerCase();
  if (host.includes('linkedin.')) return 'linkedin';
  if (host.includes('instagram.')) return 'instagram';
  if (host.startsWith('mailto:') || host.includes('mailto')) return 'mail';
  return 'external';
}
