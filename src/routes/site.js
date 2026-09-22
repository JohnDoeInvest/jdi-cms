import { config } from '../config.js';
import { html, json, redirect, parseForm, parseCookies } from '../lib/http.js';
import { esc, joinHtml } from '../lib/html.js';
import { isEmail } from '../lib/util.js';
import { pages, articles, categories, menus, media, messages, forms } from '../models.js';
import { walkObjects, visibleBlocks } from '../lib/objects.js';
import { isCountry, dialFor, joinPhone, isDiallable } from '../lib/phone.js';
import { slugify } from '../lib/util.js';
import { siteLayout } from '../views/layout.js';
import {
  renderBlocks, feedItems, articleCard, articleHref, articleImg, formFields,
} from '../views/render.js';
import { mediaUrl, fallbackUrl, SIZES } from '../lib/media.js';
import { formatDateLong, formatDate } from '../views/helpers.js';
import { sendMail, contactEmail } from '../lib/mail.js';
import { currentUser } from '../lib/auth.js';
import { isUnlocked, passwordMatches, unlockCookie } from '../lib/gate.js';
import { passwordGate } from '../views/gate.js';
import * as settings from '../lib/settings.js';
import { EXTRA_MENU } from '../db/seed.js';

/* ---------------------------------------------------------- page context */

/** Menu trees are read from the *published* copy so drafts stay invisible. */
const publishedTree = (menu) => (menu?.publishedTree?.length ? menu.publishedTree : []);

/**
 * The secondary menu is looked up by name, but an editor may well rename it.
 * Fall back to the first published menu that is not the main one so the top
 * bar never silently loses its links.
 */
function extraMenu() {
  const byName = menus.byName(EXTRA_MENU);
  if (byName) return publishedTree(byName);
  const fallback = menus.allHydrated().find((m) => !m.is_main && m.publishedTree.length);
  return publishedTree(fallback);
}

export function buildContext(req, url) {
  const user = currentUser(req);
  const site = settings.all();
  const lang = site.site_language || config.defaultLang;

  // Resolve media ids to URLs once, so templates never touch the database.
  const logo = site.logo_media ? media.byId(site.logo_media) : null;
  const favicon = site.favicon_media ? media.byId(site.favicon_media) : null;

  return {
    user,
    path: url.pathname,
    lang,
    // Read once here rather than in each route: a page can be rendered by a
    // plain view or by a form submit that comes back to it, and both have to
    // consult the same unlock cookie.
    cookies: parseCookies(req.headers.cookie || ''),
    // The query string, so a feed can read the subject chip a visitor picked
    // without every route having to thread the URL through to the renderer.
    query: Object.fromEntries(url.searchParams),
    settings: {
      ...site,
      logoUrl: logo ? mediaUrl(logo.filename) : '',
      // The row as well, so a raster logo can carry its fallback.
      logoMedia: logo || null,
      // A favicon has to open everywhere, so it is the fallback when there is one.
      faviconUrl: favicon ? fallbackUrl(favicon) : '',
    },
    mainTree: publishedTree(menus.main()),
    extraTree: extraMenu(),
    footerTree: publishedTree(menus.main()),
  };
}

/**
 * The key a field posts under.
 *
 * The same rule renderField uses, and it has to be: the form writes the name
 * attribute and this reads it back, so two answers would mean a field nobody
 * could ever fill in.
 */
const fieldKey = (field) => field.props.name || slugify(field.props.label, '') || `f_${field.id}`;

/** Look up every media item a page references in one query. */
function mediaFor(blocks) {
  const ids = [];
  for (const obj of walkObjects(blocks)) if (obj.props?.media) ids.push(obj.props.media);
  return media.byIds(ids);
}

/**
 * What one article feed draws.
 *
 * `limit` is the batch size, not a ceiling: one more row than asked for is
 * fetched so "is there another batch" is answered by the same query rather
 * than by a second one counting the whole table.
 *
 * A subject chip narrows a feed within its own subjects and can never widen
 * it - a hand-typed `?kategori=` on a feed that lists Produktion and
 * Forskning cannot make it show Investerare.
 */
