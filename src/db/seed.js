import { db, get, run, setting } from './index.js';
import { pages, menus } from '../models.js';
import * as settings from '../lib/settings.js';
import { newId } from '../lib/objects.js';

/**
 * Structural seed only.
 *
 * This creates the scaffolding - the two menus and four top-level pages - and deliberately leaves all page
 * content empty. Content is authored in the CMS, and the pages are only a
 * starting shape: rename them, move them, delete them.
 *
 * Neither slices nor page templates are seeded. They were starter content written against the old
 * model, and two of them ("Two columns", "Three columns") only existed because
 * columns used to be objects; a slice's column count is a property now. The
 * library fills up with slices saved from real pages instead.
 */

const obj = (kind, props = {}, extra = {}) => ({ id: newId(), kind, props, style: { margin: {}, padding: {} }, ...extra });

/* The top-level pages, published but empty. A page type is the page's own
   property; nothing needs to exist first for it to have one. `news` marks the
   page new articles are filed under. */
const TOP_PAGES = [
  { title: 'Home', permalink: '/', pageType: 'landing' },
  { title: 'About', permalink: '/about', main: true },
  { title: 'News', permalink: '/news', main: true, news: true },
  { title: 'Contact', permalink: '/contact', extra: true },
];

/* By name, because the site finds its secondary menu by name - see
   extraMenu() in src/routes/site.js. */
export const MAIN_MENU = 'Main menu';
export const EXTRA_MENU = 'Secondary menu';

export async function seed({ force = false } = {}) {
  if (!force && setting.get('seeded')) return false;

  /* No admin: the first-run screen makes one, with a password of its
     owner's choosing, rather than a seeded account nobody chose. */

  /* Page templates are seeded with nothing, like slices: the library fills
     from real pages, saved out of the editor. */

  /* No categories. A category says what an article is about, and a fresh
     site does not know its subjects yet - "News" would say what an article
     *is*, which the News page already does by showing all of them. */

  /* --- pages -------------------------------------------------------- */
  const created = [];
  for (const spec of TOP_PAGES) {
    let page = pages.anyByPermalink(spec.permalink);
    if (!page) {
      page = pages.create({
        title: spec.title,
        permalink: spec.permalink,
        page_type: spec.pageType || 'default',
        meta_title: spec.title,
        use_first_image: 1,
        status: 'published',
        blocks: [],
      }, null);
    }
    created.push({ ...spec, page });
  }

  /* --- menus -------------------------------------------------------- */
  const node = (label, href, pageId) => ({ label, href, pageId, children: [] });

  if (!menus.byName(MAIN_MENU)) {
    const tree = created.filter((c) => c.main).map((c) => node(c.title, c.permalink, c.page.id));
    const menu = menus.create(MAIN_MENU, tree);
    menus.setMain(menu.id);
    menus.publish(menu.id);
  }
  if (!menus.byName(EXTRA_MENU)) {
    const tree = created.filter((c) => c.extra).map((c) => node(c.title, c.permalink, c.page.id));
    const menu = menus.create(EXTRA_MENU, tree);
    menus.publish(menu.id);
  }

  /* --- site settings ------------------------------------------------
     Only where articles go. Name, logo, footer and the rest start from their
     defaults in src/lib/settings.js - with no logo the site shows its name -
     and are made the site's own under Settings. */
  const news = created.find((c) => c.news);
  if (news && !settings.get('article_parent')) settings.set('article_parent', news.page.id);

  setting.set('seeded', '1');
  return true;
}

/** Called on boot: seeds an empty database, no-ops afterwards. */
export async function ensureSeed() {
  const fresh = await seed();
  if (fresh) {
    console.log('  [seed] Structure created: pages and menus.');
  }
  return fresh;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fresh = await seed({ force: true });
  console.log(fresh ? 'Seed complete.' : 'Nothing to do.');
}
