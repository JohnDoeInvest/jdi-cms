import { config } from '../config.js';
import { html, redirect, parseForm, parseCookies } from '../lib/http.js';
import {
  identify, issueToken, verifyToken, createSession, sessionCookie, clearSessionCookie, destroySession, currentUser, SESSION_COOKIE, fromThisMachine,
  signInMethod, allowsCode, passwordSignIn, needsSetup, maySetUp,
} from '../lib/auth.js';
import { passwordProblem, hashPassword } from '../lib/password.js';
import { isEmail } from '../lib/util.js';
import { users } from '../models.js';
import { loginView, verifyView, setupView, setupLockedView } from '../views/auth.js';

/** Signed in: a session, its cookie, and on to the CMS. */
function signIn(req, res, user) {
  const { token, expires } = createSession(user.id);
  res.writeHead(303, { Location: '/cms', 'Set-Cookie': sessionCookie(token, expires, req) });
  res.end();
}

export function registerAuthRoutes(router) {
  router.get('/cms/login', async (req, res, { url }) => {
    if (needsSetup()) return redirect(res, '/cms/setup');
    if (currentUser(req)) return redirect(res, '/cms');

    // "Send again" comes back here with the identifier attached.
    const resend = url.searchParams.get('resend');
    if (resend && allowsCode()) {
      const id = identify(resend);
      if (id) {
        const { code } = await issueToken(id);
        return html(res, verifyView({ identifier: id.identifier, devCode: fromThisMachine(req) ? (code || '') : '' }));
      }
    }
    html(res, loginView({
      method: signInMethod(),
      notice: url.searchParams.get('signed-out') ? 'You are signed out.' : '',
    }));
  });

  router.post('/cms/login', async (req, res) => {
    const { fields } = await parseForm(req);
    const raw = String(fields.identifier || '').trim();
    const method = signInMethod();
    const byCode = method === 'code' || (method === 'either' && fields.via === 'code');

    if (!byCode) {
      const result = await passwordSignIn({ identifier: raw, password: fields.password }, req);
      if (!result.ok) return html(res, loginView({ method, value: raw, error: result.error }));
      return signIn(req, res, result.user);
    }

    const id = identify(raw);
    if (!id) {
      return html(res, loginView({
        method,
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
    if (!allowsCode()) return redirect(res, '/cms/login');
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
    signIn(req, res, result.user);
  });

  /* ------------------------------------------------------------ first run */

  router.get('/cms/setup', (req, res, { url }) => {
    if (!needsSetup()) return redirect(res, '/cms/login');
    const token = url.searchParams.get('token') || '';
    if (!maySetUp(req, token)) return html(res, setupLockedView(), 403);
    html(res, setupView({ token }));
  });

  router.post('/cms/setup', async (req, res) => {
    if (!needsSetup()) return redirect(res, '/cms/login');
    const { fields } = await parseForm(req);
    const token = String(fields.token || '');
    if (!maySetUp(req, token)) return html(res, setupLockedView(), 403);

    const values = {
      full_name: String(fields.full_name || '').trim().slice(0, 120),
      email: String(fields.email || '').trim().toLowerCase(),
    };
    const error = !isEmail(values.email) ? 'Enter a valid email address.'
      : passwordProblem(fields.password, fields.confirm);
    if (error) return html(res, setupView({ error, values, token }));

    /* Hashed first, so the account and its password land together. Then
       checked again: two first runs racing each other make one admin, and the
       second is sent to sign in like anybody else. Nothing awaits between
       this check and the insert. */
    const hash = await hashPassword(fields.password);
    if (!needsSetup()) return redirect(res, '/cms/login');
    const existing = users.byEmail(values.email);
    const admin = existing
      ? users.update(existing.id, { role: 'admin', full_name: values.full_name || existing.full_name })
      : users.create({ ...values, role: 'admin' });
    users.setPasswordHash(admin.id, hash);
    console.log(`  [setup] first admin created: ${admin.email}`);
    signIn(req, res, admin);
  });

  router.post('/cms/logout', (req, res) => {
    destroySession(parseCookies(req.headers.cookie || '')[SESSION_COOKIE]);
    res.writeHead(303, {
      Location: config.authDisabled ? '/' : '/cms/login?signed-out=1',
      'Set-Cookie': clearSessionCookie(),
    });
    res.end();
  });
}
