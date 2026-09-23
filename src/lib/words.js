import { config } from '../config.js';

/**
 * The words the site says for itself.
 *
 * Not a translation layer for content. What an author writes is in whatever
 * language they write it in and is stored exactly as typed; this is the
 * handful of words the *software* supplies around it - "Read more" under a
 * card, the button on a form, what an address with nothing at it says. Every
 * string in here is the site speaking rather than the author, which is the
 * line that decides whether something belongs.
 *
 * The CMS interface is not in here and is not going to be. It is English, its
 * strings sit inline beside their neighbours, and with one language a
 * dictionary for it would be indirection buying nothing (see NOTES,
 * Deliberately not built). What changed is only that the *site* has a
 * language setting, so the site's own words have to be able to follow it.
 *
 * Interpolated strings are functions rather than templates with holes in
 * them: word order is exactly the thing a translation is allowed to change,
 * and `${label} (a valid number)` is not a shape every language keeps.
 */

const en = {
  // What dates are formatted by. Day-month order and a 24-hour clock, which
  // is most of the English-speaking world; a site can ask for another region
  // by setting `en-US` rather than `en`.
  locale: 'en-GB',

  // Articles, feeds and cards
  readMore:      'Read more',
  showMore:      'Show more',
  feedEmpty:     'No published articles yet.',
  subjects:      'Subjects',
  allSubjects:   'All',
  moreToRead:    'More to read',

  // Forms
  send:          'Send',
  formThanks:    'Thank you for your message!',
  formEmpty:     'This form has no fields yet.',
  fillIn:        (fields) => `Please fill in: ${fields}.`,
  needsEmail:    (label) => `${label} (a valid email address)`,
  needsPhone:    (label) => `${label} (a valid number)`,
  mailSubject:   'Message from the website',
  unknownSender: 'unknown sender',

  // The password gate
  password:      'Password',
  passwordNote:  'This page is protected. Enter the password to view it.',
  passwordWrong: 'Wrong password. Try again.',
  view:          'View',

  // Nothing at this address
  notFound:      'Page not found',
  notFoundNote:  'There is nothing at this address, or the page is not published yet.',
  goHome:        'Go to the home page',

  // Furniture. Mostly aria-labels, which are words too: they are what a
  // screen reader says out loud, and saying "Main menu" to a Swedish visitor
  // is the same mistake as printing it on the page.
  skipToContent: 'Skip to content',
  menu:          'Menu',
  mainMenu:      'Main menu',
  sectionMenu:   'Section menu',
  breadcrumbs:   'Breadcrumbs',
  home:          'Home',
};

const sv = {
  locale: 'sv-SE',

  readMore:      'Läs mer',
  showMore:      'Visa fler',
  feedEmpty:     'Inga publicerade artiklar än.',
  subjects:      'Ämnen',
  allSubjects:   'Alla',
  moreToRead:    'Mer att läsa',

  send:          'Skicka',
  formThanks:    'Tack för ditt meddelande!',
  formEmpty:     'Det här formuläret har inga fält än.',
  fillIn:        (fields) => `Fyll i: ${fields}.`,
  needsEmail:    (label) => `${label} (en giltig e-postadress)`,
  needsPhone:    (label) => `${label} (ett giltigt telefonnummer)`,
  mailSubject:   'Meddelande från webbplatsen',
  unknownSender: 'okänd avsändare',

  password:      'Lösenord',
  passwordNote:  'Den här sidan är skyddad. Ange lösenordet för att se den.',
  passwordWrong: 'Fel lösenord. Försök igen.',
  view:          'Visa',

  notFound:      'Sidan finns inte',
  notFoundNote:  'Det finns ingenting på den här adressen, eller så är sidan inte publicerad än.',
  goHome:        'Gå till startsidan',

  skipToContent: 'Hoppa till innehållet',
  menu:          'Meny',
  mainMenu:      'Huvudmeny',
  sectionMenu:   'Undermeny',
  breadcrumbs:   'Brödsmulor',
  home:          'Hem',
};

/*
 * English underneath every other language, so a word added here and not yet
 * translated draws in English rather than as nothing at all. A page missing a
 * button label is broken; a page with one English button is merely untidy,
 * and the untidiness is visible, which is how it gets fixed.
 */
const DICTIONARIES = {
  en: Object.freeze(en),
  sv: Object.freeze({ ...en, ...sv }),
};

/** The languages the site's own words exist in, for the settings hint. */
export const LANGUAGES = Object.keys(DICTIONARIES);

/**
 * The dictionary for a language tag, as `site_language` holds it.
 *
 * Matched on the primary subtag, so `sv`, `sv-SE` and `sv-FI` all find the
 * Swedish set. A language with no set of its own gets English: a site written
 * in German is better served by English furniture than by blanks, and its
 * `lang` attribute still says German, which is the honest part.
 *
 * A tag that names a region keeps it for dates - `en-US` is a site that wants
 * September 7 rather than 7 September, and there is no reason to overrule it
 * when the setting already says so.
 */
export function siteWords(lang) {
  // Matched in lower case, kept as written: a tag is case-insensitive to look
  // up and `en-GB` is what a date formatter would rather be handed.
  const tag = String(lang || '').trim();
  const dict = DICTIONARIES[tag.toLowerCase().split('-')[0]]
    || DICTIONARIES[String(config.defaultLang).toLowerCase().split('-')[0]]
    || DICTIONARIES.en;
  return tag.includes('-') ? Object.freeze({ ...dict, locale: tag }) : dict;
}
