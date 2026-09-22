import { esc, cls, joinHtml } from '../lib/html.js';
import { icon } from './icons.js';
import { iconForUrl } from '../lib/settings.js';
import { config } from '../config.js';
import { asset } from '../lib/assets.js';
import { theme, themeCss } from '../lib/theme.js';
import { pictureHtml } from '../lib/media.js';

/* --------------------------------------------------------------- menus */

const isActive = (node, path) =>
  node.href === path
  || (node.href && node.href !== '/' && path.startsWith(node.href + '/'))
  || (node.children || []).some((child) => isActive(child, path));

function mainMenu(tree, path) {
  if (!tree?.length) return '';
  const items = tree.map((node) => {
    const children = node.children || [];
    return `<li class="${cls('mainmenu__item', isActive(node, path) && 'is-active')}">
      <a class="mainmenu__link" href="${esc(node.href || '#')}">${esc(node.label)}</a>
      ${children.length ? `<div class="dropdown">${children.map((child) =>
        `<a href="${esc(child.href || '#')}">${esc(child.label)}</a>`).join('')}</div>` : ''}
    </li>`;
  });
  return `<nav class="mainmenu" aria-label="Main menu"><ul class="mainmenu__list">${items.join('')}</ul></nav>`;
}

function extraMenu(tree, path) {
  if (!tree?.length) return '';
  return `<ul class="extramenu">${tree.map((node) =>
    `<li><a href="${esc(node.href || '#')}"${isActive(node, path) ? ' aria-current="page"' : ''}>${esc(node.label)}</a></li>`).join('')}</ul>`;
}

function subMenu(tree, path) {
  if (!tree?.length) return '';
  return `<nav class="submenu" aria-label="Section menu"><div class="shell"><ul class="submenu__list">${
    tree.map((node) => `<li class="${cls(isActive(node, path) && 'is-active')}">
      <a href="${esc(node.href || '#')}">${esc(node.label)}</a></li>`).join('')
  }</ul></div></nav>`;
}

/* ------------------------------------------------------------ furniture */

/** Social links come from settings, so any project can use its own. */
function socialBlock(links) {
  if (!links?.length) return '<div class="footer__social"></div>';
  return `<div class="footer__social">
    ${links.map((link) => `<a href="${esc(link.url)}" target="_blank" rel="noopener"
        aria-label="${esc(link.label)}" title="${esc(link.label)}">${icon(iconForUrl(link.url), 17)}</a>`).join('')}
  </div>`;
}

function footerBase(settings, siteName) {
  const contact = String(settings.footer_text || '').split('\n')
    .map((line) => line.trim()).filter(Boolean);
  const note = settings.footer_note || siteName;
  return `<div class="footer__base">
    <span>&copy; ${new Date().getFullYear()} ${esc(note)}</span>
    ${contact.length ? `<span>${contact.map((line) => esc(line)).join(' &middot; ')}</span>` : ''}
  </div>`;
}

function breadcrumbs(trail) {
  if (!trail?.length) return '';
  const parts = trail.map((crumb, i) => {
    const last = i === trail.length - 1;
    const label = last
      ? `<span aria-current="page">${esc(crumb.label)}</span>`
      : `<a href="${esc(crumb.href)}">${esc(crumb.label)}</a>`;
    return `<span class="breadcrumbs__sep">${icon('chevronRight', 12)}</span>${label}`;
  });
  return `<nav class="breadcrumbs" aria-label="Breadcrumbs">
    <a href="/" aria-label="Home">${icon('home', 15)}</a>${parts.join('')}
  </nav>`;
}

/* ---------------------------------------------------------------- shell */

/**
 * The site shell. Topbar, menus and footer are identical on every page
 * (Frame 2.1); pages differ only in what they put into `content`.
 */
