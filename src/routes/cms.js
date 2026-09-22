import { redirect, json, html } from '../lib/http.js';
import { currentUser, atLeast, needsSetup } from '../lib/auth.js';
import { cmsLayout } from '../views/cms/layout.js';
import { registerDashboard } from './cms/dashboard.js';
import { registerPages } from './cms/pages.js';
import { registerArticles } from './cms/articles.js';
import { registerMedia } from './cms/media.js';
import { registerUsers } from './cms/users.js';
import { registerMenus } from './cms/menus.js';
import { registerCategories } from './cms/categories.js';
import { registerSlices } from './cms/slices.js';
import { registerTemplates } from './cms/templates.js';
import { registerTheme } from './cms/theme.js';
import { registerForms } from './cms/forms.js';
import { registerFonts } from './cms/fonts.js';
import { registerSettings } from './cms/settings.js';
import { registerAccount } from './cms/account.js';

/**
 * Wrap a CMS handler with authentication and a minimum role.
 *
 * Anonymous requests are sent to the login screen (or answered with 401 for
 * the JSON endpoints). Under-privileged users get a plain explanation rather
 * than a redirect loop.
 */
const guard = (handler, role = 'visitor') => async (req, res, ctx) => {
  const user = currentUser(req);
  const wantsJson = ctx.url.pathname.startsWith('/cms/api/');

  if (!user) {
    if (wantsJson) return json(res, { error: 'Not signed in' }, 401);
    return redirect(res, needsSetup() ? '/cms/setup' : '/cms/login');
  }
  if (!atLeast(user, role)) {
    if (wantsJson) return json(res, { error: 'Not permitted' }, 403);
    return html(res, cmsLayout({
      title: 'Not permitted', user, path: ctx.url.pathname,
      center: `<h1 class="h-page">Not permitted</h1>
        <p class="muted" style="margin-top:var(--s-3)">Your role (<strong>${user.role}</strong>)
        is not enough for this view. Contact an administrator.</p>
        <p style="margin-top:var(--s-5)"><a class="btn" href="/cms">Back to dashboard</a></p>`,
    }), 403);
  }
  return handler(req, res, { ...ctx, user });
};

export function registerCmsRoutes(router) {
  registerDashboard(router, guard);
  registerPages(router, guard);
  registerArticles(router, guard);
  registerMedia(router, guard);
  registerMenus(router, guard);
  registerCategories(router, guard);
  registerSlices(router, guard);
  registerTemplates(router, guard);
  registerTheme(router, guard);
  registerForms(router, guard);
  registerFonts(router, guard);
  registerUsers(router, guard);
  registerSettings(router, guard);
  registerAccount(router, guard);
}
