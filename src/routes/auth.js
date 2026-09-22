import { config } from '../config.js';
import { html, redirect, parseForm, parseCookies } from '../lib/http.js';
import {
  identify, issueToken, verifyToken, createSession, sessionCookie, clearSessionCookie, destroySession, currentUser, SESSION_COOKIE, fromThisMachine, RESEND_SECONDS,
} from '../lib/auth.js';
import { loginView, verifyView } from '../views/auth.js';

export function registerAuthRoutes(router) {
  router.get('/cms/login', async (req, res, { url }) => {
    if (currentUser(req)) return redirect(res, '/cms');

    // "Send again" comes back here with the identifier attached.
    const resend = url.searchParams.get('resend');
    if (resend) {
      const id = identify(resend);
      if (id) {
        const { code } = await issueToken(id);
        return html(res, verifyView({ identifier: id.identifier, devCode: code || '' }));
      }
    }
    html(res, loginView({ notice: url.searchParams.get('utloggad') ? 'You are signed out.' : '' }));
  });

  router.post('/cms/login', async (req, res) => {
    const { fields } = await parseForm(req);
    const raw = String(fields.identifier || '').trim();
    const id = identify(raw);
    if (!id) {
      return html(res, loginView({
        value: raw,
        error: 'Enter a valid email address or mobile number.',
      }));
    }
    const { code, waiting } = await issueToken(id);
    /* The code is shown on screen when no mail key is configured, which is
       what makes the real login flow usable on a machine with no mail server.
       It is also a complete bypass if anyone else can see it - type an admin's
       address, read the code, sign in - so it is shown only to a request from
       this machine. From anywhere else a mail-less install has no code to
       read, and the operator finds it in data/outbox/. */
    html(res, verifyView({
      identifier: id.identifier,
      devCode: fromThisMachine(req) ? (code || '') : '',
      // Not an error: the code is the one already on its way.
      notice: waiting ? 'A code is already on its way — check for it before asking again.' : '',
    }));
  });

  router.post('/cms/verify', async (req, res) => {
    const { fields } = await parseForm(req);
    const id = identify(String(fields.identifier || ''));
    if (!id) return redirect(res, '/cms/login');

    const submitted = String(fields.code || '')
      || String(fields.d0 ?? '') + (fields.d1 ?? '') + (fields.d2 ?? '')
       + (fields.d3 ?? '') + (fields.d4 ?? '') + (fields.d5 ?? '');

    const result = verifyToken(id, submitted);
    if (!result.ok) {
      return html(res, verifyView({ identifier: id.identifier, error: result.error }));
    }
    const { token, expires } = createSession(result.user.id);
    res.writeHead(303, { Location: '/cms', 'Set-Cookie': sessionCookie(token, expires, req) });
    res.end();
  });

  router.post('/cms/logout', (req, res) => {
    destroySession(parseCookies(req.headers.cookie || '')[SESSION_COOKIE]);
    res.writeHead(303, {
      Location: config.authDisabled ? '/' : '/cms/login?utloggad=1',
      'Set-Cookie': clearSessionCookie(),
    });
    res.end();
  });
}
