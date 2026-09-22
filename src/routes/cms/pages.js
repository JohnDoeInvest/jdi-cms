import { html, redirect, parseForm, json, parseCookies } from '../../lib/http.js';
import { esc, escJson } from '../../lib/html.js';
import { icon } from '../../views/icons.js';
import { cmsLayout, cmsHead } from '../../views/cms/layout.js';
import {
  field, textarea, select, checkbox, emptyState, rowActions,
  statusPill, scheduleCell, dateCell, sortHeader, listSort, sortCookie,
  mediaPicker, richToolbar, linkOptions, editorActions, editorState, addressState,
} from '../../views/cms/parts.js';
import { pages, templates, menus, media, slices, categories, forms, draftView, PAGE_TYPES } from '../../models.js';
import { normalizeBlocks, walkObjects, reIdBlocks, OBJECT_ORDER } from '../../lib/objects.js';
import { editorPanel } from '../../views/cms/editor.js';
import { publicMedia } from './media.js';
import { theme } from '../../lib/theme.js';
import { embedProviderList } from '../../lib/embed.js';
import { buildContext, renderPage } from '../site.js';
import { formFields } from '../../views/render.js';
import { parsePublishAt } from '../../lib/util.js';
import { config } from '../../config.js';

/**
 * Page type: the frame a page draws in.
 *
 * Three fixed frames, on the page itself. This used to be reached through a
 * named template row, which meant two templates could differ in nothing but
 * their name and offer two identical choices here.
 */
export const PAGE_TYPE_OPTIONS = [
  { value: 'default', label: 'Standard' },
  { value: 'landing', label: 'Landing' },
  { value: 'blank', label: 'Blank' },
];

export const PAGE_TYPE_HINT = {
  default: 'Page title, breadcrumbs and the body column\u2019s width.',
  landing: 'No page title. Still capped to the body column.',
  blank: 'No title and no cap. Slices run edge to edge and set their own width.',
};

/**
 * The trail for a page, as the site builds it. Mirrors `trailFor` in
 * routes/site.js, which works from published pages only - here it has to work
 * on a draft, since that is exactly when someone is editing it.
 */
function trailForPage(page) {
  if (!page || page.permalink === '/') return [];
  const segments = page.permalink.split('/').filter(Boolean);
  const trail = [];
  let acc = '';
  for (const segment of segments) {
    acc += '/' + segment;
    const match = pages.anyByPermalink(acc);
    trail.push({ label: match?.title || segment, href: acc });
  }
  return trail;
}

/**
 * The page's own settings, shared by the create screen and the editor's fold.
 *
 * `live` marks the editor, where these ride the same autosave as everything
 * else: a `data-page-field` on a control is all it takes, which is how the
 * page type and the password already work. The fold used to be a form of its
 * own with a Save meta button beside Publish - so publishing a page did not
 * save the description you had just written into it, and saving the
 * description navigated away from the editor. Two saves for one page is one
 * too many.
 *
 * The page type is left out in the editor: it has its own control below the
 * fold, and rendering it twice meant two answers to one question.
 */
