import { html, redirect, parseForm, json } from '../../lib/http.js';
import { esc } from '../../lib/html.js';
import { icon } from '../../views/icons.js';
import { cmsLayout, cmsHead } from '../../views/cms/layout.js';
import { field, select, emptyState, rowActions, mediaPicker } from '../../views/cms/parts.js';
import { users, media } from '../../models.js';
import { isEmail, normalizePhone } from '../../lib/util.js';
import { dialFor, countryList } from '../../lib/phone.js';
import * as settings from '../../lib/settings.js';
import { initials, formatDate } from '../../views/helpers.js';
import { mediaUrl } from '../../lib/media.js';
import { passwordProblem, MIN_LENGTH } from '../../lib/password.js';
import { setPassword, endOtherSessions } from '../../lib/auth.js';

const ROLES = [
  { value: 'visitor', label: 'Visitor' },
  { value: 'editor', label: 'Editor' },
  { value: 'admin', label: 'Admin' },
];
const ROLE_HINT = 'Visitor reads, Editor writes articles and pages, Admin manages everything.';

// The phone field's list, so a person can be in any country a number can be.
const COUNTRIES = countryList().map((c) => ({ value: c.iso, label: c.name }));

/** Frames 4.5 + 5.1 - user list, inline add row and the Properties pane. */
export function registerUsers(router, guard) {
  router.get('/cms/users', guard((req, res, { user, url }) => {
    const list = users.list();
    const editing = list.find((u) => String(u.id) === url.searchParams.get('edit'));
    const passwordNote = {
      short: `Not saved: a password needs at least ${MIN_LENGTH} characters.`,
      long: 'Not saved: that password is too long.',
      set: 'Password set. They were signed out everywhere else.',
    }[url.searchParams.get('note')];
    const image = editing?.image_id ? media.byId(editing.image_id) : null;

    const rows = list.map((u) => `<tr${editing?.id === u.id ? ' class="is-selected"' : ''}>
      <td>
        <div class="row">
          <span class="avatar avatar--sm">${u.image_filename
            ? `<img src="${esc(mediaUrl(u.image_filename))}" alt="">`
            : esc(initials(u.full_name, u.email))}</span>
          <a class="cell-link" href="/cms/users?edit=${u.id}">${esc(u.full_name || '–')}</a>
        </div>
      </td>
      <td><span class="small">${esc(u.email)}</span></td>
      <td class="col-narrow"><span class="small muted">${esc(u.phone || '–')}</span></td>
      <td class="col-narrow"><span class="pill${u.role === 'admin' ? ' pill--accent' : ''}">${esc(u.role)}</span></td>
      <td class="col-narrow"><span class="small muted">${esc(u.last_login ? formatDate(u.last_login) : 'Never')}</span></td>
      <td class="actions">${rowActions({
        editHref: `/cms/users?edit=${u.id}`,
        deleteAction: `data-delete-user="${u.id}"`,
      })}</td>
    </tr>`).join('');

    const center = `
      ${cmsHead('Users')}
      <form class="row" method="post" action="/cms/users" style="align-items:flex-end;flex-wrap:wrap">
        <div class="field grow" style="min-width:160px"><input type="text" name="full_name" placeholder="Full name"></div>
        <div class="field grow" style="min-width:180px"><input type="email" name="email" placeholder="Email" required></div>
        <div class="field grow" style="min-width:150px"><input type="tel" name="phone" placeholder="Phone"></div>
        <div class="field" style="flex:0 0 140px"><select name="role">${
          ROLES.map((r) => `<option value="${r.value}"${r.value === 'editor' ? ' selected' : ''}>${r.label}</option>`).join('')
        }</select></div>
        <button class="btn btn--primary" type="submit">Add</button>
      </form>
      <hr class="rule">
      ${list.length ? `<table class="table">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Last sign-in</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table>` : emptyState('No users yet.')}`;

    const right = editing ? `
      <h2 class="h-tool" style="margin-bottom:var(--ui-s-5)">Properties</h2>
      <form class="stack" method="post" action="/cms/users/${editing.id}" data-user-form>
        <div class="row" style="align-items:flex-start;gap:var(--ui-s-4)">
          <div data-media-picker data-field="image_id" style="flex:0 0 114px">
            <div class="avatar avatar--lg" data-preview>${image
              ? `<img src="${esc(mediaUrl(image.filename))}" alt="">`
              : esc(initials(editing.full_name, editing.email))}</div>
            <button class="linkish" type="button" data-pick style="margin-top:6px">Change picture</button>
            <input type="hidden" name="image_id" value="${editing.image_id ?? ''}" data-value>
          </div>
          <div class="grow">
            ${select({ label: 'Role', name: 'role', value: editing.role, options: ROLES, hint: ROLE_HINT })}
          </div>
        </div>
        ${select({ label: 'Country', name: 'country', value: editing.country, options: COUNTRIES })}
        ${field({ label: 'Full name', name: 'full_name', value: editing.full_name })}
        ${field({ label: 'Email', name: 'email', type: 'email', value: editing.email, required: true })}
        ${field({ label: 'Phone', name: 'phone', type: 'tel', value: editing.phone, hint: 'Without a country code, the country above is assumed.' })}
        ${field({ label: 'Address', name: 'address', value: editing.address })}
        <div class="field-row">
          ${field({ label: 'Postcode', name: 'zip', value: editing.zip })}
          ${field({ label: 'City', name: 'city', value: editing.city })}
        </div>
        <hr class="rule" style="margin:var(--ui-s-2) 0">
        ${passwordNote ? `<p class="notice${/^Not/.test(passwordNote) ? ' notice--warn' : ''}">${esc(passwordNote)}</p>` : ''}
        ${field({ label: editing.password_hash ? 'New password' : 'Password (none yet)', name: 'new_password',
          type: 'password', extra: 'autocomplete="new-password"',
          hint: editing.password_hash
            ? 'Leave empty to keep theirs. They can change it themselves under Account.'
            : 'Until one is set they can only sign in with a one-time code.' })}
        <div class="row" style="justify-content:space-between">
          <button class="btn btn--primary" type="submit">Save</button>
          <button class="btn btn--danger" type="button" data-delete-user="${editing.id}">Delete</button>
        </div>
      </form>` : `
      <h2 class="h-tool" style="margin-bottom:var(--ui-s-4)">Properties</h2>
      <p class="muted small">Select a user from the list to edit.</p>`;

    html(res, cmsLayout({ title: 'Users', user, path: '/cms/users', center, right,
      data: { page: 'users' } }));
  }, 'admin'));

  router.post('/cms/users', guard(async (req, res) => {
    const { fields } = await parseForm(req);
    const email = String(fields.email || '').trim().toLowerCase();
    if (isEmail(email) && !users.byEmail(email)) {
      users.create({
        full_name: String(fields.full_name || '').trim(),
        email,
        phone: normalizePhone(fields.phone, dialFor(settings.get('site_country'))),
        country: settings.get('site_country'),
        role: ROLES.some((r) => r.value === fields.role) ? fields.role : 'visitor',
      });
    }
    redirect(res, '/cms/users');
  }, 'admin'));

  router.post('/cms/users/:id', guard(async (req, res, { params, user }) => {
    const { fields } = await parseForm(req);
    const id = Number(params.id);
    let note = '';
    if (fields.new_password) {
      const problem = passwordProblem(fields.new_password);
      if (problem) {
        note = /least/.test(problem) ? 'short' : 'long';
      } else {
        await setPassword(id, fields.new_password);
        // Someone else's password, set by an admin: every session of theirs ends.
        if (id !== user.id) endOtherSessions(id);
        note = 'set';
      }
    }
    const email = String(fields.email || '').trim().toLowerCase();
    const clash = isEmail(email) ? users.byEmail(email) : null;

    users.update(id, {
      full_name: String(fields.full_name || '').trim(),
      ...(isEmail(email) && (!clash || clash.id === id) ? { email } : {}),
      phone: normalizePhone(fields.phone, dialFor(fields.country || settings.get('site_country'))),
      role: ROLES.some((r) => r.value === fields.role) ? fields.role : undefined,
      country: String(fields.country || settings.get('site_country')),
      address: String(fields.address || ''),
      zip: String(fields.zip || ''),
      city: String(fields.city || ''),
      image_id: fields.image_id ? Number(fields.image_id) : null,
    });
    redirect(res, `/cms/users?edit=${id}${note ? `&note=${note}` : ''}`);
  }, 'admin'));

  /* Frame 5.1 - delete confirmation needs the user's name, e-mail and avatar. */
  router.get('/cms/api/users/:id', guard((req, res, { params }) => {
    const target = users.byId(Number(params.id));
    if (!target) return json(res, { error: 'That user does not exist' }, 404);
    json(res, {
      id: target.id,
      full_name: target.full_name,
      email: target.email,
      image: target.image_filename ? mediaUrl(target.image_filename) : null,
      initials: initials(target.full_name, target.email),
    });
  }, 'admin'));

  router.post('/cms/users/:id/delete', guard(async (req, res, { params, user }) => {
    const id = Number(params.id);
    // Never let the signed-in admin delete their own account out from under them.
    if (id !== user.id) users.remove(id);
    redirect(res, '/cms/users');
  }, 'admin'));
}