export function feedFor(props, ctx, offset = 0) {
  const own = props.categories || [];
  const picked = ctx?.query?.kategori ? categories.bySlug(ctx.query.kategori) : null;
  const active = picked && (!own.length || own.includes(picked.id)) ? picked : null;
  const size = props.limit || 3;

  const rows = articles.list({
    status: 'published',
    categoryIds: active ? [active.id] : own,
    limit: size + 1,
    offset,
    // A new pick on every page load. It never pages: a random feed's `more`
    // is always none, or the next batch would repeat what this one showed.
    random: props.order === 'random',
  });

  return {
    items: rows.slice(0, size),
    hasMore: rows.length > size,
    // A feed with subjects of its own offers exactly those; one drawing from
    // everything offers whatever published articles actually carry, so a chip
    // never leads to an empty page.
    chips: own.length ? categories.list().filter((c) => own.includes(c.id)) : categories.inUse(),
    active: active?.id || null,
    activeSlug: active?.slug || '',
  };
}

function trailFor(page) {
  if (!page || page.permalink === '/') return null;
  const segments = page.permalink.split('/').filter(Boolean);
  const trail = [];
  let acc = '';
  for (let i = 0; i < segments.length; i++) {
    acc += '/' + segments[i];
    const isLast = i === segments.length - 1;
    const match = isLast ? page : pages.byPermalink(acc);
    trail.push({ label: match?.title || decodeURIComponent(segments[i]).replace(/-/g, ' '), href: acc });
  }
  return trail;
}

function submenuFor(page) {
  if (!page?.submenu_id) return null;
  const menu = menus.byId(page.submenu_id);
  if (!menu) return null;
  return menu.publishedTree?.length ? menu.publishedTree : null;
}

/* ------------------------------------------------------------- rendering */

/** Says, on the page, that this is not what the public sees. */
const previewBanner = (page, kind = 'pages') => {
  const editorPath = `/cms/${kind}/${page.id}/edit`;
  return `<div class="preview-bar">
  <span><strong>Preview</strong> — ${page.hasDraftChanges
    ? 'showing unpublished changes'
    : 'this matches what is live'}</span>
  <a href="${editorPath}" data-back>Back to the editor</a>
  <script>
  /* Going back should return to the editor tab this was opened from, not
     make a second one. Over an afternoon that is the difference between two
     tabs and twenty. The link still works on its own when there is no tab to
     go back to - opened directly, or the editor since closed. */
  document.querySelector('[data-back]').addEventListener('click', function (event) {
    var back = window.opener;
    try {
      if (!back || back.closed) return;
      if (back.location.pathname !== ${JSON.stringify(editorPath)}) return;
      event.preventDefault();
      back.focus();
      window.close();
    } catch (err) { /* different origin, or focus refused: follow the link */ }
  });
  </script>
</div>`;
};

export function renderPage(page, ctx, flash = {}) {
  /* The gate goes here rather than in each route, because this is the one
     place every public rendering of a page passes through - a view, a form
     submit that comes back to the page it was posted from, the news index
     when a real page covers it. A locked page renders the card *instead of*
     its content: an overlay would ship the whole page to view-source. */
  if (!isUnlocked(ctx, page)) return passwordGate(page, ctx);

  const blocks = visibleBlocks(page.blocks);
  const trail = trailFor(page);
  // The trail reaches the renderer too, so a breadcrumbs *object* can draw it
  // on a page whose type gives it no frame to sit in.
  const renderCtx = {
    ...ctx, media: mediaFor(blocks), flash, trail,
    /* Every form this page points at, read once before rendering starts, the
       same way the media is - so the renderer never touches the database. */
    forms: forms.mapFor(blocks),
    isPreview: !!page.isPreview,
    feedFor: (props) => feedFor(props, ctx),
  };
  const ogId = pages.ogImage(page);
  const ogItem = ogId ? media.byId(ogId) : null;

  const body = blocks.length
    ? renderBlocks(blocks, renderCtx)
    : `<div class="empty-state">
         <h2>${esc(page.title)}</h2>
         <p>Den här sidan har inget innehåll ännu. Lägg till slices och objekt i CMS:et.</p>
         ${ctx.user ? `<p><a class="btn" href="/cms/pages/${page.id}/edit">Redigera sidan</a></p>` : ''}
       </div>`;

  /* Three frames, and the page's own type says which.
     - default  header, breadcrumbs, and the body column's cap
     - landing  no header, still capped
     - blank    nothing: the slices are the page, so a band reaches the
                window edge and each slice's container is the only cap */
  const frame = page.page_type || 'default';
  const content = frame === 'blank'
    ? `<div class="blocks blocks--free">${body}</div>`
    : frame === 'landing'
      ? `<div class="body-col blocks">${body}</div>`
      /* The description is meta and nothing else. It used to draw here as a
         lead paragraph as well, from a design that predates the block editor
         and had no other way to put an intro under a title - so one field
         answered to two masters, and writing for search engines wrote on the
         page. An intro is a Text object at a larger size now, which is the
         editor's own answer and one the author can see while writing it. */
      : `<div class="body-col">
           <header class="page-header"><h1>${esc(page.title)}</h1></header>
           <hr class="page-rule">
           <div class="blocks">${body}</div>
         </div>`;

  return siteLayout({
    // A preview must never be mistaken for the live page, so it says so on
    // the page itself rather than only in the tab it was opened from.
    banner: page.isPreview ? previewBanner(page) : '',
    title: page.meta_title || page.title,
    description: page.meta_description,
    // A link preview is drawn by whatever scraper fetched it, and not every
    // one reads WebP - LinkedIn's is the one that matters most - so it gets
    // the fallback JPG.
    ogImage: ogItem ? fallbackUrl(ogItem) : '',
    canonical: (ctx.settings?.site_url || config.siteUrl) + page.permalink,
    // A blank page has no frame to hang breadcrumbs in.
    trail: frame === 'default' ? trail : null,
    submenu: submenuFor(page),
    bodyClass: frame === 'default' ? 'is-subpage' : 'is-landing',
    content,
    ctx,
  });
}

