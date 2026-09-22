import { config } from '../config.js';
import { get, run, all, setting } from '../db/index.js';
import { serializeCookie, parseCookies, overTls } from './http.js';
import { randomToken, numericCode, safeEqual, isEmail, normalizePhone, isPhone, nowSql } from './util.js';
import { sendMail, sendSms, otpEmail, otpSms } from './mail.js';
import { verifyPassword, needsRehash, hashPassword } from './password.js';
import * as settings from './settings.js';
import { dialFor } from './phone.js';

export const SESSION_COOKIE = 'slice_session';

const ROLE_RANK = { visitor: 1, editor: 2, admin: 3 };
export const rankOf = (role) => ROLE_RANK[role] || 0;
export const atLeast = (user, role) => !!user && rankOf(user.role) >= rankOf(role);

/* -------------------------------------------------------------- sessions */

export function createSession(userId) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + config.sessionDays * 86400000);
  run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
    token, userId, expires.toISOString().slice(0, 19).replace('T', ' '));
  run("UPDATE users SET last_login = datetime('now') WHERE id = ?", userId);
  return { token, expires };
}

export const sessionCookie = (token, expires, req) =>
  serializeCookie(SESSION_COOKIE, token, {
    expires, httpOnly: true, sameSite: 'Lax', secure: overTls(req),
  });

export const clearSessionCookie = () =>
  serializeCookie(SESSION_COOKIE, '', { maxAge: 0, httpOnly: true });

export function destroySession(token) {
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
}

/** Sign a user out everywhere but here - after a password change, say. */
export function endOtherSessions(userId, keepToken = '') {
  run('DELETE FROM sessions WHERE user_id = ? AND token != ?', userId, keepToken || '');
}

const LOOPBACK = /^(::1|::ffff:127\.|127\.)/;

/**
 * Whether a request came from the machine the server is running on.
 *
 * The login bypass is a convenience for whoever is building the site, and to
 * anyone else it is indistinguishable from no authentication at all. The
 * server listens on every interface, so without this a laptop on a shared
 * network is an open CMS - which it was: `http://<lan-ip>:8080/cms/users`
 * answered 200 with no cookie.
 *
 * `req.ip` is the socket's own address, which cannot be forged, unless a
 * proxy is named in TRUST_PROXY - then it is the visitor as that proxy
 * reports them, and Express has already refused anything a visitor wrote
 * into the header themselves.
 *
 * A loopback socket that carries forwarding headers with no proxy named has
 * been relayed by something in front that nobody told us about. The visitor
 * is then whoever that proxy was talking to, not this machine, so the answer
 * is no - which keeps the bypass shut for the one mistake most likely to open
 * it: putting a proxy in front and forgetting TRUST_PROXY.
 */
const RELAYED = ['x-forwarded-for', 'x-real-ip', 'forwarded'];

export const fromThisMachine = (req) => {
  if (!LOOPBACK.test(String(req.ip ?? req.socket?.remoteAddress ?? ''))) return false;
  return !!config.trustProxy || !RELAYED.some((name) => req.headers?.[name]);
};

/**
 * Who the login bypass signs in as: DEV_USER when it is set, and otherwise
 * the first admin - which on a fresh install is whoever ran the first-run
 * screen, so the bypass needs no configuring to be useful.
 */
export const bypassUser = () => (config.devUser
  ? get('SELECT * FROM users WHERE email = ?', config.devUser)
  : get("SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1"));

/**
 * Resolve the signed-in user for a request.
 *
 * When config.authDisabled is on the bypass user is returned without any
 * cookie, so the CMS opens straight up - but only for a request from this
 * machine. Leaving the flag on can no longer expose anything to the network.
 */
