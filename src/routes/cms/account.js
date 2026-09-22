import { html, redirect, parseForm, parseCookies } from '../../lib/http.js';
import { esc } from '../../lib/html.js';
import { cmsLayout, cmsHead } from '../../views/cms/layout.js';
import { field } from '../../views/cms/parts.js';
import { verifyPassword, passwordProblem, MIN_LENGTH } from '../../lib/password.js';
import { setPassword, endOtherSessions, SESSION_COOKIE } from '../../lib/auth.js';

/* Keys, not text, in the address: a note is picked from here, never echoed. */
const NOTES = {
  saved: ['notice', 'Password saved. Every other device you were signed in on has been signed out.'],
  wrong: ['notice notice--warn', 'Your current password was not right. Nothing was changed.'],
  short: ['notice notice--warn', `Use at least ${MIN_LENGTH} characters.`],
  long: ['notice notice--warn', 'That password is too long.'],
  mismatch: ['notice notice--warn', 'The two new passwords do not match.'],
};
const problemKey = (message) => (/least/.test(message) ? 'short' : /most/.test(message) ? 'long' : 'mismatch');

/** Your own account, whatever your role: who you are, and your password. */
export function registerAccount(router, guard) {
  router.get('/cms/account', guard((req, res, { user, url }) => {
    const note = NOTES[url.searchParams.get('note')];
    const hasPassword = !!user.password_hash;

    const center = `
      ${cmsHead('Account')}
      <hr class="rule">
      <div class="stack" style="max-width:640px">
        ${note ? `<p class="${note[0]}">${esc(note[1])}</p>` : ''}
        <section class="panel">
          <h2 class="h-section" style="margin-bottom:var(--ui-s-4)">You</h2>
          <dl class="env-list">
            <dt>Name</dt><dd>${esc(user.full_name || '–')}</dd>
            <dt>Email</dt><dd>${esc(user.email)}</dd>
            <dt>Role</dt><dd>${esc(user.role)}</dd>
          </dl>
          ${user.role === 'admin' ? `<p class="small muted" style="margin:var(--ui-s-4) 0 0">
            Name, email and role are changed under <a href="/cms/users?edit=${user.id}">Users</a>.</p>` : ''}
        </section>

        <section class="panel">
          <h2 class="h-section" style="margin-bottom:var(--ui-s-4)">${hasPassword ? 'Change password' : 'Set a password'}</h2>
          <form class="stack" method="post" action="/cms/account/password">
            ${hasPassword ? field({ label: 'Current password', name: 'current', type: 'password',
              required: true, extra: 'autocomplete="current-password"' }) : ''}
            ${field({ label: 'New password', name: 'password', type: 'password', required: true,
              hint: `At least ${MIN_LENGTH} characters.`, extra: 'autocomplete="new-password"' })}
            ${field({ label: 'New password again', name: 'confirm', type: 'password', required: true,
              extra: 'autocomplete="new-password"' })}
            <div><button class="btn btn--primary" type="submit">Save password</button></div>
          </form>
        </section>
      </div>`;

    html(res, cmsLayout({ title: 'Account', user, path: '/cms/account', center,
      data: { page: 'account' } }));
  }));

  router.post('/cms/account/password', guard(async (req, res, { user }) => {
    const { fields } = await parseForm(req);
    if (user.password_hash && !(await verifyPassword(fields.current, user.password_hash))) {
      return redirect(res, '/cms/account?note=wrong');
    }
    const problem = passwordProblem(fields.password, fields.confirm);
    if (problem) return redirect(res, `/cms/account?note=${problemKey(problem)}`);

    await setPassword(user.id, fields.password);
    // A new password is often a response to an old one getting out.
    endOtherSessions(user.id, parseCookies(req.headers.cookie || '')[SESSION_COOKIE]);
    redirect(res, '/cms/account?note=saved');
  }));
}
