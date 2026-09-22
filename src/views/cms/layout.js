import { esc, cls, escJson } from '../../lib/html.js';
import { icon } from '../icons.js';
import { initials } from '../helpers.js';
import { mediaUrl } from '../../lib/media.js';
import { config } from '../../config.js';
import { asset } from '../../lib/assets.js';
import { theme, themeCss } from '../../lib/theme.js';
import { PRODUCT, mark } from '../brand.js';

const NAV = [
  // Leaving the CMS is a destination like any other; the divider marks it out.
  { href: '/', label: 'View site', icon: 'eye', external: true },
  { sep: true },
  { href: '/cms', label: 'Dashboard', icon: 'dashboard', exact: true },
  { href: '/cms/articles/new', label: 'New article', icon: 'plus', kbd: '⇧N' },
  { sep: true },
  { href: '/cms/pages', label: 'Pages', icon: 'pages' },
  { href: '/cms/articles', label: 'Articles', icon: 'articles' },
  { href: '/cms/media', label: 'Media library', icon: 'media' },
  { sep: true },
  { href: '/cms/templates', label: 'Page templates', icon: 'template' },
  { href: '/cms/theme', label: 'Theme', icon: 'palette', role: 'admin' },
  { href: '/cms/menus', label: 'Menus', icon: 'menu' },
  { href: '/cms/forms', label: 'Forms', icon: 'form' },
  { href: '/cms/categories', label: 'Categories', icon: 'categories' },
  { sep: true },
  { href: '/cms/users', label: 'Users', icon: 'users', role: 'admin' },
  { href: '/cms/settings', label: 'Settings', icon: 'settings', role: 'admin' },
];

const activeFor = (item, path) =>
  item.exact ? path === item.href : path === item.href || path.startsWith(item.href + '/');

/**
 * Navigation rail.
 *
 * Collapsed to a 64px icon rail by default, which is what a 13" screen needs.
 * Hovering floats the full menu over the centre column rather than pushing it,
 * so the editing area never reflows. The pin keeps it open and is remembered.
 */
function sidebar(path, user) {
  const items = NAV.map((item) => {
    if (item.sep) return '<div class="cms-nav__sep" role="separator"></div>';
    if (item.role === 'admin' && user?.role !== 'admin') return '';
    const target = item.external ? ' target="_blank" rel="noopener"' : '';
    return `<a class="${cls('cms-nav__link', !item.external && activeFor(item, path) && 'is-active')}"
       href="${esc(item.href)}" title="${esc(item.label)}"${target}>
      <span class="cms-nav__icon">${icon(item.icon, 19)}</span>
      <span class="cms-nav__label">${esc(item.label)}</span>
      ${item.kbd ? `<kbd class="cms-nav__kbd">${esc(item.kbd)}</kbd>` : ''}
    </a>`;
  });
  return `<aside class="cms-left" data-nav-rail>
    <div class="cms-left__inner">
      <a class="cms-left__logo" href="/cms" aria-label="${PRODUCT}">
        ${mark(32, 'cms-left__mark')}
        <span class="cms-left__wordmark">${PRODUCT}</span>
      </a>
      <nav class="cms-nav" aria-label="CMS menu">${items.join('')}</nav>
      <div class="cms-left__foot">
        ${config.authDisabled ? `
        <div class="cms-nav__notice" title="AUTH_DISABLED=1 — set to 0 to require signing in">
          <span class="cms-nav__icon">${icon('warning', 17)}</span>
          <span class="cms-nav__label">Sign-in disabled</span>
        </div>` : ''}
        ${appearanceSwitch()}
        <button class="cms-nav__pin" type="button" data-nav-pin
                aria-pressed="false" title="Keep menu open">
          <span class="cms-nav__icon">${icon('pin', 17)}</span>
          <span class="cms-nav__label">Pin menu</span>
        </button>
        ${accountRow(user)}
      </div>
    </div>
  </aside>`;
}