function metaFields(page, templateList, ogImage,
  { creating = false, live = false, template = '', parentList = [] } = {}) {
  const pageType = page?.page_type ?? 'default';
  const rides = (name) => (live ? `data-page-field="${name}"` : '');
  /* The landing page is the root rather than a page sitting at it, and a
     published address is a promise to whatever links to it - neither has an
     address to compose. */
  const isRoot = page?.permalink === '/';
  const address = addressState(page);
  const frozen = address !== 'free';
  /* Frozen is a state, not a wall. Saying only that the address is fixed
     leaves somebody who genuinely needs to move a page with nowhere to go -
     so it names the way out. Unpublishing first is the honest version of
     moving a live page: the old address stops working, and you have said so
     by taking the page down. A scheduled page is freed by calling the
     schedule off. */
  const FROZEN_HINT = (at) =>
    `Fixed at publish so links keep working: ${at}. Unpublish the page to move it.`;
  const SCHEDULED_HINT = (at) =>
    `Fixed once scheduled, so links made in advance keep working: ${at}. Remove the schedule to move the page.`;
  const FREE_HINT = 'The page this one sits under, which decides the start of its address.';
  const parentHint = { live: FROZEN_HINT, scheduled: SCHEDULED_HINT }[address]?.(page.permalink) ?? FREE_HINT;
  /* The hook the editor toggles when the page changes state, carrying every
     wording so one function can serve pages and articles alike. */
  const addressHook = `data-address-field data-hint-free="${esc(FREE_HINT)}"`
    + ` data-hint-live="${esc(FROZEN_HINT('{address}'))}"`
    + ` data-hint-scheduled="${esc(SCHEDULED_HINT('{address}'))}"`;
  return `
    ${live ? '' : select({ label: 'Page type', name: 'page_type', value: pageType,
      options: PAGE_TYPE_OPTIONS, hint: PAGE_TYPE_HINT[pageType] })}
    ${creating && templateList.length ? `
      ${select({ label: 'Start from a template', name: 'template_id', value: template,
        options: templateList.map((t) => ({
          value: t.id,
          label: `${t.name} (${t.blockCount} slice${t.blockCount === 1 ? '' : 's'})`,
        })),
        placeholder: 'Empty page',
        hint: 'Copies the template\u2019s slices and sets the page type to match.' })}` : ''}
    ${field({ label: 'Title', name: 'title', value: page?.title ?? '', required: true,
      placeholder: 'Page title', extra: rides('title') })}
    <h3 class="h-section" style="margin-top:var(--ui-s-3)">Meta</h3>
    ${field({ label: 'Meta title', name: 'meta_title', value: page?.meta_title ?? '',
      hint: 'Shown in the browser tab and in search results.', extra: rides('meta_title') })}
    ${textarea({ label: 'Description', name: 'meta_description', value: page?.meta_description ?? '',
      rows: 4, hint: 'Shown in search results and link previews. It does not appear on the page.',
      extra: rides('meta_description') })}
    ${isRoot ? `<div class="field"><span class="label">Address</span>
        <p class="tiny muted" style="margin:0">The landing page is the site root, so it has
        neither a parent nor a slug.</p></div>`
      : `${select({ label: 'Appears under', name: 'parent_id', value: page?.parent_id ?? '',
          options: parentList.map((p) => ({ value: p.id, label: `${p.title} — ${p.permalink}` })),
          placeholder: 'Site root', disabled: frozen, hint: parentHint,
          extra: `${rides('parent_id')} ${addressHook}` })}
        ${field({ label: 'Slug', name: 'slug', value: page?.slug ?? '',
          placeholder: 'my-page', disabled: frozen,
          hint: frozen ? '' : 'One segment of the address, no slashes. From the title if left empty.',
          extra: `${rides('slug')} data-address-field` })}
        ${page ? `<p class="tiny muted" data-page-address
          style="margin:calc(-1 * var(--ui-s-2)) 0 0">${esc(page.permalink)}</p>` : ''}`}
    ${mediaPicker({ name: 'og_image_id', item: ogImage, label: 'Share image',
      buttonLabel: 'Choose image', extra: rides('og_image_id') })}
    ${checkbox({
      label: 'Use the first image on the page', name: 'use_first_image',
      checked: page ? !!page.use_first_image : true,
      hint: 'The first image on the page is used when no share image is chosen.',
      extra: rides('use_first_image'),
    })}`;
}

