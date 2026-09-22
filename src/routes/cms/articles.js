import { config } from '../../config.js';
import { html, redirect, parseForm, json, parseCookies } from '../../lib/http.js';
import { esc, stripTags } from '../../lib/html.js';
import { icon } from '../../views/icons.js';
import { cmsLayout, cmsHead } from '../../views/cms/layout.js';
import {
  field, textarea, select, checkboxGroup, mediaPicker,
  emptyState, rowActions, statusPill, scheduleCell, dateCell, sortHeader, listSort, sortCookie,
  linkOptions, richToolbar, editorActions, editorState, addressState,
} from '../../views/cms/parts.js';
import { editorPanel } from '../../views/cms/editor.js';
import { articles, categories, media, pages, slices, firstText, draftView } from '../../models.js';
import {
  normalizeBlocks, walkObjects, visibleBlocks, allowedInArticle, ARTICLE_OBJECT_ORDER,
} from '../../lib/objects.js';
import { theme } from '../../lib/theme.js';
import { embedProviderList } from '../../lib/embed.js';
import { publicMedia } from './media.js';
import { buildContext, renderArticle } from '../site.js';
import * as settings from '../../lib/settings.js';
import { parsePublishAt, parsePublishedOn, localDay, nowSql } from '../../lib/util.js';

/**
 * Frame 4.10 - Articles.
 *
 * The list is its own screen and writing is its own screen, the way pages
 * work. Long-form text in a sidebar is a column three inches wide, and an
 * article is the one thing in this CMS that is mostly text.
 *
 * The canvas is the *same* canvas a page uses, less the three objects that
 * are about a page's place in the site. Restricting an article to Text and
 * Image would have meant a second, weaker editor beside a good one - and two
 * ways to put a picture into a CMS, which leaves an author guessing which
 * tool they are meant to reach for.
 */
