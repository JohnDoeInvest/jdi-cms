import crypto from 'node:crypto';

const TRANSLIT = { å: 'a', ä: 'a', ö: 'o', é: 'e', è: 'e', ü: 'u', ø: 'o', æ: 'ae', ß: 'ss', ñ: 'n', ç: 'c' };

/** URL-safe slug with Swedish characters folded sensibly. */
export function slugify(input, fallback = 'page') {
  const base = String(input || '')
    .toLowerCase()
    .replace(/[åäöéèüøæßñç]/g, (c) => TRANSLIT[c] || c)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || fallback;
}

/** Make `slug` unique against `exists(candidate) => boolean`. */
export function uniqueSlug(slug, exists) {
  if (!exists(slug)) return slug;
  for (let n = 2; n < 5000; n++) {
    const candidate = `${slug}-${n}`;
    if (!exists(candidate)) return candidate;
  }
  return `${slug}-${crypto.randomBytes(4).toString('hex')}`;
}

/** Normalise a permalink to a leading-slash, no-trailing-slash path. */
export function normalizePermalink(value, fallback = '/') {
  let p = String(value || '').trim();
  if (!p) return fallback;
  p = p.replace(/^https?:\/\/[^/]+/i, '');
  if (!p.startsWith('/')) p = '/' + p;
  p = p.replace(/\/{2,}/g, '/').replace(/\s+/g, '-');
  p = '/' + p.split('/').filter(Boolean).map((seg) => slugify(seg, seg)).join('/');
  return p === '/' ? '/' : p.replace(/\/$/, '');
}

export const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(value || '').trim());

/**
 * A phone number as E.164. A number written with `+` or `00` says its own
 * country; a bare one is read as local to `dial` - the site's country, which
 * callers take from Settings - and loses its trunk zero. With no dial code a
 * bare number cannot be placed, and is not a phone number.
 */
export function normalizePhone(value, dial = '') {
  const raw = String(value || '').replace(/[\s\-().]/g, '');
  if (!raw) return '';
  if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\D/g, '');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return '+' + digits.slice(2);
  const code = String(dial || '').replace(/\D/g, '');
  return code ? `+${code}${digits.replace(/^0+/, '')}` : '';
}

export const isPhone = (value, dial = '') => /^\+\d{8,15}$/.test(normalizePhone(value, dial));

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export function numericCode(length = 6) {
  let out = '';
  while (out.length < length) out += crypto.randomInt(0, 10);
  return out;
}

/** Constant-time string compare that tolerates length differences. */
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/* -------------------------------------------------------------- date/time */

