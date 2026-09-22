import { html, redirect, parseForm, json } from '../../lib/http.js';
import { esc } from '../../lib/html.js';
import { icon } from '../../views/icons.js';
import { cmsLayout, cmsHead } from '../../views/cms/layout.js';
import { field, select, emptyState, rowActions, dateCell } from '../../views/cms/parts.js';
import { templates, media } from '../../models.js';
import { walkObjects, reIdBlocks } from '../../lib/objects.js';
import { publicMedia } from './media.js';
import { PAGE_TYPE_OPTIONS, PAGE_TYPE_HINT } from './pages.js';

/**
 * The page-template library.
 *
 * A template is a saved page: its type and its slices, content and all. It is
 * not a frame with a name on it - that was the old shape, and it meant two
 * templates could differ in nothing but their name and offer two identical
 * choices in the editor. The frame is a page's own property now.
 *
 * Nothing is seeded here. The library fills from real pages, saved from the
 * editor, exactly the way the slice library already works.
 */
export function registerTemplates(router, guard) {
  router.get('/cms/templates', guard((req, res, { user, url }) => {
    const list = templates.list();
    const editing = list.find((t) => String(t.id) === url.searchParams.get('edit'));

    const rows = list.map((t) => `<tr${editing?.id === t.id ? ' class="is-selected"' : ''}>
      <td><a class="cell-link" href="/cms/templates?edit=${t.id}">${esc(t.name)}</a>
        <div class="tiny muted">${esc(t.slug)}</div></td>
      <td class="col-narrow"><span class="pill">${
        esc(PAGE_TYPE_OPTIONS.find((p) => p.value === t.page_type)?.label || 'Standard')}</span></td>
      <td class="col-narrow"><span class="small muted">${t.blockCount} slice${
        t.blockCount === 1 ? '' : 's'}</span></td>
      <td class="col-narrow">${dateCell(t.created_at)}</td>
      <td class="actions">${rowActions({
        editHref: `/cms/templates?edit=${t.id}`,
        deleteAction: `data-delete-template="${t.id}" data-title="${esc(t.name)}"`,
        /* The thing this screen is *for*. Without it a template could only be
           used by knowing to go to Pages, press Create, and find a select -
           so the screen that lists your templates was the one place you could
           not use one. It hands off to that same create panel rather than
           making a page here: a page still needs a name and an address, and
           there should be one place that asks for them. */
        extra: `<a class="icon-btn" href="/cms/pages?edit=new&amp;template=${t.id}"
                   title="New page from this template" aria-label="New page from this template"
                   >${icon('plus', 17)}</a>`,
      })}</td>
    </tr>`).join('');

    const center = `
      ${cmsHead('Page templates')}
      <hr class="rule">
      ${list.length
        ? `<table class="table">
             <thead><tr><th>Name</th><th>Page type</th><th>Content</th><th>Saved</th><th></th></tr></thead>
             <tbody>${rows}</tbody></table>`
        : emptyState('No page templates yet.')}
      <p class="small muted" style="margin-top:var(--ui-s-5)">
        A template is a whole page kept for reuse — its type and every slice on it.
        Build the page you want, then use <span class="strong">Save page as template</span>
        in the editor. To use one, press <span class="strong">+</span> on its row: it opens
        a new page with the template already chosen, and its slices are copied in when
        you save.</p>
      <p class="small muted">
        For a one-off copy of a single page, use <span class="strong">Duplicate</span> in the
        Pages list instead — it lands as a draft and never touches the original.</p>`;

    const right = editing ? `
      <h2 class="h-tool" style="margin-bottom:var(--ui-s-5)">Properties</h2>
      <form class="stack" method="post" action="/cms/templates/${editing.id}">
        ${field({ label: 'Name', name: 'name', value: editing.name, required: true })}
        ${select({ label: 'Page type', name: 'page_type', value: editing.page_type,
          options: PAGE_TYPE_OPTIONS, hint: PAGE_TYPE_HINT[editing.page_type] })}
        <p class="tiny muted" style="margin:0">
          Holds ${editing.blockCount} slice${editing.blockCount === 1 ? '' : 's'}.
          The content is whatever the page looked like when it was saved — re-save
          from a page to update it.</p>
        <hr class="rule" style="margin:var(--ui-s-2) 0">
        <button class="btn" type="submit">Save</button>
      </form>
      <hr class="rule" style="margin:var(--ui-s-4) 0">
      <a class="btn btn--accent btn--full" href="/cms/pages?edit=new&amp;template=${editing.id}">
        ${icon('plus', 17)} New page from this</a>` : `
      <h2 class="h-tool" style="margin-bottom:var(--ui-s-4)">Properties</h2>
      <p class="muted small">Select a template to use it, rename it, or change the page
        type it sets.</p>`;

    html(res, cmsLayout({ title: 'Page templates', user, path: '/cms/templates', center, right,
      data: { page: 'templates' } }));
  }));

  /**
   * The library, for the editor's Apply dialogue.
   *
   * Mirrors /cms/api/slices: a list to choose from, then the one chosen with
   * its media, so the canvas can draw a template's images rather than empty
   * frames the moment it lands.
   */
  router.get('/cms/api/templates', guard((req, res) => {
    json(res, {
      items: templates.list().map((t) => ({
        id: t.id, name: t.name, page_type: t.page_type, blockCount: t.blockCount,
      })),
    });
  }));

  router.get('/cms/api/templates/:id', guard((req, res, { params }) => {
    const tpl = templates.byId(Number(params.id));
    if (!tpl) return json(res, { error: 'That template does not exist' }, 404);
    const ids = [];
    for (const obj of walkObjects(tpl.blocks)) {
      if (obj.props?.media) ids.push(obj.props.media);
    }
    json(res, {
      id: tpl.id,
      name: tpl.name,
      page_type: tpl.page_type,
      /* Re-idded here rather than in the browser. The page and the template
         must never share an id - editing one would be editing both - and
         `reIdBlocks` is the tested answer to that, already used by the create
         path. A second copy of it in the editor is a second thing to get
         wrong. */
      blocks: reIdBlocks(tpl.blocks),
      media: Object.fromEntries([...media.byIds(ids)].map(([mid, m]) => [mid, publicMedia(m)])),
    });
  }));

  router.post('/cms/templates/:id', guard(async (req, res, { params }) => {
    const { fields } = await parseForm(req);
    templates.update(Number(params.id), {
      name: String(fields.name || '').trim() || undefined,
      page_type: fields.page_type,
    });
    redirect(res, `/cms/templates?edit=${params.id}`);
  }, 'editor'));

  router.post('/cms/templates/:id/delete', guard((req, res, { params }) => {
    templates.remove(Number(params.id));
    redirect(res, '/cms/templates');
  }, 'editor'));
}
