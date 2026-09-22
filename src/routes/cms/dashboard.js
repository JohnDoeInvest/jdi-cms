import { html, redirect, parseForm } from '../../lib/http.js';
import { esc } from '../../lib/html.js';
import { icon } from '../../views/icons.js';
import { cmsLayout, cmsHead } from '../../views/cms/layout.js';
import { emptyState, field, select } from '../../views/cms/parts.js';
import * as settings from '../../lib/settings.js';
import { articles, categories, pages, media, users, messages } from '../../models.js';
import { formatDate, daysSince, nameParts } from '../../views/helpers.js';

/** Frame 4.4 - list of posts with date, title and views. */
function postList(rows, emptyMessage) {
  if (!rows.length) return emptyState(emptyMessage);
  return `<table class="table">
    <thead><tr><th class="col-narrow">Date</th><th>Title</th><th class="col-narrow">Views</th></tr></thead>
    <tbody>${rows.map((a) => `<tr>
      <td class="col-narrow"><span class="small muted">${esc(formatDate(a.published_at || a.created_at))}</span></td>
      <td><a class="cell-link truncate" href="/cms/articles/${a.id}/edit">${esc(a.title || 'Untitled')}</a></td>
      <td class="col-narrow"><span class="small muted">${a.views}</span></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

export function registerDashboard(router, guard) {
  router.get('/cms', guard((req, res, { user }) => {
    const latest = articles.list({ limit: 5 });
    const mine = articles.list({ authorId: user.id, limit: 5 });
    const lastPost = articles.list({ authorId: user.id, limit: 1 })[0];
    const days = lastPost ? daysSince(lastPost.published_at || lastPost.created_at) : null;
    const cats = categories.list();
    const { first } = nameParts(user.full_name);

    const stats = {
      pages: pages.list().length,
      published: pages.list({ status: 'published' }).length,
      articles: articles.list().length,
      media: media.count(),
    };

    const center = `
      <h1 class="h-page">Welcome${first ? ', ' + esc(first) : ''}</h1>
      <p class="muted" style="font-size:var(--ui-fs-lg);margin:var(--ui-s-1) 0 var(--ui-s-4)">
        ${esc(user.full_name || user.email)}</p>
      <p class="stat-row">${days === null
        ? '<span>You have not published anything yet.</span>'
        : `<strong>${days}</strong><span>${days === 1 ? 'day' : 'days'} since your last post.</span>`}</p>
      <hr class="rule">

      <div class="metric-grid" style="margin-bottom:var(--ui-s-6)">
        <div class="metric"><div class="metric__value">${stats.pages}</div><div class="metric__label">Pages</div></div>
        <div class="metric"><div class="metric__value">${stats.published}</div><div class="metric__label">Published</div></div>
        <div class="metric"><div class="metric__value">${stats.articles}</div><div class="metric__label">Articles</div></div>
        <div class="metric"><div class="metric__value">${stats.media}</div><div class="metric__label">Media files</div></div>
      </div>

      <div class="dash-grid">
        <section class="panel">
          <div class="panel__head"><h2>Recent activity</h2>
            <a class="linkish" href="/cms/articles">All articles</a></div>
          ${postList(latest, 'No articles yet.')}
        </section>
        <section class="panel">
          <div class="panel__head"><h2>Your latest posts</h2></div>
          ${postList(mine, 'You have not written anything yet.')}
        </section>
      </div>`;

    html(res, cmsLayout({
      title: 'Dashboard', user, path: '/cms',
      center, right: quickArticle(cats),
      data: { page: 'dashboard' },
    }));
  }));

  /**
   * Start writing from the dashboard.
   *
   * A title and a subject, then straight into the editor - the body is not
   * asked for here any more, because it is no longer a textarea. It is a
   * canvas, and a canvas in a sidebar is the thing this screen just stopped
   * doing.
   */
  router.post('/cms/quickpost', guard(async (req, res, { user }) => {
    const { fields } = await parseForm(req);
    const title = String(fields.title || '').trim();
    if (!title) return redirect(res, '/cms');

    const article = articles.create({
      title,
      parent_id: settings.get('article_parent'),
      category_ids: [Number(fields.category_id) || 0].filter(Boolean),
      status: 'draft',
    }, user.id);

    redirect(res, `/cms/articles/${article.id}/edit`);
  }, 'editor'));
}

const quickArticle = (cats) => `
  <form class="stack" method="post" action="/cms/quickpost">
    <h2 class="h-tool">Start an article</h2>
    ${field({ label: 'Title', name: 'title', required: true, placeholder: 'What is it about?' })}
    ${select({ label: 'Subject', name: 'category_id', value: '',
      options: cats.map((c) => ({ value: c.id, label: c.name })), placeholder: 'No subject' })}
    <div class="row"><button class="btn btn--primary" type="submit">Create and write</button></div>
    <p class="tiny muted">Opens the editor. Nothing is published until you say so.</p>
  </form>`;