export function registerArticles(router, guard) {
  /* ------------------------------------------------------------- the list */

  router.get('/cms/articles', guard((req, res, { user, url }) => {
    const search = url.searchParams.get('q') || '';
    /* Asked for in the URL, remembered between visits - a list reached from
       the nav rail carries no query string and used to start over every
       time. */
    const { sort, dir, remember } = listSort(url, parseCookies(req.headers.cookie), 'articles');
    const list = articles.list({ search, sort, dir });
    const sortAt = `/cms/articles${search ? `?q=${encodeURIComponent(search)}` : ''}`;

    const rows = list.map(draftView).map((a) => `<tr>
      <td><a class="cell-link truncate" href="/cms/articles/${a.id}/edit">${esc(a.title || 'Untitled')}</a>
        <div class="tiny muted">${esc(a.permalink)}</div></td>
      <td class="col-narrow">${dateCell(a.updated_at)}</td>
      <td class="col-narrow">${statusPill(a.status, a.hasDraftChanges, a.schedule)}${scheduleCell(a.schedule)}</td>
      <td class="col-narrow"><span class="small muted">${esc(a.author_name || '–')}</span></td>
      <td class="actions">${rowActions({
        editHref: `/cms/articles/${a.id}/edit`,
        deleteAction: `data-delete-article="${a.id}" data-title="${esc(a.title || 'Untitled')}"`,
        extra: a.status === 'published'
          ? `<a class="icon-btn" href="${esc(a.permalink)}" target="_blank" rel="noopener" title="View on site">${icon('eye', 17)}</a>`
          : '',
      })}</td>
    </tr>`).join('');

    const center = `
      ${cmsHead('Articles', `
        <div class="field" style="max-width:220px">
          <input type="search" name="q" value="${esc(search)}" placeholder="Search articles"
                 data-list-search autocomplete="off">
        </div>
        <a class="btn btn--primary" href="/cms/articles/new">${icon('plus', 17)} Create</a>`)}
      <hr class="rule">
      ${list.length ? `<table class="table">
        <thead><tr>
          ${sortHeader({ label: 'Title', key: 'title', sort, dir, href: sortAt })}
          ${sortHeader({ label: 'Edited', key: 'date', sort, dir, href: sortAt,
            natural: 'desc', extraClass: 'col-narrow' })}
          <th>Status</th><th>Author</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table>` : emptyState(search ? 'No matches.' : 'No articles yet.')}`;

    const right = `
      <h2 class="h-tool" style="margin-bottom:var(--ui-s-4)">Articles</h2>
      <p class="muted small">An article is written on the same canvas a page is, and lives under
        whichever page you file it under. Open one to write it, or
        <a class="linkish" href="/cms/articles/new">start a new one</a>.</p>`;

    html(res, cmsLayout({ title: 'Articles', user, path: '/cms/articles', center, right,
      data: { page: 'articles' } }), 200,
    remember ? { 'Set-Cookie': sortCookie('articles', remember) } : {});
  }));

  /* --------------------------------------------------------- create first */

  /**
   * A new article asks for a title and nothing else. Everything else is
   * decided while writing, so a form for it up front would only stand between
   * the idea and the first sentence.
   */
  router.get('/cms/articles/new', guard((req, res, { user }) => {
    const center = `
      ${cmsHead('New article')}
      <hr class="rule">
      <form class="stack" method="post" action="/cms/articles" style="max-width:520px">
        ${field({ label: 'Title', name: 'title', value: '', required: true, autofocus: true,
          placeholder: 'What is it about?' })}
        <div class="row">
          <button class="btn btn--primary" type="submit">Create and write</button>
          <a class="btn" href="/cms/articles">Cancel</a>
        </div>
      </form>`;
    html(res, cmsLayout({ title: 'New article', user, path: '/cms/articles', center,
      right: '<p class="muted small">Everything else is decided while you write.</p>',
      data: { page: 'articles' } }));
  }));

  router.post('/cms/articles', guard(async (req, res, { user }) => {
    const { fields } = await parseForm(req);
    const title = String(fields.title || '').trim();
    if (!title) return redirect(res, '/cms/articles/new');
    const article = articles.create({
      title, parent_id: settings.get('article_parent'), status: 'draft',
    }, user.id);
    redirect(res, `/cms/articles/${article.id}/edit`);
  }, 'editor'));

  /* ----------------------------------------------------------- the editor */

  /* Frozen is a state, not a wall - the same wording a page uses, for the
     same reason: saying only that an address is fixed leaves somebody who
     genuinely has to move a piece with nowhere to go. */
  const FROZEN_HINT = (address) =>
    `Fixed at publish so links keep working: ${address}. Unpublish the article to move it.`;
  const SCHEDULED_HINT = (address) =>
    `Fixed once scheduled, so links made in advance keep working: ${address}. Remove the schedule to move the article.`;
  const FREE_HINT = 'The page it lives under, which decides its address. Fixed once published or scheduled.';

  /**
   * The article's own fields, folded away and saved the way a page's meta is.
   *
   * This was a form of its own with a Save details button at the bottom of a
   * fold, while Publish sat in the toolbar in plain sight - so the obvious
   * button saved everything except what had just been typed, and the setting
   * silently did not take. A page had exactly this and lost it for exactly
   * this reason. One save, and `data-page-field` is the whole job.
   */
  const detailsForm = (article, { cats, pageList, image }) => {
    /* Subjects are rows in a join table, so a pending change to them waits as
       a list of ids rather than as a value on the row - `draftView` lays that
       list over the top, and it is what the fold should show. */
    const subjects = Array.isArray(article.category_ids)
      ? article.category_ids
      : (article.categories || []).map((c) => c.id);
    const address = addressState(article);
    const hint = { live: FROZEN_HINT, scheduled: SCHEDULED_HINT }[address];
    return `
      <div class="stack" style="padding:0 var(--ui-s-4) var(--ui-s-4)">
        ${mediaPicker({ name: 'image_id', item: image, label: 'Lead image',
          hint: 'Shown on cards and when the article is shared. Not part of the body.',
          extra: 'data-page-field="image_id"' })}
        ${select({ label: 'Appears under', name: 'parent_id', value: article.parent_id ?? '',
          options: pageList.map((p) => ({ value: p.id, label: `${p.title} — ${p.permalink}` })),
          placeholder: 'No page — sits at the site root',
          disabled: !!hint,
          hint: hint ? hint(article.permalink) : FREE_HINT,
          extra: `data-page-field="parent_id" data-address-field`
            + ` data-hint-free="${esc(FREE_HINT)}"`
            + ` data-hint-live="${esc(FROZEN_HINT('{address}'))}"`
            + ` data-hint-scheduled="${esc(SCHEDULED_HINT('{address}'))}"` })}
        ${select({ label: 'Subject', name: 'category_id', value: subjects[0] ?? '',
          options: cats.map((c) => ({ value: c.id, label: c.name })),
          placeholder: 'No subject', hint: 'The one shown on cards and in breadcrumbs.',
          extra: 'data-page-field="category_id"' })}
        ${cats.length ? checkboxGroup({ label: 'Also about', name: 'extra_categories',
          options: cats.map((c) => ({ value: c.id, label: c.name })),
          values: subjects.slice(1),
          hint: 'An article can belong to several subjects, and shows on each of their pages.',
          extra: 'data-page-field="extra_categories" data-multi' }) : ''}
        ${field({ label: 'Published', name: 'published_on', type: 'date',
          value: localDay(article.published_at),
          hint: 'The date the article shows, and where feeds place it. Left empty, it takes the '
            + 'day it goes out. Today or earlier — to publish later, use Schedule.',
          extra: `data-page-field="published_on" max="${localDay(nowSql())}"` })}
        <div class="field-row">
          ${field({ label: 'CTA label', name: 'cta_label', value: article.cta_label ?? '',
            placeholder: 'Read more', extra: 'data-page-field="cta_label"' })}
          ${field({ label: 'CTA link', name: 'cta_url', value: article.cta_url ?? '',
            placeholder: 'https://', hint: 'Set this and cards point here instead of at the article.',
            extra: 'data-page-field="cta_url"' })}
        </div>
      </div>`;
  };

  router.get('/cms/articles/:id/edit', guard((req, res, { user, params }) => {
    // The live row with whatever is waiting for Publish laid over it.
    const article = draftView(articles.byId(Number(params.id)));
    if (!article) return redirect(res, '/cms/articles');

    const cats = categories.list();
    const pageList = pages.list();
    const image = article.image_id ? media.byId(article.image_id) : null;
    const sliceList = slices.list().map((s) => ({
      id: s.id, name: s.name, usage: slices.usage(s.id).length,
    }));

    // Ship every referenced media item so the canvas can draw its previews.
    const mediaIds = [];
    for (const obj of walkObjects(article.draftBlocks)) if (obj.props?.media) mediaIds.push(obj.props.media);
    const mediaMap = Object.fromEntries([...media.byIds(mediaIds)].map(([id, m]) => [id, publicMedia(m)]));

    const center = `
      <nav class="row tiny muted" style="margin-bottom:var(--ui-s-2)">
        <a href="/cms/articles" class="linkish">Articles</a><span>/</span><span>${esc(article.title)}</span>
      </nav>
      <div class="cms-head">
        <h1 class="h-page grow">Edit article</h1>
        <span class="pill pill--saved" data-save-state></span>
        <span data-status-pill>${statusPill(article.status, article.hasDraftChanges, article.schedule)}</span>
        <a class="btn btn--sm" href="/cms/articles/${article.id}/preview" target="cms-preview"
           title="Opens the draft, including changes that are not live">${icon('eye', 16)} View</a>
      </div>

      <details class="panel" style="padding:0;margin-bottom:var(--ui-s-5)">
        <summary class="row" style="padding:var(--ui-s-3) var(--ui-s-4);cursor:pointer;list-style:none">
          ${icon('chevronRight', 16)}<span class="strong">Details</span>
          <span class="tiny muted grow truncate">${esc(article.permalink)}</span>
        </summary>
        ${detailsForm(article, { cats, pageList, image })}
      </details>

      <div class="field">
        <label for="a-title">Title</label>
        <input id="a-title" type="text" data-page-field="title" value="${esc(article.title)}">
      </div>
      ${textarea({ label: 'Excerpt', id: 'a-lead', name: 'lead', value: article.lead ?? '', rows: 2,
        hint: 'Shown under the headline and on cards. Taken from the opening text when left empty.',
        extra: 'data-page-field="lead" class="textarea--short"' })}

      ${richToolbar({ contextual: true })}
      <div class="canvas" data-canvas>
        <div class="canvas__hint" data-canvas-hint>
          Drag blocks here from the library on the right.
        </div>
      </div>
      <button class="btn btn--full" type="button" data-add-block style="margin-top:var(--ui-s-3)">
        ${icon('plus', 17)} Add a block or saved slice</button>
      <div class="row" style="margin-top:var(--ui-s-4)">
        <button class="linkish linkish--danger" type="button" data-wipe-page>Clear all blocks</button>
      </div>`;

    const footer = editorActions(article);

    html(res, cmsLayout({
      title: `Edit ${article.title}`, user, path: '/cms/articles',
      center, right: editorPanel({ slices: sliceList, kinds: ARTICLE_OBJECT_ORDER }), footer,
      scripts: ['/assets/cms-editor.js'],
      data: {
        page: 'article-editor',
        mode: 'article',
        permalink: article.permalink,
        status: article.status,
        savedAt: article.updated_at,
        hasDraftChanges: article.hasDraftChanges,
        scheduledAt: article.schedule?.at ?? null,
        blocks: article.draftBlocks,
        media: mediaMap,
        slices: sliceList,
        categories: cats.map((c) => ({ id: c.id, name: c.name })),
        colors: theme().colors,
        // An article's body always sits inside the content column, so a band
        // never reaches the window edge whatever its container is set to.
        frame: 'default',
        trail: [],
        embedProviders: embedProviderList(),
        // Less a page's furniture, and the same list the palette is built
        // from - so the "Add a block" dialogue cannot offer what the server
        // would strip back out on save.
        objectKinds: ARTICLE_OBJECT_ORDER,
        linkOptions: linkOptions(pageList),
        saveUrl: `/cms/api/articles/${article.id}`,
      },
    }));
  }));

  /* ------------------------------------------------------------ the saves */

  /**
   * Canvas save.
   *
   * Blocks land in the draft and never in what is live - the same rule a page
   * follows, and what makes writing on a published article safe. `status`
   * means what it means on a page, scheduling included.
   */
  router.post('/cms/api/articles/:id', guard(async (req, res, { params, user }) => {
    const { fields } = await parseForm(req);
    const id = Number(params.id);
    const when = fields.status === 'scheduled' ? parsePublishAt(fields.publish_at) : null;
    if (when?.error) return json(res, { error: when.error }, 400);
    const blocks = normalizeBlocks(fields.blocks || []).map(stripDisallowed);
    const data = { blocks };
    if (fields.title !== undefined) data.title = String(fields.title).trim() || 'Untitled';
    if (fields.lead !== undefined) {
      // An empty excerpt falls back to the opening of the first text, or a
      // card would have nothing to show under its heading - the first one a
      // reader can see, never words from a hidden slice.
      data.lead = String(fields.lead).trim() || stripTags(firstText(visibleBlocks(blocks)), 200);
    }
    /* The details fold rides this save too, so there is one save on the
       screen. Each is written only when the editor sent it, so nothing here
       can blank a field that was not on the page. */
    if (fields.parent_id !== undefined) data.parent_id = Number(fields.parent_id) || null;
    if (fields.image_id !== undefined) data.image_id = Number(fields.image_id) || null;
    if (fields.cta_label !== undefined) data.cta_label = String(fields.cta_label).trim();
    if (fields.cta_url !== undefined) data.cta_url = String(fields.cta_url).trim();
    if (fields.category_id !== undefined || fields.extra_categories !== undefined) {
      // Primary first, then whatever the checkboxes added. The model dedupes
      // and keeps the order, so "which one is primary" needs no column.
      data.category_ids = [Number(fields.category_id) || 0]
        .concat([].concat(fields.extra_categories ?? []).map(Number))
        .filter(Boolean);
    }
    /* The date, written only when the day in the field is not the day the
       article already shows. The field holds a day and every save sends it,
       so one that merely sends it back must not move an article that went out
       at 08:00 to midday - and the order of that day's feed with it. */
    let dateRefused = null;
    if (fields.published_on !== undefined) {
      const shown = draftView(articles.byId(id));
      if (shown && String(fields.published_on) !== localDay(shown.published_at)) {
        const on = parsePublishedOn(fields.published_on);
        if (on.error) dateRefused = on.error;
        // Emptying the field on a live article is not taking its date away.
        else if (!on.at && shown.status === 'published') dateRefused = 'A published article keeps a date.';
        else data.published_at = on.at;
      }
    }

    let article = articles.update(id, data);
    if (!article) return json(res, { error: 'That article does not exist' }, 404);
    if (fields.status === 'published') article = articles.publish(id);
    else if (fields.status === 'draft') article = articles.unpublish(id);
    else if (fields.status === 'scheduled') article = articles.schedule(id, when.at, user.id);
    else if (fields.status === 'unscheduled') article = articles.unschedule(id);

    // Which buttons belong here may have changed, and the server is what
    // decides - so it says, rather than the page being reloaded to find out.
    json(res, {
      ...editorState(article),
      /* Said, with the date it kept, rather than failing the save: the date
         rides every autosave, and one bad field must not stop the writing. */
      ...(dateRefused ? { dateRefused, publishedOn: localDay(draftView(article).published_at) } : {}),
    });
  }, 'editor'));

  /* Where an article stands - see the same route for pages. */
  router.get('/cms/api/articles/:id', guard((req, res, { params }) => {
    const article = articles.byId(Number(params.id));
    if (!article) return json(res, { error: 'That article does not exist' }, 404);
    json(res, editorState(article));
  }));

  router.post('/cms/api/articles/:id/discard', guard((req, res, { params }) => {
    const article = articles.discardDraft(Number(params.id));
    if (!article) return json(res, { error: 'That article does not exist' }, 404);
    json(res, { ...editorState(article), blocks: article.draftBlocks, settingsReset: article.settingsReset });
  }, 'editor'));

  /**
   * The draft, rendered through the site's own renderer behind the CMS guard.
   * A draft is not public, and the session that may write an article is the
   * session that may read it.
   */
  router.get('/cms/articles/:id/preview', guard((req, res, { params }) => {
    // The draft, whole - see the note on the page preview. Blocks alone were
    // swapped in, so the title and lead shown were the published ones.
    const article = draftView(articles.byId(Number(params.id)));
    if (!article) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('No such article');
    }
    const at = new URL(article.permalink, config.siteUrl);
    const ctx = buildContext(req, at);
    html(res, renderArticle({ ...article, blocks: article.draftBlocks, isPreview: true }, ctx));
  }));

  router.post('/cms/articles/:id/delete', guard(async (req, res, { params }) => {
    articles.remove(Number(params.id));
    redirect(res, '/cms/articles');
  }, 'editor'));
}

/**
 * Drop the objects an article has no use for.
 *
 * Breadcrumbs, a feed and a form are about a *page's* place in the site
 * rather than about anything you would write. The palette does not offer
 * them - but the palette is in the browser, and what the browser sends is
 * never what decides.
 */
function stripDisallowed(block) {
  return {
    ...block,
    columns: block.columns.map((col) => ({
      ...col,
      objects: col.objects.filter((obj) => allowedInArticle(obj.kind)),
    })),
  };
}
