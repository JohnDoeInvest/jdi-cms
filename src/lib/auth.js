import { config } from '../config.js';
import { get, run, all } from '../db/index.js';
import { serializeCookie, parseCookies, overTls } from './http.js';
import { randomToken, numericCode, safeEqual, isEmail, normalizePhone, isPhone, nowSql } from './util.js';
import { sendMail, sendSms, otpEmail, otpSms } from './mail.js';

export const SESSION_COOKIE = 'sm_session';

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
 * Resolve the signed-in user for a request.
 *
 * When config.authDisabled is on the configured dev user is returned without
 * any cookie, so the CMS opens straight up - but only for a request from this
 * machine. Leaving the flag on can no longer expose anything to the network.
 */
export function currentUser(req) {
  if (config.authDisabled && fromThisMachine(req)) {
    const dev = get('SELECT * FROM users WHERE email = ?', config.devUser);
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

/* ------------------------------------------------------------ OTP login */

/** Classify what the user typed into the single login field. */
export function identify(input) {
  const value = String(input || '').trim();
  if (isEmail(value)) return { channel: 'email', identifier: value.toLowerCase() };
  if (isPhone(value)) return { channel: 'sms', identifier: normalizePhone(value) };
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