export function siteLayout({
  title, description = '', content, ctx,
  trail = null, submenu = null, ogImage = '', bodyClass = '', canonical = '', banner = '',
  noindex = false,
}) {
  /* No `user` here on purpose. The site has no accounts: everything on it is
     public, a page that should not be gets a password in the editor, and the
     way into the CMS is the CMS's own address. A sign-in affordance in the
     top bar only ever advertised a door the visitor has no business at. */
  const { mainTree = [], extraTree = [], footerTree = [], path = '/', settings = {} } = ctx || {};
  const siteName = settings.site_name || 'Site';
  const lang = ctx?.lang || settings.site_language || config.defaultLang;
  // Avoid "Site name | Site name" on the landing page.
  const fullTitle = !title || title === siteName ? siteName : `${title} | ${siteName}`;
  // A raster logo is WebP, so it comes with its fallback; an SVG is just itself.
  // With no logo set the site's name stands in, set in the site's own type.
  const logoImg = settings.logoMedia?.fallback_filename
    ? pictureHtml(settings.logoMedia, { img: `alt="${esc(siteName)}"` })
    : settings.logoUrl
      ? `<img src="${esc(settings.logoUrl)}" alt="${esc(siteName)}">`
      : `<span class="site-name">${esc(siteName)}</span>`;
  const favicon = settings.faviconUrl || '/assets/favicon.svg';
  const baseUrl = settings.site_url || config.siteUrl;
  const siteTheme = theme();

  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:title" content="${esc(title || siteName)}">
${description ? `<meta property="og:description" content="${esc(description)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(siteName)}">
${ogImage ? `<meta property="og:image" content="${esc(baseUrl + ogImage)}">` : ''}
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<link rel="icon" href="${esc(favicon)}">
<link rel="stylesheet" href="${asset('/assets/tokens.css')}">
<link rel="stylesheet" href="${asset('/assets/blocks.css')}">
<link rel="stylesheet" href="${asset('/assets/site.css')}">
<!-- The theme, last, so it overrides the defaults in tokens.css. Inline
     because it changes the instant the theme screen is saved and a generated
     stylesheet would need a cache key of its own. It carries the @font-face
     rules too: every face is served from this machine, so there is no CDN to
     preconnect to and nothing about a visitor leaves the building. -->
<style>${themeCss(siteTheme)}</style>
</head>
<body class="${esc(bodyClass)}">
<a class="visually-hidden" href="#main">Skip to content</a>
${banner}

<header class="topbar" data-topbar>
  <div class="shell topbar__inner">
    <a class="topbar__logo" href="/" aria-label="${esc(siteName)}">
      ${logoImg}
    </a>
    <button class="topbar__toggle" type="button" data-menu-toggle aria-expanded="false" aria-label="Menu">
      ${icon('menu', 36, 'topbar__toggle-open')}${icon('close', 32, 'topbar__toggle-close')}
    </button>
    <div class="topbar__extra">
      ${extraMenu(extraTree, path)}
    </div>
    ${mainMenu(mainTree, path)}
  </div>
</header>

${submenu ? subMenu(submenu, path) : ''}

<main class="main" id="main">
  ${trail ? `<div class="body-col">${breadcrumbs(trail)}</div>` : ''}
  ${content}
</main>

<footer class="footer">
  <div class="shell">
    <div class="footer__grid">
      <div class="footer__logo">
        ${logoImg}
      </div>
      <div class="footer__menus">
        <ul>${(footerTree.length ? footerTree : mainTree).map((node) =>
          `<li><a href="${esc(node.href || '#')}">${esc(node.label)}</a></li>`).join('')}</ul>
        <ul>${extraTree.map((node) =>
          `<li><a href="${esc(node.href || '#')}">${esc(node.label)}</a></li>`).join('')}</ul>
      </div>
      ${socialBlock(settings.social_links)}
    </div>
    ${footerBase(settings, siteName)}
  </div>
</footer>

<script src="${asset('/assets/site.js')}" defer></script>
</body>
</html>`;
}

export { breadcrumbs, subMenu };