/**
 * One article, at its own address.
 *
 * The trail is the parent page's trail with the article on the end, so an
 * article under Jobb & karriär reads Home > Jobb & karriär > Title - which is
 * the whole point of an article living under a page rather than under a feed.
 */
export function renderArticle(article, ctx) {
  const parent = article.parent_id ? pages.byId(article.parent_id) : null;
  const trail = [...(parent ? trailFor(parent) || [] : []),
    { label: article.title, href: article.permalink }];

  // Subjects link into whichever page collects articles, since that is the
  // one most likely to carry a feed a subject can actually filter. With no
  // such page set they stay what they are: labels.
  const hub = ctx.settings?.article_parent ? pages.byId(ctx.settings.article_parent) : null;
  const subject = (c) => (hub
    ? `<a class="tag" href="${esc(hub.permalink)}?kategori=${encodeURIComponent(c.slug)}">${esc(c.name)}</a>`
    : `<span class="tag">${esc(c.name)}</span>`);

  const related = articles.list({
    status: 'published',
    // Any shared subject, not just the primary: a piece about Produktion and
    // Jobb & karriär is relevant to readers of both.
    categoryIds: (article.categories || []).map((c) => c.id),
    limit: 4,
  }).filter((a) => a.id !== article.id).slice(0, 3);

  /* The body is slices and objects, drawn by the same renderer a page's are.
     An article is written rather than designed, but it is written with the
     tools that exist - a comparison piece wants a table, and one was already
     built. */
  const blocks = visibleBlocks(article.blocks);
  const bodyHtml = renderBlocks(blocks, {
    ...ctx, media: mediaFor(blocks), trail, flash: {},
    feedFor: (props) => feedFor(props, ctx),
  });

  /* Subjects, headline and standfirst are one thing to read; the byline is a
     footnote to it. Stacked in writing order they were four sizes in a row
     with the smallest in the middle, which is what made the head read as
     clutter rather than as a heading. */
  const content = `<div class="body-col">
    <header class="page-header page-header--article">
      ${article.categories?.length
        ? `<div class="article-subjects">${article.categories.map(subject).join('')}</div>` : ''}
      <h1>${esc(article.title)}</h1>
      ${article.lead ? `<p class="page-header__lead">${esc(article.lead)}</p>` : ''}
      <p class="article-meta">${esc(formatDateLong(article.published_at || article.created_at))}
        ${article.author_name ? ` &middot; ${esc(article.author_name)}` : ''}</p>
    </header>
    ${article.image_filename ? `<figure class="article-hero">
      <div class="article-hero__frame">${articleImg(article, SIZES.content)}</div>
      ${article.image_caption ? `<figcaption>${esc(article.image_caption)}</figcaption>` : ''}
    </figure>` : ''}
    <div class="article-body blocks">${bodyHtml}</div>
    ${article.cta_label && article.cta_url
      ? `<p style="margin-top:var(--s-6)"><a class="btn btn--accent" href="${esc(article.cta_url)}">${esc(article.cta_label)}</a></p>`
      : ''}
    ${related.length ? `<section style="margin-top:var(--s-9)">
      <h2 class="block-header" style="margin-bottom:var(--s-5)">Mer att läsa</h2>
      <div class="card-grid">${related.map(articleCard).join('')}</div></section>` : ''}
  </div>`;

  return siteLayout({
    banner: article.isPreview ? previewBanner(article, 'articles') : '',
    title: article.title,
    description: article.lead,
    ogImage: article.image_filename ? mediaUrl(article.image_fallback || article.image_filename) : '',
    canonical: (ctx.settings?.site_url || config.siteUrl) + article.permalink,
    // An article sits under a page, so it inherits that page's sub menu -
    // which is what keeps the reader inside the section they came from.
    submenu: submenuFor(parent),
    // `is-article` on top of the subpage frame: an article is read rather
    // than browsed, and gets a clear white ground of its own.
    bodyClass: 'is-subpage is-article',
    trail,
    content,
    ctx,
  });
}

