import crypto from 'node:crypto';
import { setting } from '../db/index.js';
import { randomToken, safeEqual } from './util.js';

/**
 * Telling a person from a script, without asking either of them anything.
 *
 * No third party and no package: a captcha served from Google or Cloudflare
 * would hand a visitor's address, browser and page to somebody else on the
 * one page where they are about to type their name and a message, which is
 * the thing "Nothing is fetched from anywhere" took the fonts out for. So
 * these are small local checks instead, and each is honest about being
 * cheap - together they make drive-by spam cost something, and they stop
 * nothing driven by a person who wants through. See NOTES.
 *
 * Nothing here reads a mouse on its own. A phone has no mouse, a keyboard
 * user moves none and a screen reader moves none, so *any* interaction counts
 * and its absence is never by itself a refusal.
 */

/** What a submission can be refused or marked for. Keys, not sentences. */
export const HARD = ['tooMany', 'honeypot', 'forged', 'replay'];
export const SOFT = ['fast', 'stale', 'untouched'];

/** The two positions of the `form_guard` setting. */
export const GUARD_MODES = ['flag', 'refuse'];

/**
 * The three fields a drawn form carries besides its own.
 *
 * `HONEYPOT` is hidden and a script fills it. `TOKEN` proves the form was
 * drawn by this site. `EVIDENCE` is set by site.js the first time a human
 * does anything at all.
 */
/* The underscore is load-bearing. A field's posted name comes from
   `fieldKey`, and every branch of it runs through `slugify`, which emits
   only [a-z0-9-] - so no form an author can build will ever have a field
   called `url_confirm`, and a visitor's own answer can never be read as a
   robot. Rename this to something hyphenated and that guarantee is gone;
   `honeypotLive` below is the belt to this braces. */
export const HONEYPOT = 'url_confirm';
export const TOKEN = 'issued';
export const EVIDENCE = 'interaction';

/**
 * How long a signed token is accepted for.
 *
 * Generous, because the cost of being wrong is somebody's message: a form
 * left open while they write a long one must not be refused. An old token is
 * a *soft* signal rather than a refusal for the same reason - it is still
 * signed, so it still proves the form came from here, and replay is handled
 * separately.
 */
const TOKEN_MS = 2 * 60 * 60 * 1000;

/** Under this and nobody typed it. A soft signal; fast people exist. */
const MIN_MS = 2000;

/** Flood protection, which is a different job from spotting a script. */
const WINDOW_MS = 15 * 60 * 1000;
const PER_ADDRESS = 20;

/**
 * The signing key, minted once and kept in the settings table - the same
 * shape as `page_secret` in gate.js, and for the same reason: a value that
 * must survive a restart and is nobody's to edit.
 */
let cachedSecret = null;
function secret() {
  if (cachedSecret) return cachedSecret;
  let value = setting.get('form_secret', '');
  if (!value) {
    value = randomToken(32);
    setting.set('form_secret', value);
  }
  cachedSecret = value;
  return value;
}

/** Forget the cached key - for tests, which build a database per run. */
export const resetSecret = () => { cachedSecret = null; };

const sign = (objId, path, at) => crypto.createHmac('sha256', secret())
  .update(`${String(objId)}:${String(path)}:${at}`)
  .digest('base64url');

/**
 * The token for one *placed* form on one page.
 *
 * Bound to the form object's id and the page's address, so a token drawn for
 * one form cannot be posted at another, and signed with the time it was
 * issued so the same value is both the proof and the clock.
 *
 * `at` is that issue time and defaults to now. It is a parameter so a test can
 * mint a token that is genuinely a few seconds old, rather than sleeping or
 * keeping a second copy of the signing rule to forge one with.
 */
export function issue(objId, path, at = Date.now()) {
  return `${at}.${sign(objId, path, at)}`;
}

/**
 * Tokens already spent, so a captured one cannot be sent twice.
 *
 * In memory, which is the same bargain auth.js makes for sign-in failures: a
 * restart forgets them, and a restart is not something an attacker gets to
 * ask for. It bounds replay to one use per token per uptime rather than
 * absolutely, which the rate limit then sits underneath.
 */
const spent = new Map();
const sweep = (map, ms) => {
  if (map.size <= 5000) return;
  const now = Date.now();
  for (const [key, at] of map) if (now - at > ms) map.delete(key);
};

const attempts = new Map();
const recent = (key) => (attempts.get(key) || []).filter((t) => Date.now() - t < WINDOW_MS);

/** Forget everything counted - for tests, which submit in bulk on purpose. */
export const resetGuard = () => { spent.clear(); attempts.clear(); };

/**
 * Judge one submission.
 *
 * Returns `{ refuse, suspect, ms, touched }`. `refuse` and `suspect` are each
 * a key from HARD/SOFT or null; `ms` is how long the form was open and
 * `touched` whether anything interacted with it, both stored on the row so
 * the thresholds can later be argued from traffic rather than guessed again
 * (see NOTES). `ms` is null when the token did not verify, because without a
 * trustworthy issue time there is nothing to measure from.
 *
 * The caller turns `refuse` into a sentence out of words.js and `suspect`
 * into the mark on the stored row; this module says nothing a visitor reads,
 * because what the site says follows `site_language` and that is words.js's
 * job.
 *
 * `mode` is the `form_guard` setting, and governs only the soft half: the
 * hard reasons are never a person, so no setting can wave them through.
 */
export function verdict({ mode, objId, path, fields, from, honeypotLive = true }) {
  const address = String(from || '');
  const touched = !!String(fields[EVIDENCE] ?? '').trim();
  const blank = { ms: null, touched };

  /* Counted before anything is checked, so a flood cannot be made cheap by
     sending rubbish that fails early. */
  const key = `from:${address}`;
  const seen = recent(key);
  sweep(spent, TOKEN_MS);
  if (attempts.size > 5000) {
    for (const k of attempts.keys()) if (!recent(k).length) attempts.delete(k);
  }
  attempts.set(key, [...seen, Date.now()]);
  if (seen.length >= PER_ADDRESS) return { refuse: 'tooMany', suspect: null, ...blank };

  /* A hidden field with something in it. Only trusted when no real field of
     this form answers to the same name - `fieldKey` lets an author set
     `props.name` to anything, and a visitor filling in their own Website
     field must never be read as a robot. */
  if (honeypotLive && String(fields[HONEYPOT] ?? '').trim()) {
    return { refuse: 'honeypot', suspect: null, ...blank };
  }

  const raw = String(fields[TOKEN] ?? '');
  const [stamp, mac] = raw.split('.');
  const at = Number(stamp);
  if (!mac || !Number.isFinite(at) || !safeEqual(mac, sign(objId, path, at))) {
    return { refuse: 'forged', suspect: null, ...blank };
  }
  if (spent.has(raw)) return { refuse: 'replay', suspect: null, ...blank };
  spent.set(raw, Date.now());

  /* The soft half. Each of these is a real person's plausible afternoon as
     well as a script's, so on `flag` they travel with the message instead of
     stopping it. */
  const ms = Date.now() - at;
  const soft = ms < MIN_MS ? 'fast'
    : ms > TOKEN_MS ? 'stale'
      : !touched ? 'untouched'
        : null;

  if (!soft) return { refuse: null, suspect: null, ms, touched };
  return mode === 'refuse'
    ? { refuse: soft, suspect: soft, ms, touched }
    : { refuse: null, suspect: soft, ms, touched };
}
