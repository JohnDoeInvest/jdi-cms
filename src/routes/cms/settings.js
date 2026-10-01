import { html, redirect, parseForm, send } from '../../lib/http.js';
import { esc } from '../../lib/html.js';
import { icon } from '../../views/icons.js';
import { cmsLayout, cmsHead } from '../../views/cms/layout.js';
import { field, textarea, select, mediaPicker } from '../../views/cms/parts.js';
import { SCHEMA, all, set, parseLinks, linksToText } from '../../lib/settings.js';
import { media, pages } from '../../models.js';
import { config } from '../../config.js';
import { SIGN_IN_METHODS } from '../../lib/auth.js';
import { GUARD_MODES } from '../../lib/formguard.js';
import { buildBackup, backupSummary } from '../../lib/backup.js';

const GUARD_LABELS = {
  flag: 'Let them through, marked as possible spam',
  refuse: 'Refuse them',
};

const METHOD_LABELS = {
  password: 'Password',
  either: 'Password, or a one-time code by email or SMS',
  code: 'One-time code only — nobody keeps a password',
};

const NOTES = {
  'needs-password': ['notice notice--warn',
    'Sign-in was left as it was: set yourself a password under Account first, or you could not get back in.'],
  'backup-failed': ['notice notice--warn',
    'The backup was not made. The reason is in the server log — most likely the database did not pass its own integrity check, and a backup of that is worse than none.'],
};

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

/**
 * What a backup holds, said before the click rather than after.
 *
 * The size matters: this is a download measured in tens of megabytes, and
 * knowing that beforehand is the difference between waiting and wondering.
 * Wrapped because it reads the uploads folder - a screen that cannot be drawn
 * because a backup summary threw would be a poor trade.
 */
function backupPanel() {
  let summary;
  try { summary = backupSummary(); } catch { return ''; }
  const counted = Object.entries(summary.rows)
    .filter(([, n]) => n > 0).map(([t, n]) => `${n} ${t}`).join(', ');
  return `
      <section class="panel" style="margin-top:var(--ui-s-5)">
        <h2 class="h-section" style="margin-bottom:var(--ui-s-4)">Backup</h2>
        <p class="tiny muted" style="margin:0 0 var(--ui-s-4)">
          Everything this site holds that the code does not: the database, the uploads,
          and any typeface uploaded rather than shipped. The paths inside match where
          they belong, so restoring is unpacking it at the root of a fresh copy — there
          is nothing to put anywhere by hand.
        </p>
        <dl class="env-list">
          <dt>Database</dt><dd>${esc(counted || 'empty')}</dd>
          <dt>Uploads</dt><dd>${summary.files} files</dd>
          <dt>Download</dt><dd>about ${esc(mb(summary.bytes))}</dd>
          ${summary.themeFiles
            ? `<dt>Theme</dt><dd>Included — ${summary.themeFiles} files, restored to
               <code>theme/</code>, which is where a site looks for one.</dd>`
            : '<dt>Theme</dt><dd>None of its own — this site draws in the default.</dd>'}
        </dl>
        <p style="margin-top:var(--ui-s-4)">
          <a class="btn" href="/cms/settings/backup" download>Download a backup</a>
        </p>
      </section>`;
}

/**
 * Site settings — everything that makes one installation different from the
 * next. Kept deliberately small: identity, logos, footer, and where forms
 * deliver. Anything secret (API keys, ports) stays in the environment.
 */
