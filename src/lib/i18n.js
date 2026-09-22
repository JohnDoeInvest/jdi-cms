import en from '../i18n/en.js';

/**
 * CMS interface translation.
 *
 * All interface wording lives in src/i18n/<lang>.js. Site content is never
 * translated here — that comes from the database and belongs to the site.
 *
 * To add a language: copy src/i18n/en.js, translate the values, register it
 * below, and start the server with CMS_LANG=<code>.
 */
const DICTIONARIES = { en };

const requested = process.env.CMS_LANG || 'en';
const active = DICTIONARIES[requested] ? requested : 'en';
if (!DICTIONARIES[requested]) {
  console.warn(`  [i18n] No dictionary for "${requested}"; falling back to English.`);
}

const dict = DICTIONARIES[active];

/**
 * Look up a phrase. `t('dialog.updateInstead', { name: 'Hero' })` fills the
 * {name} placeholder. An unknown key returns itself, so a missing string is
 * visible in the interface rather than rendering as blank.
 */
export function t(key, vars) {
  let value = dict[key];
  if (value === undefined) {
    if (process.env.NODE_ENV !== 'production') console.warn(`  [i18n] missing key: ${key}`);
    return key;
  }
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
  }
  return value;
}

export const language = active;
export const availableLanguages = Object.keys(DICTIONARIES);

/** Every phrase, for handing to the browser so client scripts can use them. */
export const dictionary = () => dict;
