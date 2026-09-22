import crypto from 'node:crypto';
import { setting } from '../db/index.js';
import { serializeCookie, overTls } from './http.js';
import { randomToken, safeEqual } from './util.js';

/**
 * Password-protected pages.
 *
 * A page password is a *shared secret for content*, not a credential: one
 * password, handed to whoever should see the page. So it is stored readable
 * rather than hashed - an editor who cannot read it back cannot pass it on,
 * which is the only thing a page password is for. Nothing else in the system
 * accepts it, it grants no session and no account, and the CMS that shows it
 * is already behind a real login.
 *
 * Unlocking sets one cookie per page holding an HMAC of the page id and the
 * password. Nothing is stored server-side, and changing the password
 * invalidates every cookie already handed out - which is what "change the
 * password" is expected to mean.
 */

/**
 * A shared page password is weaker than a login, so it is remembered for
 * rather less time than one. Long enough that reading a page over a week does
 * not mean typing it seven times.
 */
const UNLOCK_DAYS = 7;

/**
 * The signing key, minted once and kept in the settings table.
 *
 * Not in lib/settings.js: that module is the typed, *editable* view of the
 * settings a site owner sees, and this is neither. It lives in the same table
 * because that is where a value that must survive a restart goes.
 */
let cachedSecret = null;
function secret() {
  if (cachedSecret) return cachedSecret;
  let value = setting.get('page_secret', '');
  if (!value) {
    value = randomToken(32);
    setting.set('page_secret', value);
  }
  cachedSecret = value;
  return value;
}

export const unlockCookieName = (pageId) => `sm_page_${Number(pageId)}`;

/** The cookie value that proves this password was given for this page. */
export const unlockToken = (pageId, password) =>
  crypto.createHmac('sha256', secret())
    .update(`${Number(pageId)}:${String(password)}`)
    .digest('base64url');

export const unlockCookie = (pageId, password, req) =>
  serializeCookie(unlockCookieName(pageId), unlockToken(pageId, password), {
    maxAge: UNLOCK_DAYS * 86400, httpOnly: true, sameSite: 'Lax', secure: overTls(req),
  });

/** Whether the password a visitor typed is the page's. */
export const passwordMatches = (page, submitted) =>
  !!page?.password && safeEqual(String(submitted ?? ''), page.password);

/**
 * Whether this request may see this page.
 *
 * `ctx.cookies` is read rather than the request, so every rendering path -
 * a page view, a form submit that re-renders the page it was posted from -
 * asks the same question in the same place.
 *
 * A page with no password is open, and a preview is the editor's own view of
 * a draft behind the CMS guard. Everything else, editors included, is asked:
 * a gate nobody signed in ever meets is a gate nobody can check works, and
 * with the login bypass on while building that would be everybody.
 */
export function isUnlocked(ctx, page) {
  if (!page?.password || page.isPreview) return true;
  const given = ctx?.cookies?.[unlockCookieName(page.id)] || '';
  return safeEqual(given, unlockToken(page.id, page.password));
}
