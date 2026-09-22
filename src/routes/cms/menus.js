import { html, redirect, parseForm, json } from '../../lib/http.js';
import { esc } from '../../lib/html.js';
import { icon } from '../../views/icons.js';
import { cmsLayout, cmsHead } from '../../views/cms/layout.js';
import { emptyState, linkOptions } from '../../views/cms/parts.js';
import { menus, pages } from '../../models.js';

/** Flatten the stored tree into the flat rows the editor drags around. */
function flatten(tree, depth = 0, out = []) {
  for (const node of tree || []) {
    out.push({ label: node.label, href: node.href, pageId: node.pageId, anchor: node.anchor, depth });
    flatten(node.children, depth + 1, out);
  }
  return out;
}

/** Rebuild a tree from flat rows, honouring each row's depth. */
export function unflatten(rows) {
  const root = [];
  const stack = [{ depth: -1, children: root }];
  for (const row of rows || []) {
    const depth = Math.max(0, Math.min(2, Number(row.depth) || 0));
    const node = {
      label: String(row.label || ''), href: String(row.href || ''),
      pageId: row.pageId ?? null, anchor: row.anchor ?? '', children: [],
    };
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push({ depth, children: node.children });
  }
  return root;
}

function menuSection(menu, pageOptions) {
  const rows = flatten(menu.draftTree);
  const all = linkOptions(pageOptions);
  // Selection is marked on the option that matches, not rebuilt per row.
  const options = (selected) =>
    all.replace(`<option value="${esc(selected)}">`, `<option value="${esc(selected)}" selected>`);

  const items = rows.map((row, index) => `
    <div class="menu-item" data-menu-item data-depth="${row.depth}" data-index="${index}" draggable="true">
      <span class="menu-item__handle" data-handle title="Drag to move. Drag sideways to nest.">
        ${icon('drag', 16)}</span>
      <input type="text" class="grow" data-label value="${esc(row.label)}" placeholder="Menu label">
      <div class="menu-item__target">
        <select data-target>
          <option value="">Custom link…</option>
          ${options(row.href)}
        </select>
      </div>
      <input type="text" class="menu-item__custom" data-href value="${esc(row.href)}"
             placeholder="/path"${pageOptions.some((p) => p.permalink === row.href) ? ' hidden' : ''}
             style="flex:0 0 150px">
      <button class="icon-btn icon-btn--danger" type="button" data-remove title="Delete">${icon('trash', 16)}</button>
    </div>`).join('');

  return `<section class="menu-card" data-menu="${menu.id}">
    <div class="row" style="gap:var(--ui-s-4);flex-wrap:wrap">
      <div class="field grow" style="min-width:180px">
        <input type="text" data-menu-name value="${esc(menu.name)}" placeholder="Menu name">
      </div>
      <label class="radio">
        <input type="radio" name="main-menu" data-main${menu.is_main ? ' checked' : ''}>
        <span>Main menu</span>
      </label>
      <span class="pill${menu.dirty ? ' pill--draft' : ' pill--live'}" data-dirty-pill>
        ${menu.dirty ? 'Unpublished' : 'Publishd'}</span>
    </div>
    <hr class="rule" style="margin:var(--ui-s-3) 0">
    <div class="menu-items" data-menu-items>${items}</div>
    ${rows.length ? '' : '<p class="tiny muted" style="text-align:center;padding:var(--ui-s-4) 0">Drag a page here from the list on the right, or add a row below.</p>'}
    <hr class="rule" style="margin:var(--ui-s-3) 0">
    <div class="row">
      <div class="field grow"><input type="text" data-new-item placeholder="New menu item"></div>
      <button class="btn" type="button" data-add-item>Add</button>
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:var(--ui-s-4)">
      <span class="small muted grow" data-save-state></span>
      <button class="btn" type="button" data-duplicate>Duplicate</button>
      <button class="btn btn--accent" type="button" data-publish${menu.dirty ? '' : ' disabled'}>Publish</button>
      <button class="btn btn--danger" type="button" data-delete-menu="${menu.id}"
              data-name="${esc(menu.name)}" data-live="${menu.published ? '1' : ''}">Delete</button>
    </div>
  </section>`;
}

/** Frames 4.7 + 5.3 - menu setup with the draggable page list on the right. */
export function registerMenus(router, guard) {
  router.get('/cms/menus', guard((req, res, { user }) => {
    const list = menus.allHydrated();
    const pageList = pages.list();

    const center = `
      ${cmsHead('Menus', `
        <form class="row" method="post" action="/cms/menus">
          <div class="field"><input type="text" name="name" placeholder="Menu name" required></div>
          <button class="btn btn--primary" type="submit">Create menu</button>
        </form>`)}
      <hr class="rule">
      <div class="stack" style="gap:var(--ui-s-6)">
        ${list.length ? list.map((m) => menuSection(m, pageList)).join('') : emptyState('No menus yet.')}
      </div>`;

    const right = `
      <div class="spread" style="margin-bottom:var(--ui-s-2)">
        <h2 class="h-tool">Pages</h2>
        <a class="linkish" href="/cms/pages">Edit pages</a>
      </div>
      <p class="small muted" style="margin:0 0 var(--ui-s-4)">Drag a page onto a menu to add it.</p>
      <div class="stack-sm">
        ${pageList.map((p) => `<div class="page-drag" draggable="true"
            data-page="${p.id}" data-label="${esc(p.title)}" data-href="${esc(p.permalink)}"
            data-anchors="${esc(JSON.stringify(pages.anchors(p)))}">
          ${icon('drag', 15)}
          <span class="grow truncate">${esc(p.title)}</span>
          <span class="page-drag__path truncate">${esc(p.permalink)}</span>
        </div>`).join('')}
      </div>`;

    html(res, cmsLayout({
      title: 'Menus', user, path: '/cms/menus', center, right,
      scripts: ['/assets/cms-menus.js'],
      data: { page: 'menus', linkOptions: linkOptions(pageList) },
    }));
  }));

  router.post('/cms/menus', guard(async (req, res) => {
    const { fields } = await parseForm(req);
    const name = String(fields.name || '').trim();
    if (name) menus.create(name);
    redirect(res, '/cms/menus');
  }, 'editor'));

  /* Autosaved by the editor; changes stay invisible until Publish. */
  router.post('/cms/api/menus/:id', guard(async (req, res, { params }) => {
    const { fields } = await parseForm(req);
    const id = Number(params.id);
    const tree = unflatten(Array.isArray(fields.rows) ? fields.rows : []);
    const saved = menus.saveDraft(id, tree, fields.name !== undefined ? String(fields.name) : undefined);
    if (!saved) return json(res, { error: 'That menu does not exist' }, 404);
    if (fields.isMain) menus.setMain(id);
    json(res, { ok: true, dirty: menus.byId(id).dirty });
  }, 'editor'));

  router.post('/cms/api/menus/:id/publish', guard((req, res, { params }) => {
    const saved = menus.publish(Number(params.id));
    if (!saved) return json(res, { error: 'That menu does not exist' }, 404);
    json(res, { ok: true, dirty: saved.dirty });
  }, 'editor'));

  router.post('/cms/menus/:id/duplicate', guard((req, res, { params }) => {
    menus.duplicate(Number(params.id));
    redirect(res, '/cms/menus');
  }, 'editor'));

  router.post('/cms/menus/:id/delete', guard((req, res, { params }) => {
    menus.remove(Number(params.id));
    redirect(res, '/cms/menus');
  }, 'editor'));
}