export function registerSettings(router, guard) {
  router.get('/cms/settings', guard((req, res, { user, url }) => {
    const values = all();
    const note = NOTES[url.searchParams.get('note')];
    const pick = (key) => (values[key] ? media.byId(values[key]) : null);

    const center = `
      ${cmsHead('Settings')}
      <hr class="rule">
      <form method="post" action="/cms/settings" id="settings-form" class="stack" style="max-width:640px">
        ${note ? `<p class="${note[0]}">${esc(note[1])}</p>` : ''}

        <section class="panel">
          <h2 class="h-section" style="margin-bottom:var(--ui-s-4)">Identity</h2>
          <div class="stack">
            ${field({ label: SCHEMA.site_name.label, name: 'site_name',
              value: values.site_name, hint: SCHEMA.site_name.hint })}
            ${field({ label: SCHEMA.site_url.label, name: 'site_url',
              value: values.site_url, hint: SCHEMA.site_url.hint })}
            ${field({ label: SCHEMA.site_language.label, name: 'site_language',
              value: values.site_language, hint: SCHEMA.site_language.hint })}
            ${field({ label: SCHEMA.site_country.label, name: 'site_country',
              value: values.site_country, hint: SCHEMA.site_country.hint })}
          </div>
        </section>

        <section class="panel">
          <h2 class="h-section" style="margin-bottom:var(--ui-s-4)">Logos</h2>
          <div class="stack">
            ${mediaPicker({ name: 'logo_media', item: pick('logo_media'),
              label: SCHEMA.logo_media.label, hint: SCHEMA.logo_media.hint })}
            ${mediaPicker({ name: 'favicon_media', item: pick('favicon_media'),
              label: SCHEMA.favicon_media.label, hint: SCHEMA.favicon_media.hint })}
          </div>
        </section>

        <section class="panel">
          <h2 class="h-section" style="margin-bottom:var(--ui-s-4)">Sign-in</h2>
          ${select({ label: SCHEMA.signin_method.label, name: 'signin_method',
            value: values.signin_method,
            options: SIGN_IN_METHODS.map((value) => ({ value, label: METHOD_LABELS[value] })),
            hint: SCHEMA.signin_method.hint })}
        </section>

        <section class="panel">
          <h2 class="h-section" style="margin-bottom:var(--ui-s-4)">Articles</h2>
          ${select({ label: SCHEMA.article_parent.label, name: 'article_parent',
            value: values.article_parent ?? '',
            options: pages.list().map((p) => ({ value: p.id, label: `${p.title} — ${p.permalink}` })),
            placeholder: 'No page — articles sit at the site root',
            hint: SCHEMA.article_parent.hint })}
        </section>

        <section class="panel">
          <h2 class="h-section" style="margin-bottom:var(--ui-s-4)">Forms</h2>
          <div class="stack">
            ${field({ label: SCHEMA.contact_email.label, name: 'contact_email',
              value: values.contact_email, type: 'email', hint: SCHEMA.contact_email.hint })}
            ${select({ label: SCHEMA.form_guard.label, name: 'form_guard',
              value: values.form_guard,
              options: GUARD_MODES.map((value) => ({ value, label: GUARD_LABELS[value] })),
              hint: SCHEMA.form_guard.hint })}
          </div>
        </section>

        <section class="panel">
          <h2 class="h-section" style="margin-bottom:var(--ui-s-4)">Footer</h2>
          <div class="stack">
            ${textarea({ label: SCHEMA.footer_text.label, name: 'footer_text',
              value: values.footer_text, rows: 4, hint: SCHEMA.footer_text.hint })}
            ${field({ label: SCHEMA.footer_note.label, name: 'footer_note',
              value: values.footer_note, hint: SCHEMA.footer_note.hint })}
            ${textarea({ label: SCHEMA.social_links.label, name: 'social_links',
              value: linksToText(values.social_links), rows: 4, hint: SCHEMA.social_links.hint })}
          </div>
        </section>
      </form>
      ${backupPanel()}`;

    // The button lives outside the form element, so associate it by id.
    const footer = `
      <span class="cms-actions__status">Changes take effect immediately.</span>
      <button class="btn btn--accent" type="submit" form="settings-form">Save settings</button>`;

    const right = `
      <h2 class="h-tool" style="margin-bottom:var(--ui-s-4)">Environment</h2>
      <p class="tiny muted" style="margin:0 0 var(--ui-s-4)">
        These come from the environment, not from here, because they carry secrets
        or decide how the server starts.</p>
      <dl class="env-list">
        <dt>Sign-in</dt><dd>${config.authDisabled
          ? 'Bypassed on this machine — <code>AUTH_DISABLED=0</code> turns it off' : 'Required'}</dd>
        <dt>Mail</dt><dd>${config.brevoApiKey
          ? 'Brevo' : 'Offline — written to <code>data/outbox/</code>'}</dd>
        <dt>Sender</dt><dd>${esc(config.mail.fromEmail)}</dd>
        <dt>Node port</dt><dd>${config.port}</dd>
      </dl>`;

    html(res, cmsLayout({ title: 'Settings', user, path: '/cms/settings', center, right, footer,
      data: { page: 'settings' } }));
  }, 'admin'));

  /**
   * The same archive `npm run backup` writes, as a download.
   *
   * Admin only, and not because it changes anything - it changes nothing at
   * all - but because it *contains* everything: every message a visitor sent
   * and the users table among it.
   *
   * Built in memory and sent whole rather than streamed, which costs roughly
   * five times the archive's size while it works. Deliberate: it is a button
   * somebody presses a few times a year, and streaming is a good deal more
   * machinery than that earns. src/lib/zip.js says what to do if it ever
   * stops being true.
   */
  router.get('/cms/settings/backup', guard((req, res) => {
    let made;
    try {
      made = buildBackup();
    } catch (err) {
      console.error('  [backup] refused:', err.message);
      return redirect(res, '/cms/settings?note=backup-failed');
    }
    send(res, 200, made.data, {
      'Content-Type': 'application/zip',
      // The name carries the site and the day, because a folder of
      // backup.zip, backup(1).zip tells nobody which site or when.
      'Content-Disposition': `attachment; filename="${made.filename}"`,
      // Never a cached copy of yesterday's content.
      'Cache-Control': 'no-store',
    });
  }, 'admin'));

  router.post('/cms/settings', guard(async (req, res, { user }) => {
    const { fields } = await parseForm(req);
    let note = '';
    if ('signin_method' in fields) {
      if (!SIGN_IN_METHODS.includes(fields.signin_method)) delete fields.signin_method;
      /* Passwords only, from an admin who has none, would shut the door on
         the person closing it. */
      else if (fields.signin_method === 'password' && !user.password_hash) {
        delete fields.signin_method;
        note = 'needs-password';
      }
    }
    /* An unknown value would be read as "not flag", so it is dropped rather
       than stored - the same guard signin_method gets. */
    if ('form_guard' in fields && !GUARD_MODES.includes(fields.form_guard)) {
      delete fields.form_guard;
    }
    for (const [key, spec] of Object.entries(SCHEMA)) {
      if (!(key in fields)) continue;
      if (spec.type === 'links') set(key, parseLinks(fields[key]));
      else if (spec.type === 'media' || spec.type === 'page') set(key, Number(fields[key]) || null);
      else set(key, String(fields[key] ?? '').trim());
    }
    // A plain save is a toast (cms.js reads `saved`); a refusal stays on the page.
    redirect(res, note ? `/cms/settings?note=${note}` : '/cms/settings?saved=1');
  }, 'admin'));
}
