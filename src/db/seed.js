import { config } from '../config.js';
import { db, get, run, setting } from './index.js';
import fs from 'node:fs';
import path from 'node:path';
import { pages, menus, categories, users, media } from '../models.js';
import { storeUpload } from '../lib/media.js';
import * as settings from '../lib/settings.js';
import { newId } from '../lib/objects.js';

/**
 * Structural seed only.
 *
 * This creates the scaffolding - the admin user, the two menus, news
 * categories and the ten top-level pages - and deliberately leaves all page
 * content empty. Content is authored in the CMS.
 *
 * Neither slices nor page templates are seeded. They were starter content written against the old
 * model, and two of them ("Two columns", "Three columns") only existed because
 * columns used to be objects; a slice's column count is a property now. The
 * library fills up with slices saved from real pages instead.
 */

const obj = (kind, props = {}, extra = {}) => ({ id: newId(), kind, props, style: { margin: {}, padding: {} }, ...extra });

/* Flow 1 - the ten top-level pages, published but empty. A page type is the
   page's own property; nothing needs to exist first for it to have one. */
const TOP_PAGES = [
  { title: 'Smartare Mat', permalink: '/', pageType: 'landing', main: false },
  { title: 'Smartare Mat', permalink: '/smartare-mat', main: true },
  { title: 'Varumärken', permalink: '/varumarken', main: true },
  { title: 'Produktion & Utveckling', permalink: '/produktion-utveckling', main: true },
  { title: 'Kunskap', permalink: '/kunskap', main: true },
  { title: 'Nyheter', permalink: '/nyheter', main: true },
  { title: 'Investerare', permalink: '/investerare', extra: true },
  { title: 'Om oss', permalink: '/om-oss', extra: true },
  { title: 'Jobb & karriär', permalink: '/jobb-karriar', extra: true },
  { title: 'Kontakt', permalink: '/kontakt', extra: true },
];

const NEWS_CATEGORIES = [
  'Nyheter', 'Företaget', 'Varumärken', 'Kunder & samarbeten',
  'Produktion', 'Forskning', 'Människor', 'Mantorp & regionen', 'Investerare',
];

export async function seed({ force = false } = {}) {
  if (!force && setting.get('seeded')) return false;

  /* --- admin user --------------------------------------------------- */
  let admin = users.byEmail(config.devUser);
  if (!admin) {
    admin = users.create({
      full_name: 'Mac Smoser',
      email: config.devUser,
      role: 'admin',
      country: 'SE',
    });
  } else if (admin.role !== 'admin') {
    admin = users.update(admin.id, { role: 'admin' });
  }

  /* Page templates are seeded with nothing, like slices: the library fills
     from real pages, saved out of the editor. */

  /* --- categories --------------------------------------------------- */
  const existingCats = new Set(categories.list().map((c) => c.name));
  for (const name of NEWS_CATEGORIES) {
    if (!existingCats.has(name)) categories.create(name, admin.id);
  }

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
      }, admin.id);
    }
    created.push({ ...spec, page });
  }

  /* --- menus -------------------------------------------------------- */
  const node = (label, href, pageId) => ({ label, href, pageId, children: [] });

  if (!menus.byName('Huvudmeny')) {
    const tree = created.filter((c) => c.main).map((c) => node(c.title, c.permalink, c.page.id));
    const menu = menus.create('Huvudmeny', tree);
    menus.setMain(menu.id);
    menus.publish(menu.id);
  }
  if (!menus.byName('Extramenu')) {
    const tree = created.filter((c) => c.extra).map((c) => node(c.title, c.permalink, c.page.id));
    const menu = menus.create('Extramenu', tree);
    menus.publish(menu.id);
  }

  /* --- site settings ------------------------------------------------
     Registers the bundled logo through the media library, exactly as an
     upload would, then points the logo setting at it. Everything else a
     project needs is editable under Settings. */
  if (!settings.get('logo_media')) {
    const logo = await adoptAsset('logo-smartaremat-light.svg', 'image/svg+xml', admin.id);
    if (logo) settings.set('logo_media', logo.id);
  }
  if (!settings.get('logo_dark_media')) {
    const logoDark = await adoptAsset('logo-smartaremat.svg', 'image/svg+xml', admin.id);
    if (logoDark) settings.set('logo_dark_media', logoDark.id);
  }
  settings.set('site_name', 'Smartare Mat');
  settings.set('site_language', 'sv');
  settings.set('contact_email', 'info@smartaremat.se');
  settings.set('footer_note', 'Smartare Mat i Sverige AB (publ)');
  settings.set('footer_text', 'Magasinsvägen 42, 595 57 Mantorp\n0142-61 15 90\ninfo@smartaremat.se');
  settings.set('social_links', [
    { label: 'LinkedIn', url: 'https://www.linkedin.com/company/smartare-mat/' },
    { label: 'Instagram', url: 'https://www.instagram.com/stackysofficial' },
  ]);

  setting.set('seeded', '1');
  return true;
}

/**
 * Copy a file bundled in www/assets into the media library so it behaves like
 * any uploaded item — replaceable, deletable, addressable by id.
 */
async function adoptAsset(name, mime, userId) {
  try {
    const source = path.join(config.paths.www, 'assets', name);
    const data = fs.readFileSync(source);
    const stored = await storeUpload({ filename: name, mime, data });
    return media.create({ ...stored, original_name: name, alt: '' }, userId);
  } catch {
    return null;                       // bundled asset missing: skip quietly
  }
}

/** Called on boot: seeds an empty database, no-ops afterwards. */
export async function ensureSeed() {
  const fresh = await seed();
  if (fresh) {
    console.log('  [seed] Structure created: pages, menus, categories, admin user.');
  }
  return fresh;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fresh = await seed({ force: true });
  console.log(fresh ? 'Seed complete.' : 'Nothing to do.');
}