const sqlToDate = (value) => {
  if (!value) return null;
  const d = new Date(String(value).replace(' ', 'T') + (/[Z+]/.test(value) ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? null : d;
};

export const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/*
 * English, in the day-month order most of the English-speaking world reads -
 * "7 September 2026" - and a 24-hour clock. A short date is ISO, 2026-09-07,
 * which no reader anywhere can take for a different day.
 */
const LOCALE = 'en-GB';

export function formatDate(value) {
  const d = sqlToDate(value);
  if (!d) return '';
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

export function formatDateLong(value, locale = LOCALE) {
  const d = sqlToDate(value);
  if (!d) return '';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * A timestamp as the CMS lists it: near dates said in words, older ones dated.
 *
 * The lists are read to answer "what was I last working on", and 2026-09-10
 * answers it badly - every page edited today carries the same string, so the
 * column stops distinguishing exactly when it matters most. A time of day
 * separates today's work; yesterday is worth naming; past that the date is
 * the useful thing and precision stops mattering.
 *
 * Compared by calendar day rather than by hours elapsed: something saved at
 * 23:50 is "yesterday" at 00:10, not "17 minutes ago".
 */
export function relativeDate(value, locale = LOCALE, now = new Date()) {
  const d = sqlToDate(value);
  if (!d) return '';
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days === 0) {
    return `Today ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (days === 1) return 'Yesterday';
  return formatDate(value);
}

/**
 * When a scheduled publish happens, in the words the CMS says it in.
 *
 * `day` is today, tomorrow, a weekday while it is within the week, and a date
 * past that - nobody schedules for "2026-09-21" in their head, they schedule
 * for Monday. Compared by calendar day, as `relativeDate` is, so 00:30
 * tomorrow is tomorrow however few hours away it is.
 */
export function scheduleDate(value, locale = LOCALE, now = new Date()) {
  const d = sqlToDate(value);
  if (!d) return null;
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(now)) / 86400000);
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  let day = formatDate(value);
  if (days === 0) day = 'today';
  else if (days === 1) day = 'tomorrow';
  else if (days > 1 && days < 7) day = d.toLocaleDateString(locale, { weekday: 'long' });
  return { day, time };
}

/**
 * A publish time from the editor, as a stored timestamp - or why not.
 *
 * The browser builds an ISO string from the author's own date and time, so
 * the zone is settled before it arrives. Seconds are dropped, because the
 * clock that publishes ticks on the minute. Refused when it is not a time,
 * when it has already passed, and when its year would not fit the stored
 * shape: a six-digit year typed into a date field would sort before every
 * real date and go out at once.
 */
export function parsePublishAt(value, now = new Date()) {
  const d = new Date(String(value ?? ''));
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() > 9999) {
    return { error: 'Pick a date and a time to publish at.' };
  }
  d.setUTCSeconds(0, 0);
  if (d <= now) return { error: 'That time has already passed. Pick a later one.' };
  return { at: d.toISOString().slice(0, 19).replace('T', ' ') };
}

/**
 * The day a stored timestamp falls on, as a date field writes it.
 *
 * In this server's own time, which is the time every date on the site is
 * shown in - so the field and the page cannot disagree about the day.
 */
export function localDay(value) {
  const d = sqlToDate(value);
  if (!d) return '';
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/**
 * The date an article carries, from the editor's date field - or why not.
 *
 * A day and no time: the site only ever shows the day, and a clock time
 * nobody sees is not worth asking for. It is stored at midday, where no time
 * zone can tip it into the day before or after - and today's is stored at
 * midday or now, whichever is earlier, because a live article dated a few
 * hours ahead would sort above everything that went out this morning.
 *
 * Never in the future. That is what Schedule is for, and a live article dated
 * next week would sit at the top of every feed until then. Nothing before
 * 1900 either: a year half typed into the field is 0202, not a real date.
 * Empty is an answer of its own - the day the article goes out.
 */
export function parsePublishedOn(value, now = new Date()) {
  const text = String(value ?? '').trim();
  if (!text) return { at: null };
  const [, y, m, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) || [];
  const d = y ? new Date(Number(y), Number(m) - 1, Number(day), 12) : null;
  // `new Date` quietly rolls 31 February into March, and reads year 0002 as
  // 1902, so the date is only real if it comes back as it went in.
  if (!d || d.getFullYear() !== Number(y) || d.getMonth() !== Number(m) - 1
    || d.getDate() !== Number(day) || d.getFullYear() < 1900) {
    return { error: 'That is not a date the article can carry.' };
  }
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (d >= tomorrow) {
    return { error: 'An article cannot be dated in the future. To publish it later, use Schedule.' };
  }
  const at = d > now ? now : d;
  return { at: at.toISOString().slice(0, 19).replace('T', ' ') };
}

export function daysSince(value) {
  const d = sqlToDate(value);
  if (!d) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

/** Split a full name into { first, last } for greetings. */
export function nameParts(fullName) {
  const bits = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return { first: bits[0] || '', last: bits.slice(1).join(' ') };
}

export function initials(fullName, email = '') {
  const { first, last } = nameParts(fullName);
  if (first) return ((first[0] || '') + (last[0] || '')).toUpperCase();
  return (String(email)[0] || '?').toUpperCase();
}