export function registerPages(router, guard) {
  /* ------------------------------------------------------- Frame 4.11 */
  router.get('/cms/pages', guard((req, res, { user, url }) => {
    const search = url.searchParams.get('q') || '';
    /* Asked for in the URL, remembered between visits - a list reached from
       the nav rail carries no query string and used to start over every
       time. */
    const { sort, dir, remember } = listSort(url, parseCookies(req.headers.cookie), 'pages');
    const list = pages.list({ search, sort, dir });
    /* The sort links carry the search with them, so narrowing a list and then
       ordering it does not silently throw the narrowing away. */
    const sortAt = `/cms/pages${search ? `?q=${encodeURIComponent(search)}` : ''}`;
    const templateList = templates.list();
    const editing = draftView(pages.byId(Number(url.searchParams.get('edit'))));
    const ogImage = editing?.og_image_id ? media.byId(editing.og_image_id) : null;

    const rows = list.map(draftView).map((p) => `<tr${editing?.id === p.id ? ' class="is-selected"' : ''}>
      <td><a class="cell-link truncate" href="/cms/pages/${p.id}/edit">${esc(p.title || 'Untitled')}</a>
        <div class="tiny muted">${esc(p.permalink)}</div></td>
      <td class="col-narrow"><span class="pill">${
        esc(PAGE_TYPE_OPTIONS.find((t) => t.value === p.page_type)?.label || 'Standard')}</span></td>
      <td class="col-narrow">${dateCell(p.updated_at)}</td>
      <td class="col-narrow">${statusPill(p.status, p.hasDraftChanges, p.schedule)}${scheduleCell(p.schedule)}</td>
      <td class="col-narrow"><span class="small muted">${esc(p.author_name || '–')}</span></td>
      <td class="actions">${rowActions({
        editHref: `/cms/pages/${p.id}/edit`,
        deleteAction: `data-delete-page="${p.id}" data-title="${esc(p.title || 'Untitled')}"`,
        extra: `<a class="icon-btn" href="${esc(p.permalink)}" target="_blank" rel="noopener" title="View page">${icon('eye', 17)}</a>
                <a class="icon-btn" href="/cms/pages?edit=${p.id}" title="Metadata">${icon('settings', 17)}</a>
                <button class="icon-btn" type="button" data-duplicate-page="${p.id}"
                        data-title="${esc(p.title || 'Untitled')}" title="Duplicate page">${icon('copy', 17)}</button>`,
      })}</td>
    </tr>`).join('');

    const center = `
      ${cmsHead('Pages', `
        <div class="field" style="max-width:220px">
          <input type="search" name="q" value="${esc(search)}" placeholder="Search pages"
                 data-list-search autocomplete="off">
        </div>
        <a class="btn btn--primary" href="/cms/pages?edit=new">${icon('plus', 17)} Create</a>`)}
      <hr class="rule">
      ${list.length ? `<table class="table">
        <thead><tr>
          ${sortHeader({ label: 'Title', key: 'title', sort, dir, href: sortAt })}
          <th>Type</th>
          ${sortHeader({ label: 'Edited', key: 'date', sort, dir, href: sortAt,
            natural: 'desc', extraClass: 'col-narrow' })}
          <th>Status</th><th>Author</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table>` : emptyState(search ? 'No matches.' : 'No pages yet.')}`;

    const creating = url.searchParams.get('edit') === 'new';
    /* Arrived from the Templates screen with one already picked, so the panel
       opens on it rather than on "Empty page" - the choice was made on the
       screen you came from and asking again would look like it had not
       registered. */
    const fromTemplate = templateList.some((t) => String(t.id) === url.searchParams.get('template'))
      ? url.searchParams.get('template') : '';
    const right = (creating || editing) ? `
      <form class="stack" method="post" action="${editing ? `/cms/pages/${editing.id}/meta` : '/cms/pages'}">
        <h2 class="h-tool">${creating ? 'Create new' : 'Page metadata'}</h2>
        ${metaFields(editing, templateList, ogImage, { creating, template: fromTemplate,
          parentList: pages.parentOptions(editing?.id ?? null) })}
        <hr class="rule" style="margin:var(--ui-s-2) 0">
        <div class="row" style="justify-content:space-between">
          <button class="btn btn--primary" type="submit">${creating ? 'Create' : 'Save'}</button>
          <a class="btn btn--danger" href="/cms/pages">${creating ? 'Cancel' : 'Close'}</a>
        </div>
      </form>` : `
      <h2 class="h-tool" style="margin-bottom:var(--ui-s-4)">Properties</h2>
      <p class="muted small">Select a page to edit its metadata, or
        <a class="linkish" href="/cms/pages?edit=new">create a new page</a>.</p>`;

    html(res, cmsLayout({ title: 'Pages', user, path: '/cms/pages', center, right,
      data: { page: 'pages' } }), 200,
    remember ? { 'Set-Cookie': sortCookie('pages', remember) } : {});
  }));

  const metaPayload = (fields) => ({
    title: String(fields.title || '').trim() || 'Untitled page',
    page_type: PAGE_TYPES.includes(fields.page_type) ? fields.page_type : 'default',
    meta_title: String(fields.meta_title || '').trim(),
    meta_description: String(fields.meta_description || '').trim(),
    parent_id: Number(fields.parent_id) || null,
    slug: String(fields.slug || '').trim(),
    og_image_id: Number(fields.og_image_id) || null,
    use_first_image: !!fields.use_first_image,
  });

  router.post('/cms/pages', guard(async (req, res, { user }) => {
    const { fields } = await parseForm(req);
    const data = metaPayload(fields);
    // Starting from a template plants a copy of its slices and takes its type,
    // which the author can then change: a template seeds a page, it does not
    // own one. Ids are minted fresh so the copy and the template never collide.
    const from = Number(fields.template_id) ? templates.byId(Number(fields.template_id)) : null;
    const page = pages.create({
      ...data,
      page_type: from ? from.page_type : data.page_type,
      blocks: from ? reIdBlocks(from.blocks) : [],
    }, user.id);
    redirect(res, `/cms/pages/${page.id}/edit`);
  }, 'editor'));

  /* A one-off copy, always a draft, so nothing goes live by duplicating. */
  router.post('/cms/pages/:id/duplicate', guard((req, res, { params, user }) => {
    const copy = pages.duplicate(Number(params.id), user.id);
    if (!copy) return json(res, { error: 'That page does not exist' }, 404);
    json(res, { ok: true, id: copy.id, title: copy.title, permalink: copy.permalink });
  }, 'editor'));

  /* Save the page being edited as a template - the slice library, one level up. */
  router.post('/cms/api/templates', guard(async (req, res) => {
    const { fields } = await parseForm(req);
    const name = String(fields.name || '').trim();
    if (!name) return json(res, { error: 'A template needs a name' }, 400);
    const tpl = templates.create(name, {
      pageType: fields.page_type,
      blocks: normalizeBlocks(fields.blocks || []),
    });
    json(res, { ok: true, id: tpl.id, name: tpl.name });
  }, 'editor'));

  router.post('/cms/pages/:id/meta', guard(async (req, res, { params }) => {
    const { fields } = await parseForm(req);
    pages.update(Number(params.id), metaPayload(fields));
    redirect(res, `/cms/pages?edit=${params.id}`);
  }, 'editor'));

  /* ------------------------------------------------------- Frame 4.12 */
  router.get('/cms/pages/:id/edit', guard((req, res, { user, params }) => {
    /* What the editor shows is what you are editing: the live row with
       anything waiting for Publish laid over it. The site reads the row
       itself, which is what keeps a half-typed title off the public page. */
    const page = draftView(pages.byId(Number(params.id)));
    if (!page) return redirect(res, '/cms/pages');

    const templateList = templates.list();
    const menuList = menus.list();
    const sliceList = slices.list().map((s) => ({
      id: s.id, name: s.name, usage: slices.usage(s.id).length,
    }));
    const ogImage = page.og_image_id ? media.byId(page.og_image_id) : null;

    // Ship every referenced media item with the page so the canvas can draw previews.
    const mediaIds = [];
    // The draft is what the canvas draws, so its media is what it needs.
    for (const obj of walkObjects(page.draftBlocks)) if (obj.props?.media) mediaIds.push(obj.props.media);
    const mediaMap = Object.fromEntries([...media.byIds(mediaIds)].map(([id, m]) => [id, publicMedia(m)]));

    const center = `
      <nav class="row tiny muted" style="margin-bottom:var(--ui-s-2)">
        <a href="/cms/pages" class="linkish">Pages</a><span>/</span><span>${esc(page.title)}</span>
      </nav>
      <div class="cms-head">
        <h1 class="h-page grow">Edit page</h1>
        <span class="pill pill--saved" data-save-state></span>
        <span data-status-pill>${statusPill(page.status, page.hasDraftChanges, page.schedule)}</span>
        <!-- A named target, so clicking View again reuses the one preview tab
             instead of opening another. No rel="noopener": the preview is our
             own page, and it needs window.opener to hand focus back rather
             than leaving a second editor tab behind every time. -->
        <a class="btn btn--sm" href="/cms/preview/${page.id}" target="cms-preview"
           title="Opens the draft, including changes that are not live">${icon('eye', 16)} View</a>
      </div>

      <details class="panel" style="padding:0;margin-bottom:var(--ui-s-5)" data-meta-editor>
        <summary class="row" style="padding:var(--ui-s-3) var(--ui-s-4);cursor:pointer;list-style:none">
          ${icon('chevronRight', 16)}<span class="strong">Meta</span>
          <span class="tiny muted grow truncate">${esc(page.permalink)}</span>
        </summary>
        <div class="stack" style="padding:0 var(--ui-s-4) var(--ui-s-4)">
          ${metaFields(page, templateList, ogImage, { live: true,
            parentList: pages.parentOptions(page.id) })}
        </div>
      </details>

      <div class="field-row" style="margin-bottom:var(--ui-s-2)">
        <div class="field">
          <label for="ptype">Page type</label>
          <select id="ptype" data-page-field="page_type">
            ${PAGE_TYPE_OPTIONS.map((t) => `<option value="${t.value}"${
              t.value === (page.page_type || 'default') ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}
          </select>
          <span class="field__hint">${esc(PAGE_TYPE_HINT[page.page_type] || PAGE_TYPE_HINT.default)}</span>
        </div>
        <div class="field">
          <label for="submenu">Sub menu</label>
          <select id="submenu" data-page-field="submenu_id">
            <option value="">No sub menu</option>
            ${menuList.map((m) => `<option value="${m.id}"${m.id === page.submenu_id ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="row" style="margin-bottom:var(--ui-s-5);gap:var(--ui-s-5)">
        <button class="linkish" type="button" data-apply-template>Apply a template</button>
        <button class="linkish" type="button" data-save-as-template>Save page as template</button>
        <a class="linkish" href="/cms/templates">Page templates</a>
        <a class="linkish" href="/cms/menus">Menu editor</a>
        <button class="linkish linkish--danger" type="button" data-wipe-page>Clear all slices</button>
      </div>

      ${richToolbar({ contextual: true })}
      <div class="canvas" data-canvas>
        <div class="canvas__hint" data-canvas-hint>
          Drag slices or objects here from the library on the right.
        </div>
      </div>
      <button class="btn btn--full" type="button" data-add-block style="margin-top:var(--ui-s-3)">
        ${icon('plus', 17)} Add a block or saved slice</button>

      <!-- The page password: a property of the page, not of anything on the
           canvas, and reached rarely enough that it belongs at the foot of
           the editor rather than among the settings opened on every visit.
           Saved by the same autosave as everything else here. -->
      <hr class="rule">
      <div class="row page-lock">
        <label class="check" for="page-lock">
          <input type="checkbox" id="page-lock" data-page-field="password_on"
                 ${page.password ? 'checked' : ''}>
          <span>Password-protect this page</span>
        </label>
        <input class="page-lock__input" type="text" data-page-field="password"
               value="${esc(page.password)}" placeholder="Password" aria-label="Page password"
               autocomplete="off" spellcheck="false"${page.password ? '' : ' hidden'}>
        <span class="tiny muted grow page-lock__hint"${page.password ? '' : ' hidden'}>
          Visitors are asked for this before the page is shown.</span>
      </div>
      <hr class="rule">`;

    /* Sits below the scroll area, so it never covers what you are editing.
       Discard appears only on a published page: it goes back to what is live,
       and a page that has never been published has nothing to go back to. */
    const footer = editorActions(page);

    const right = editorPanel({ slices: sliceList });

    html(res, cmsLayout({
      title: `Edit ${page.title}`, user, path: '/cms/pages',
      center, right, footer,
      scripts: ['/assets/cms-editor.js'],
      data: {
        page: 'page-editor',
        mode: 'page',
        pageId: page.id,
        permalink: page.permalink,
        status: page.status,
        savedAt: page.updated_at,
        hasDraftChanges: page.hasDraftChanges,
        // So an editor left open when the minute comes can go and look.
        scheduledAt: page.schedule?.at ?? null,
        blocks: page.draftBlocks,
        media: mediaMap,
        slices: sliceList,
        categories: categories.list().map((c) => ({ id: c.id, name: c.name })),
        // The palette, so the panel can offer colours by name and the canvas
        // can draw them. Ids only in the content; the values are for preview.
        colors: theme().colors,
        // The forms a Form block may point at, by name and size.
        forms: forms.list().map((f) => ({
          id: f.id, name: f.name, fields: formFields(f).length,
        })),
        // The page's frame, so the canvas shows a band reaching the edge only
        // when it actually will.
        frame: page.page_type || 'default',
        // This page's own trail, so a breadcrumbs object on the canvas draws
        // what the page will draw rather than a stand-in.
        trail: trailForPage(page),
        // Which links the renderer can frame, so the panel names them and the
        // canvas can label a card without a second copy of the list.
        embedProviders: embedProviderList(),
        // Which objects this document may carry. The right-hand palette is
        // rendered from the same list server-side, so the "Add a block"
        // dialogue cannot offer something the palette refuses.
        objectKinds: OBJECT_ORDER,
        // Every page, and the sections of each that are link targets — so a
        // button or a text link is chosen from the same list a menu item is,
        // rather than typed from memory.
        linkOptions: linkOptions(pages.list()),
        saveUrl: `/cms/api/pages/${page.id}`,
      },
    }));
  }));

  /**
   * Canvas save.
   *
   * Blocks always land in the draft, never in what is live - which is what
   * lets the editor write on every change without publishing anything. A
   * `status` alongside them asks for the extra step: 'published' moves the
   * draft across, 'draft' takes the page down, 'scheduled' keeps a copy to
   * move across at `publish_at`, and 'unscheduled' calls that off. Omit it
   * and the save is silent, which is the autosave case.
   */
  router.post('/cms/api/pages/:id', guard(async (req, res, { params, user }) => {
    const { fields } = await parseForm(req);
    const id = Number(params.id);
    // Checked before anything is written, so a refused time saves nothing.
    const when = fields.status === 'scheduled' ? parsePublishAt(fields.publish_at) : null;
    if (when?.error) return json(res, { error: when.error }, 400);
    const data = { blocks: normalizeBlocks(fields.blocks || []) };
    if (fields.page_type !== undefined) data.page_type = fields.page_type;
    if (fields.submenu_id !== undefined) data.submenu_id = Number(fields.submenu_id) || null;
    /* Meta rides the same save as the blocks, so Publish publishes what is on
       the screen rather than what a second button was remembered for. Each is
       written only when the editor sent it, so nothing here can blank a field
       that was never on the page. */
    if (fields.title !== undefined) data.title = String(fields.title).trim() || 'Untitled page';
    if (fields.meta_title !== undefined) data.meta_title = String(fields.meta_title).trim();
    if (fields.meta_description !== undefined) data.meta_description = String(fields.meta_description).trim();
    /* The address, as its two parts. `permalink` used to be forwarded here and
       is not a field any more - `update` stopped reading it when a page got a
       parent, so this quietly threw away every Appears under set in the
       editor and left the breadcrumb looking like the broken thing. */
    if (fields.parent_id !== undefined) data.parent_id = Number(fields.parent_id) || null;
    if (fields.slug !== undefined) data.slug = String(fields.slug).trim();
    if (fields.og_image_id !== undefined) data.og_image_id = Number(fields.og_image_id) || null;
    if (fields.use_first_image !== undefined) data.use_first_image = !!fields.use_first_image;
    /* The switch is what decides, so turning it off clears the password
       rather than leaving one stored that nothing asks for. An empty password
       is no password: there would be nothing for the gate to check. */
    if (fields.password !== undefined) {
      data.password = fields.password_on ? String(fields.password).trim() : '';
    }

    let page = pages.update(id, data);
    if (!page) return json(res, { error: 'That page does not exist' }, 404);
    if (fields.status === 'published') page = pages.publish(id);
    else if (fields.status === 'draft') page = pages.unpublish(id);
    else if (fields.status === 'scheduled') page = pages.schedule(id, when.at, user.id);
    else if (fields.status === 'unscheduled') page = pages.unschedule(id);

    // Which buttons belong here may have changed, and the server is what
    // decides - so it says, rather than the page being reloaded to find out.
    json(res, editorState(page));
  }, 'editor'));

  /* Where a page stands, for an editor left open while its schedule came
     due. Reading it changes nothing - the clock has already done the work. */
  router.get('/cms/api/pages/:id', guard((req, res, { params }) => {
    const page = pages.byId(Number(params.id));
    if (!page) return json(res, { error: 'That page does not exist' }, 404);
    json(res, editorState(page));
  }));

  /**
   * The draft, rendered exactly as the site would render it.
   *
   * Behind the CMS guard rather than behind a token: a draft is not public,
   * and the session that may edit the page is the session that may see it.
   * The rail's "View site" still opens the live page - one link for what
   * visitors get, one for what you are about to give them.
   */
  router.get('/cms/preview/:id', guard((req, res, { params }) => {
    /* The draft, whole. Blocks alone used to be swapped in and the rest read
       from the live row - so once metadata started waiting for Publish, a
       preview showed the published page type, title and meta while claiming
       to show what you were about to publish. A preview that disagrees with
       what Publish will do is worse than no preview. */
    const page = draftView(pages.byId(Number(params.id)));
    if (!page) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('No such page');
    }
    const at = new URL(page.permalink, config.siteUrl);
    const ctx = buildContext(req, at);
    html(res, renderPage({ ...page, blocks: page.draftBlocks, isPreview: true }, ctx));
  }));

  /* Throw the draft away and go back to what is live - or to what is
     scheduled. When settings came back as well as blocks, the editor has to
     reload to show them; `settingsReset` is how it knows. */
  router.post('/cms/api/pages/:id/discard', guard((req, res, { params }) => {
    const page = pages.discardDraft(Number(params.id));
    if (!page) return json(res, { error: 'That page does not exist' }, 404);
    json(res, { ...editorState(page), blocks: page.draftBlocks, settingsReset: page.settingsReset });
  }, 'editor'));

  router.get('/cms/api/pages/:id/usage', guard((req, res, { params }) => {
    const id = Number(params.id);
    const page = pages.byId(id);
    if (!page) return json(res, { error: 'That page does not exist' }, 404);
    json(res, {
      page: { id: page.id, title: page.title, status: page.status, permalink: page.permalink },
      menus: pages.menuUsage(id).map((m) => ({ id: m.id, name: m.name })),
      alternatives: pages.list().filter((p) => p.id !== id).map((p) => ({ id: p.id, name: p.title })),
      /* What sits under this page, and where it could go instead. Deleting a
         parent without saying leaves children pointing through a page that is
         not there, which is the thing the parent field exists to prevent. */
      children: pages.children(id).map((c) => ({ id: c.id, name: c.title, permalink: c.permalink })),
      parents: pages.parentOptions(id).map((p) => ({ id: p.id, name: `${p.title} — ${p.permalink}` })),
    });
  }));

  router.post('/cms/pages/:id/delete', guard(async (req, res, { params }) => {
    const { fields } = await parseForm(req);
    // Where the children go. Empty means the site root, which is the default
    // the dialogue offers and an honest place for a page to land.
    pages.remove(Number(params.id), { reparentTo: Number(fields.reparent_to) || null });
    redirect(res, '/cms/pages');
  }, 'editor'));
}