export function currentUser(req) {
  if (config.authDisabled && fromThisMachine(req)) {
    const dev = bypassUser();
    if (dev) return { ...dev, _devBypass: true };
  }
  const token = parseCookies(req.headers.cookie || '')[SESSION_COOKIE];
  if (!token) return null;
  const row = get(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > datetime('now')`, token);
  return row || null;
}

export function purgeExpired() {
  run("DELETE FROM sessions WHERE expires_at <= datetime('now')");
  run("DELETE FROM login_tokens WHERE expires_at <= datetime('now', '-1 day')");
}

/* ------------------------------------------------------- sign-in method */

/**
 * How people sign in, which is a Settings choice:
 *
 *   password  a password, and nothing else - what a fresh install uses,
 *             because it is the one way in that needs no mail service
 *   either    a password, or a one-time code by email or SMS instead
 *   code      a one-time code only, for a site that would rather nobody
 *             kept a password at all
 */
export const SIGN_IN_METHODS = ['password', 'either', 'code'];

export const signInMethod = () => {
  const value = settings.get('signin_method');
  return SIGN_IN_METHODS.includes(value) ? value : 'password';
};
export const allowsPassword = () => signInMethod() !== 'code';
export const allowsCode = () => signInMethod() !== 'password';

/**
 * An installation from before passwords existed signed in by code, and none
 * of its people has a password yet. Switching it to passwords on upgrade
 * would lock every one of them out, so it keeps the code until an admin
 * chooses otherwise. Runs at start; a no-op once the choice has been made.
 */
export function keepCodeForOldInstalls() {
  if (setting.get('signin_method', '') !== '') return;
  const people = get('SELECT COUNT(*) AS n FROM users').n;
  const withPassword = get("SELECT COUNT(*) AS n FROM users WHERE password_hash != ''").n;
  if (people && !withPassword) settings.set('signin_method', 'code');
}

/* ------------------------------------------------------------- first run */

/** True until somebody has made the first admin. */
export const needsSetup = () => !get("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");

/**
 * The first-run screen makes an admin, so it has to be shut to strangers in
 * the minutes between a server starting on a network and its owner opening
 * it. It opens without asking for this machine, like the bypass does; from
 * anywhere else it needs this token, which is printed in the start-up banner
 * and nowhere else, and lives only as long as the process.
 */
let setupSecret = '';
export const setupToken = () => (setupSecret ||= randomToken(18));
export const maySetUp = (req, token) =>
  fromThisMachine(req) || (!!token && safeEqual(String(token), setupToken()));

/* ------------------------------------------------------- password login */

/*
 * Guesses are counted in memory, by address typed and by the machine asking,
 * and a run of wrong ones shuts that door for a while. Memory is enough: a
 * restart is not something an attacker gets to ask for, and scrypt already
 * makes each guess slow.
 */
const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = { who: 5, from: 20 };
const failures = new Map();

const recent = (key) => (failures.get(key) || []).filter((t) => Date.now() - t < WINDOW_MS);
const tooMany = (who, from) => recent(`who:${who}`).length >= LIMITS.who
  || recent(`from:${from}`).length >= LIMITS.from;
function fail(who, from) {
  // Typed addresses are unbounded, so stale ones are swept before they pile up.
  if (failures.size > 5000) {
    for (const key of failures.keys()) if (!recent(key).length) failures.delete(key);
  }
  for (const key of [`who:${who}`, `from:${from}`]) failures.set(key, [...recent(key), Date.now()]);
}

/** Forget everything counted - for tests, which sign in wrong on purpose. */
export const resetThrottle = () => failures.clear();

/**
 * Check a password. Returns { ok, user } or { ok:false, error }, and says the
 * same thing for an unknown address as for a wrong password.
 */
export async function passwordSignIn({ identifier, password }, req) {
  const id = identify(identifier);
  const who = id?.identifier || String(identifier || '').trim().toLowerCase();
  const from = String(req?.ip ?? req?.socket?.remoteAddress ?? '');
  if (tooMany(who, from)) {
    return { ok: false, error: 'Too many attempts. Wait a few minutes and try again.' };
  }
  const user = id ? findUserByIdentifier(id) : null;
  const ok = await verifyPassword(password, user?.password_hash || '');
  if (!ok) {
    fail(who, from);
    return { ok: false, error: 'That email and password do not match.' };
  }
  failures.delete(`who:${who}`);
  // Cheapest moment to bring an old hash up to today's cost: we have the password.
  if (needsRehash(user.password_hash)) await setPassword(user.id, password);
  return { ok: true, user };
}

export async function setPassword(userId, password) {
  const hash = await hashPassword(password);
  run('UPDATE users SET password_hash = ? WHERE id = ?', hash, userId);
}

/* ------------------------------------------------------------ OTP login */

/** Classify what the user typed into the single login field. */
export function identify(input) {
  const value = String(input || '').trim();
  if (isEmail(value)) return { channel: 'email', identifier: value.toLowerCase() };
  // A number with no country code is read as local to the site's own country.
  const dial = dialFor(settings.get('site_country'));
  if (isPhone(value, dial)) return { channel: 'sms', identifier: normalizePhone(value, dial) };
  return null;
}

export function findUserByIdentifier({ channel, identifier }) {
  return channel === 'email'
    ? get('SELECT * FROM users WHERE email = ? COLLATE NOCASE', identifier)
    : get('SELECT * FROM users WHERE phone = ?', identifier);
}

/**
 * Issue a six-digit token and deliver it. Returns { sent, code } - `code` is
 * only ever populated when there is no Brevo key, so the dev console can
 * show it. Unknown identifiers are treated as success so the login form does
 * not reveal which addresses exist.
 */
/**
 * How long before the same identifier may ask for another code.
 *
 * Nothing throttled this, so one endpoint would send a real person a mail or
 * an SMS as fast as it was asked to, and grow a row each time. It also
 * quietly undid the five-attempt cap: the cap is per token, and a fresh token
 * cost nothing - so an attacker got five more guesses whenever they liked.
 */
export const RESEND_SECONDS = 60;

export async function issueToken({ channel, identifier }) {
  /* Asking again inside the window hands back the code already issued rather
     than refusing: no second mail, no second row, and "Send again" does the
     helpful thing instead of scolding someone who never got the first one.
     The code still only reaches a local request - routes/auth.js decides that
     - so returning it here gives away nothing that was not already given.

     Answered the same way whether or not the identifier belongs to anyone,
     like the rest of this flow: a different reply would say which addresses
     have accounts. */
  const recent = get(
    `SELECT code FROM login_tokens
      WHERE identifier = ? AND consumed = 0 AND expires_at > datetime('now')
        AND created_at > datetime('now', ?)
      ORDER BY id DESC LIMIT 1`, identifier, `-${RESEND_SECONDS} seconds`);
  if (recent) return { sent: false, waiting: true, code: recent.code, known: false };

  const user = findUserByIdentifier({ channel, identifier });
  const code = numericCode(config.otp.length);

  run(`INSERT INTO login_tokens (identifier, channel, code, expires_at)
       VALUES (?, ?, ?, datetime('now', ?))`,
    identifier, channel, code, `+${config.otp.ttlMinutes} minutes`);

  if (user) {
    if (channel === 'email') await sendMail({ to: identifier, ...otpEmail(code) });
    else await sendSms({ to: identifier, text: otpSms(code) });
  } else {
    console.log(`  [auth] token requested for unknown identifier ${identifier} - nothing sent`);
  }
  return { sent: true, code: config.brevoApiKey ? null : code, known: !!user };
}

/** Verify a submitted code. Returns { ok, user } or { ok:false, error }. */
export function verifyToken({ identifier }, submitted) {
  const code = String(submitted || '').replace(/\D/g, '');
  const row = get(
    `SELECT * FROM login_tokens
      WHERE identifier = ? AND consumed = 0 AND expires_at > datetime('now')
      ORDER BY id DESC LIMIT 1`, identifier);

  if (!row) return { ok: false, error: 'That code has expired. Request a new one.' };
  if (row.attempts >= config.otp.maxAttempts) {
    run('UPDATE login_tokens SET consumed = 1 WHERE id = ?', row.id);
    return { ok: false, error: 'Too many attempts. Request a new code.' };
  }
  if (!safeEqual(code, row.code)) {
    run('UPDATE login_tokens SET attempts = attempts + 1 WHERE id = ?', row.id);
    return { ok: false, error: 'Wrong code. Try again.' };
  }

  run('UPDATE login_tokens SET consumed = 1 WHERE id = ?', row.id);
  const user = findUserByIdentifier({ channel: row.channel, identifier });
  if (!user) return { ok: false, error: 'No account found.' };
  return { ok: true, user };
}