/* ----------------------------------------------------------------- routes */

export function registerSiteRoutes(router) {
  /**
   * Generic form submit.
   *
   * The posted `form` id is looked up in the page's own content, so the field
   * list, validation rules and recipient all come from the stored definition
   * rather than anything the browser sent.
   */
  router.post('/form/submit', async (req, res, { ctx }) => {
    const { fields } = await parseForm(req);
    const back = String(fields.page || '/').startsWith('/') ? String(fields.page || '/') : '/';
    const page = pages.byPermalink(back);
    if (!page) return notFound(res, ctx);

    /* The page says which of its form objects was posted; the object says
       which form that is. Both are read from the stored page rather than from
       what the browser sent, so a hand-edited request cannot point the
       submission at a form the page does not carry - or at a recipient of the
       sender's choosing. A form in a hidden slice is not on the page. */
    const placed = [...walkObjects(visibleBlocks(page.blocks))].find(
      (obj) => obj.kind === 'form' && obj.id === String(fields.form || ''));
    const form = placed?.props?.formId ? forms.byId(placed.props.formId) : null;
    if (!form) return redirect(res, back);

    const definition = formFields(form);
    const values = {};
    const missing = [];
    let replyTo = '';

    for (const field of definition) {
      const name = fieldKey(field);
      const raw = String(fields[name] ?? '').trim();
      values[name] = raw;
      if (field.props.required && !raw) missing.push(field.props.label || name);
      if (field.kind === 'fieldEmail') {
        if (raw && !isEmail(raw)) missing.push(`${field.props.label || name} (giltig e-post)`);
        else if (raw && !replyTo) replyTo = raw;
      }
      /* A phone field answers with two controls, and what is stored is the
         one number they make: E.164, joined here so the e-mail, the message
         list and anything reading them later all see the same string. The
         country the visitor picked is kept beside it only to put the select
         back where they left it if the form comes back with an error. */
      if (field.kind === 'fieldPhone') {
        const picked = String(fields[`${name}_prefix`] ?? '').toUpperCase();
        const country = isCountry(picked) ? picked : field.props.prefix;
        values[`${name}_prefix`] = country;
        const joined = joinPhone(dialFor(country), raw);
        values[name] = joined;
        if (raw && !isDiallable(joined)) missing.push(`${field.props.label || name} (giltigt nummer)`);
      }
    }

    const flash = { formValues: values };
    if (!definition.length || missing.length) {
      flash.formErrorId = placed.id;
      flash.formError = missing.length
        ? `Fyll i: ${missing.join(', ')}.`
        : 'Formuläret har inga fält ännu.';
      return html(res, renderPage(page, { ...ctx, path: back }, flash));
    }

    const fallback = ctx.settings?.contact_email;
    const recipient = isEmail(form.recipient) ? form.recipient
      : (isEmail(fallback) ? fallback : config.mail.contactTo);
    const subject = form.subject || form.name || 'Meddelande från webbplatsen';
    const body = definition.map((field) => {
      const name = fieldKey(field);
      return `${field.props.label || name}: ${values[name] || '—'}`;
    }).join('\n');

    /* With no recipient anywhere the message is still kept - it is in the
       CMS's messages either way - there is just nobody to mail it to. */
    let delivered = false;
    if (recipient) {
      try {
        const result = await sendMail({
          to: recipient,
          ...(replyTo ? { replyTo } : {}),
          ...contactEmail({ subject, from: replyTo || 'okänd avsändare', message: body, page: back }),
        });
        delivered = !!result.delivered;
      } catch (err) {
        console.error('  [form] delivery failed:', err.message);
      }
    }
    messages.create({ subject, from_email: replyTo, body, page: back, form_id: form.id, delivered });

    html(res, renderPage(page, { ...ctx, path: back }, { formSentId: placed.id }));
  });

  /**
   * The next batch of an article feed.
   *
   * Only the offset comes from the browser. Which subjects, which layout and
   * how many are read from the feed object *as stored on the page* - the same
   * rule /form/submit follows, so a hand-edited request cannot ask a feed for
   * anything the page does not already show.
   */
  router.get('/api/feed', (req, res, { url, ctx }) => {
    const path = url.searchParams.get('path') || '/';
    const page = pages.byPermalink(path.startsWith('/') ? path.replace(/\/$/, '') || '/' : '/');
    if (!page) return json(res, { error: 'No such page' }, 404);
    // A feed on a locked page is as locked as the page it sits on.
    if (!isUnlocked(ctx, page)) return json(res, { error: 'This page is protected' }, 403);

    const wanted = url.searchParams.get('block') || '';
    const feed = [...walkObjects(visibleBlocks(page.blocks))]
      .find((obj) => obj.kind === 'articles' && obj.id === wanted);
    if (!feed) return json(res, { error: 'No such feed' }, 404);

    const asked = Number.parseInt(url.searchParams.get('offset'), 10);
    const offset = Number.isFinite(asked) ? Math.max(0, Math.min(5000, asked)) : 0;
    const batch = feedFor(feed.props, ctx, offset);

    json(res, {
      html: feedItems(batch.items, feed.props.layout),
      more: batch.hasMore,
      count: batch.items.length,
    });
  });

  /**
   * Anything else, by address: a page first, then an article.
   *
   * Pages and articles share one address space, so this is two lookups and no
   * parsing - which is exactly why an article stores a whole permalink rather
   * than having one derived from its parent at request time.
   *
   * Registered last so it never shadows the routes above.
   */
  router.get('/*', (req, res, { url, ctx }) => {
    const permalink = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '');

    const page = pages.byPermalink(permalink);
    if (page) {
      // A locked page nobody got into is not a page view.
      if (isUnlocked(ctx, page)) pages.countViews(page.id);
      return html(res, renderPage(page, ctx));
    }

    const article = articles.byPermalink(permalink);
    if (article) {
      /* An article is locked by the page it lives under. A password set on
         Production is a statement about that section, and an article filed
         there is part of it - so the lock has to reach the pieces, or the
         section is protected everywhere except where the writing is. */
      const parent = article.parent_id ? pages.byId(article.parent_id) : null;
      if (parent && !isUnlocked(ctx, parent)) return html(res, passwordGate(parent, ctx));
      articles.countViews(article.id);
      return html(res, renderArticle(article, ctx));
    }

    notFound(res, ctx);
  });

  /**
   * Unlock a password-protected page.
   *
   * The gate posts to the page's own address, so there is no reserved path to
   * collide with a permalink and the form needs nothing hidden in it. Getting
   * it right sets a cookie holding an HMAC of the id and the password, which
   * is why changing the password shuts every visitor out again.
   *
   * Registered after every other POST route, and last of all, for the same
   * reason the GET catch-all is.
   */
  router.post('/*', async (req, res, { url, ctx }) => {
    const permalink = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '');
    const page = pages.byPermalink(permalink);
    // A page with no password has nothing to unlock, and saying so would tell
    // a stranger which addresses are protected.
    if (!page || !page.password) return notFound(res, ctx);

    const { fields } = await parseForm(req);
    if (!passwordMatches(page, fields.password)) {
      return html(res, passwordGate(page, ctx, { error: 'Wrong password. Try again.' }), 403);
    }
    res.setHeader('Set-Cookie', unlockCookie(page.id, page.password, req));
    redirect(res, permalink);
  });
}

/* -------------------------------------------------------------------- 404 */

export function notFound(res, ctx) {
  html(res, siteLayout({
    title: 'Sidan hittades inte',
    content: `<div class="body-col"><div class="empty-state" style="margin-block:var(--s-9)">
      <h2>Sidan hittades inte</h2>
      <p>Adressen finns inte, eller så är sidan inte publicerad ännu.</p>
      <p><a class="btn" href="/">Till startsidan</a></p>
    </div></div>`,
    ctx: ctx || { mainTree: [], extraTree: [], footerTree: [], path: '/', settings: settings.all() },
  }), 404);
}
