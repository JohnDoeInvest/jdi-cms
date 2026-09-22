import { html, redirect, parseForm, json } from '../../lib/http.js';
import { esc } from '../../lib/html.js';
import { cmsLayout, cmsHead } from '../../views/cms/layout.js';
import { field, select, checkbox, emptyState, rowActions, usedPill, dateCell } from '../../views/cms/parts.js';
import { categories, articles } from '../../models.js';

/** Frame 4.9 - Categories, with the right-hand Properties pane. */
export function registerCategories(router, guard) {
  router.get('/cms/categories', guard((req, res, { user, url }) => {
    const list = categories.list();
    const editing = list.find((c) => String(c.id) === url.searchParams.get('edit'));

    const rows = list.map((c) => `<tr${editing?.id === c.id ? ' class="is-selected"' : ''}>
      <td><a class="cell-link" href="/cms/categories?edit=${c.id}">${esc(c.name)}</a>
          <div class="tiny muted">/${esc(c.slug)}</div></td>
      <td class="col-narrow">${dateCell(c.created_at)}</td>
      <td class="col-narrow">${usedPill(c.article_count > 0, 'In use', 'Unused')}</td>
      <td class="col-narrow"><span class="small muted">${esc(c.author_name || '–')}</span></td>
      <td class="col-narrow"><span class="small muted">${c.article_count}</span></td>
      <td class="actions">${rowActions({
        editHref: `/cms/categories?edit=${c.id}`,
        deleteAction: `data-delete-category="${c.id}"`,
      })}</td>
    </tr>`).join('');

    const center = `
      ${cmsHead('Categories', `
        <form class="row" method="post" action="/cms/categories">
          <div class="field"><input type="text" name="name" placeholder="Category name" required></div>
          <button class="btn btn--primary" type="submit">Create</button>
        </form>`)}
      <hr class="rule">
      ${list.length ? `<table class="table">
        <thead><tr><th>Name</th><th>Created</th><th>Status</th><th>Author</th><th>Articles</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table>` : emptyState('No categories yet.')}`;

    const right = editing ? `
      <h2 class="h-tool" style="margin-bottom:var(--ui-s-5)">Properties</h2>
      <form class="stack" method="post" action="/cms/categories/${editing.id}">
        ${field({ label: 'Name', name: 'name', value: editing.name, required: true })}
        <div class="spread">
          <span class="label">Status</span>
          ${usedPill(editing.article_count > 0, 'In use', 'Unused')}
        </div>
        <div class="spread"><span class="label">Articles</span><span class="small muted">${editing.article_count}</span></div>
        <hr class="rule" style="margin:var(--ui-s-2) 0">
        <div class="row" style="justify-content:space-between">
          <button class="btn btn--primary" type="submit">Save</button>
          <button class="btn btn--danger" type="button" data-delete-category="${editing.id}">Delete</button>
        </div>
      </form>` : `
      <h2 class="h-tool" style="margin-bottom:var(--ui-s-4)">Properties</h2>
      <p class="muted small">Select a category from the list to edit it.</p>`;

    html(res, cmsLayout({ title: 'Categories', user, path: '/cms/categories', center, right,
      data: { page: 'categories' } }));
  }));

  router.post('/cms/categories', guard(async (req, res, { user }) => {
    const { fields } = await parseForm(req);
    const name = String(fields.name || '').trim();
    if (name) categories.create(name, user.id);
    redirect(res, '/cms/categories');
  }, 'editor'));

  router.post('/cms/categories/:id', guard(async (req, res, { params }) => {
    const { fields } = await parseForm(req);
    const name = String(fields.name || '').trim();
    if (name) categories.update(Number(params.id), name);
    redirect(res, `/cms/categories?edit=${params.id}`);
  }, 'editor'));

  /* Frame 5.4 - the delete dialogue needs to know how many articles are affected. */
  router.get('/cms/api/categories/:id/usage', guard((req, res, { params }) => {
    const id = Number(params.id);
    const category = categories.byId(id);
    if (!category) return json(res, { error: 'That category does not exist' }, 404);
    json(res, {
      category: { id: category.id, name: category.name },
      count: articles.list({ categoryIds: [id] }).length,
      alternatives: categories.list().filter((c) => c.id !== id).map((c) => ({ id: c.id, name: c.name })),
    });
  }));

  router.post('/cms/categories/:id/delete', guard(async (req, res, { params }) => {
    const { fields } = await parseForm(req);
    const replacement = fields.replace_with && fields.apply_replace ? Number(fields.replace_with) : null;
    categories.remove(Number(params.id), replacement);
    redirect(res, '/cms/categories');
  }, 'editor'));
}