/**
 * Light, dark or the system's choice, one click apart.
 *
 * All three icons are drawn and the stylesheet shows the one the root says,
 * so the switch is right on the first paint. cms.js words the label and the
 * title once it runs; until then the rail is shut and the label unseen.
 */
const appearanceSwitch = () => `
        <button class="cms-nav__appearance" type="button" data-appearance-toggle title="Appearance">
          <span class="cms-nav__icon">
            <span class="appearance-icon appearance-icon--system">${icon('appearance', 17)}</span>
            <span class="appearance-icon appearance-icon--light">${icon('sun', 17)}</span>
            <span class="appearance-icon appearance-icon--dark">${icon('moon', 17)}</span>
          </span>
          <span class="cms-nav__label">Appearance</span>
        </button>`;

/** Account cluster at the foot of the rail, Vercel-style. */
function accountRow(user) {
  const avatar = user?.image_filename
    ? `<img src="${esc(mediaUrl(user.image_filename))}" alt="">`
    : esc(initials(user?.full_name, user?.email));
  return `<div class="cms-account">
    <a class="cms-account__user" href="/cms/account"
       title="${esc(user?.full_name || user?.email || 'Account')}">
      <span class="avatar avatar--sm">${avatar}</span>
      <span class="cms-nav__label cms-account__name">${esc(user?.full_name || user?.email || 'Unknown')}</span>
    </a>
    <form method="post" action="/cms/logout" class="cms-account__out">
      <button class="icon-btn" type="submit" title="Log out" aria-label="Log out">${icon('logout', 17)}</button>
    </form>
  </div>`;
}

/**
 * The CMS shell. `right` is the context-sensitive tools pane; pass null to
 * collapse it (Frames 4.4 - 4.12 all share this frame).
 */
export function cmsLayout({ title, user, path, center, right = null, footer = null,
  wide = false, scripts = [], data = {} }) {
  // The theme styles the canvas, not the chrome: it is emitted before
  // cms-tokens.css so a --ui-* rule always wins if the two ever meet.
  const siteTheme = theme();
  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | ${PRODUCT}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<!-- Not deferred: it says light or dark before anything is drawn. -->
<script src="${asset('/assets/cms-appearance.js')}"></script>
<!-- Two token sets, deliberately. tokens.css + blocks.css draw the real
     content on the canvas exactly as the site will; cms-tokens.css + cms.css
     draw everything around it. The names never collide, so a site's brand
     cannot reach the editor's chrome or the other way round. -->
<link rel="stylesheet" href="${asset('/assets/tokens.css')}">
<link rel="stylesheet" href="${asset('/assets/blocks.css')}">
<style>${themeCss(siteTheme)}</style>
<link rel="stylesheet" href="${asset('/assets/cms-tokens.css')}">
<link rel="stylesheet" href="${asset('/assets/cms.css')}">
</head>
<body>
<div class="${cls('cms', wide && 'cms--wide', !right && 'cms--nopanel')}">
  ${sidebar(path, user)}
  <main class="cms-center">
    <div class="cms-center__scroll">${center}</div>
    ${footer ? `<div class="cms-actions">${footer}</div>` : ''}
  </main>
  ${right ? `<aside class="cms-right">${right}</aside>` : ''}
</div>
<div class="toasts" id="toasts" aria-live="polite"></div>
<div id="dialog-root"></div>
<script id="cms-data" type="application/json">${escJson(data)}</script>
<script src="${asset('/assets/cms.js')}" defer></script>
${scripts.map((src) => `<script src="${esc(asset(src))}" defer></script>`).join('')}
</body>
</html>`;
}

/** Page heading row with optional actions on the right. */
export const cmsHead = (heading, actions = '') =>
  `<div class="cms-head"><h1 class="h-page grow">${esc(heading)}</h1>${actions}</div>`;

export { NAV };
