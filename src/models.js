import { all, get, run, json, tx } from './db/index.js';
import {
  normalizeBlocks, normalizeObjects, firstImageId, walkObjects, sliceDefinition, reIdBlocks,
  visibleBlocks,
  themeColor as themeColour, anchorSlug, BUTTON_SIZES,
} from './lib/objects.js';
import { slugify, uniqueSlug, normalizePermalink, nowSql } from './lib/util.js';
import { removeMediaFiles } from './lib/media.js';

/* ------------------------------------------------------------------ pages */

/**
 * The frame a page draws in. Three, and only three - a page type describes
 * what the page *is* structurally, not what it is about. "Contact" and
 * "Campaign" were here once and were neither.
 */
export const PAGE_TYPES = ['default', 'landing', 'blank'];

/**
 * A page carries two block lists.
 *
 * `blocks` is what the public sees; `draftBlocks` is the working copy the
 * editor writes to. They part company the moment a live page is edited, and
 * come back together when it is published - which is the whole reason for the
 * split: one column could not be both, so saving a live page published it.
 */
const hydratePage = (row) => row && {
  ...row,
  blocks: normalizeBlocks(json(row.content, [])),
  draftBlocks: normalizeBlocks(json(row.draft_content ?? row.content, [])),
  /* Deliberately *not* overlaid onto the row: `list()` feeds the public site
     as well as the CMS, and a draft title leaking into a feed is the bug this
     whole split exists to stop. The CMS asks for the merged view by name. */
  draftMeta: json(row.draft_meta, {}),
  hasDraftChanges: row.status === 'published'
    && (!sameBlocks(row.content, row.draft_content)
      || Object.keys(json(row.draft_meta, {})).length > 0),
  schedule: scheduleOf(row, PAGE_DRAFT_META),
};

/** The hydrator, exposed so its three states can be tested without a database. */
export const hydrateForTest = hydratePage;

/* -------------------------------------------------------------- schedules */

/**
 * The columns a document query adds to carry its pending publish, if any.
 * Aliased, so a row never grows a second `id` for ORDER BY to trip over.
 */
const SCHEDULE_COLUMNS = `s.publish_at AS scheduled_at, s.content AS scheduled_content,
              s.meta AS scheduled_meta`;

/** One value compared with another the way a stored setting means it. */
const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * What waits for Publish, given what the editor should see and what the
 * columns will hold: every setting where the two disagree.
 */
const pendingBetween = (keys, draft, base) => Object.fromEntries(keys
  .filter((key) => key in draft && !sameValue(draft[key], base[key]))
  .map((key) => [key, draft[key]]));

/**
 * A document's pending publish, or null.
 *
 * `edited` says whether the draft has moved on since it was scheduled. Those
 * edits are not in what goes out, and the editor has to say so - the same
 * job "Live · edited" does for Publish.
 */
function scheduleOf(row, keys) {
  if (!row.scheduled_at) return null;
  const meta = json(row.scheduled_meta, {});
  const draft = { ...row, ...json(row.draft_meta, {}) };
  return {
    at: row.scheduled_at,
    meta,
    edited: !sameBlocks(row.scheduled_content, row.draft_content)
      || keys.some((key) => key in meta && key in draft && !sameValue(meta[key], draft[key])),
  };
}

/**
 * Keep a copy of the draft to put out later, replacing any earlier one.
 *
 * `column` is `page_id` or `article_id`, chosen by the caller in this file.
 */
function saveSchedule(column, id, at, content, meta, userId) {
  run(`INSERT INTO schedules (${column}, publish_at, content, meta, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(${column}) DO UPDATE SET publish_at = excluded.publish_at,
         content = excluded.content, meta = excluded.meta,
         created_by = excluded.created_by, created_at = excluded.created_at`,
  id, at, content, JSON.stringify(meta), userId || null, nowSql());
}

/** A document's settings as the editor shows them, in one comparable string. */
const draftSettings = (doc, keys) => JSON.stringify(keys.map((key) => draftView(doc)[key] ?? null));

const dropSchedule = (column, id) => run(`DELETE FROM schedules WHERE ${column} = ?`, id);
const isScheduled = (column, id) => !!get(`SELECT 1 FROM schedules WHERE ${column} = ?`, id);

/**
 * Put out everything that is due. The clock in server.js calls this.
 *
 * Oldest first, so two pieces meant for 08:00 and 08:05 that both come due
 * while the server was down still go out in the order they were meant to.
 * One failure is logged and does not stop the rest.
 */
export function publishDue(now = nowSql()) {
  const due = all(`SELECT page_id, article_id FROM schedules
                    WHERE publish_at <= ? ORDER BY publish_at, id`, now);
  let published = 0;
  for (const item of due) {
    try {
      const done = item.page_id
        ? pages.publishScheduled(item.page_id)
        : articles.publishScheduled(item.article_id);
      if (done) published += 1;
    } catch (err) {
      console.error(`  [schedule] ${item.page_id ? `page ${item.page_id}` : `article ${item.article_id}`}:`,
        err.message);
    }
  }
  return published;
}

/**
 * Whether two stored block lists mean the same thing. Both are normalised
 * before comparing: the editor round-trips content through JSON on every
 * save, so the bytes differ for reasons the reader would not call a change.
 */
function sameBlocks(a, b) {
  /* Ids are dropped before comparing. They are identity, not content, and
     `normalizeBlocks` mints a fresh one for any block that arrives without -
     so a list stored without ids compares unequal to *itself* and the
     document reads as permanently edited. Two lists differing only in their
     ids do mean the same thing, which is the question being asked. */
  const canonical = (raw) => JSON.stringify(
    normalizeBlocks(json(raw, [])), (key, value) => (key === 'id' ? undefined : value));
  return canonical(a) === canonical(b ?? a);
}

/**
 * A page password, as stored.
 *
 * Trimmed, because a trailing space nobody can see is a password nobody can
 * type, and capped so the column cannot be used as storage. Empty means the
 * page is public - there is no such thing as an empty password here.
 */
const pagePassword = (value) => String(value ?? '').trim().slice(0, 200);

/**
 * Whether an address is already spoken for.
 *
 * Pages and articles share one address space - `/produktion-utveckling` is a
 * page and `/produktion-utveckling/nya-maskiner` an article - so neither can
 * check only its own table. `IS NOT` rather than `<>` because the row being
 * edited is excluded by passing its id, and `<> NULL` is never true.
 */
/**
 * How deep a page can sit: two levels of nesting under the root, so
 * /brands/brand1/mediapack is the longest address there is. Mac's call, and
 * the right one - a trail with five steps in it stops being a trail, and the
 * URL stops being something anyone types.
 */
export const MAX_PAGE_DEPTH = 3;

/**
 * What waits for Publish rather than going live as it is typed.
 *
 * Everything a reader of the site would notice. Not `password`, which is a
 * lock: putting one on a live page has to take effect when you put it on, not
 * when you next publish. Not the address either - that is frozen on a live
 * document already, which is the same protection by another route.
 */
const PAGE_DRAFT_META = ['title', 'page_type', 'submenu_id', 'meta_title',
  'meta_description', 'og_image_id', 'use_first_image'];

/* The date is one of them: cards print it and feeds sort by it, so a new one
   on a live article is a change a reader would notice, like a new title. */
const ARTICLE_DRAFT_META = ['title', 'lead', 'image_id', 'cta_label', 'cta_url', 'category_ids',
  'published_at'];

/** The ones that are columns. Subjects are rows in a join table instead. */
const ARTICLE_COLUMN_META = ARTICLE_DRAFT_META.filter((key) => key !== 'category_ids');

/** The document as the editor should show it: live values, pending on top. */
export const draftView = (row) => (row ? { ...row, ...(row.draftMeta || {}) } : row);

/**
 * Which columns a list may be sorted by, and the SQL each one means.
 *
 * An allowlist rather than a column name from the query string: `ORDER BY`
 * cannot be parameterised, so anything reaching it has to be something this
 * file chose. A key that is not here falls back to the list's own order.
 */
const PAGE_SORTS = {
  title: 'p.title COLLATE NOCASE',
  date: 'p.updated_at',
};

const ARTICLE_SORTS = {
  title: 'a.title COLLATE NOCASE',
  date: 'a.updated_at',
};

const orderBy = (sort, dir, allowed, fallback) => {
  const column = allowed[String(sort || '')];
  if (!column) return fallback;
  // Ties broken by id so a page of results cannot reshuffle between reloads.
  return `${column} ${dir === 'desc' ? 'DESC' : 'ASC'}, id DESC`;
};

export const permalinkTaken = (candidate, { pageId = null, articleId = null } = {}) =>
  !!get('SELECT 1 FROM pages WHERE permalink = ? AND id IS NOT ?', candidate, pageId)
  || !!get('SELECT 1 FROM articles WHERE permalink = ? AND id IS NOT ?', candidate, articleId);

/** A page with its pending publish alongside, which the CMS always wants. */
const PAGE_SELECT = `SELECT p.*, ${SCHEDULE_COLUMNS}
         FROM pages p
         LEFT JOIN schedules s ON s.page_id = p.id`;

export const pages = {
  list({ search = '', status = '', sort = '', dir = '' } = {}) {
    const where = [];
    const params = [];
    if (search) { where.push('(p.title LIKE ? OR p.permalink LIKE ? OR p.meta_title LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (status) { where.push('p.status = ?'); params.push(status); }
    return all(
      `SELECT p.*, u.full_name AS author_name, ${SCHEDULE_COLUMNS}
         FROM pages p
         LEFT JOIN users u ON u.id = p.created_by
         LEFT JOIN schedules s ON s.page_id = p.id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY ${orderBy(sort, dir, PAGE_SORTS, "p.permalink = '/' DESC, p.title COLLATE NOCASE")}`,
      ...params)
      // A live page with edits waiting is a state of its own, and has to be
      // visible here: otherwise pending changes are only findable by opening
      // every page and looking.
      .map(hydratePage);
  },

  byId: (id) => hydratePage(get(`${PAGE_SELECT} WHERE p.id = ?`, id)),

  byPermalink: (permalink) =>
    hydratePage(get('SELECT * FROM pages WHERE permalink = ? AND status = ?', permalink, 'published')),

  anyByPermalink: (permalink) => hydratePage(get('SELECT * FROM pages WHERE permalink = ?', permalink)),

  /**
   * Where a page sits, resolved from a parent and a slug.
   *
   * The pair is what makes an address containable: with a parent chosen from
   * pages that exist and a slug that cannot hold a slash, there is no way to
   * write a path whose middle is nowhere. The permalink is composed here and
   * stored, so routing stays one lookup - the same bargain an article makes.
   *
   * A parent that is missing, deleted, too deep or its own descendant is
   * dropped rather than honoured: the page lands at the root, which is a
   * visible, fixable result. Silently accepting it is how the old free-text
   * box produced trails leading nowhere.
   */
  resolveParent(parentId, { pageId = null } = {}) {
    const id = Number(parentId) || null;
    if (!id || id === pageId) return null;
    const parent = get('SELECT id, permalink, parent_id FROM pages WHERE id = ?', id);
    if (!parent) return null;
    // Its own descendant would be a loop, and a loop has no address at all.
    if (pageId) {
      for (let up = parent, hops = 0; up && hops < MAX_PAGE_DEPTH + 2; hops += 1) {
        if (up.id === pageId) return null;
        up = up.parent_id ? get('SELECT id, parent_id FROM pages WHERE id = ?', up.parent_id) : null;
      }
    }
    /* Two levels of nesting below the root, so /brands/brand1/mediapack is as
       deep as it goes and a trail never grows a fourth step. The test is on
       what the *child* would become: a parent sitting at depth d makes a page
       at d + 1, so a parent is refused once it is already at the cap. */
    const depth = parent.permalink.split('/').filter(Boolean).length;
    return depth >= MAX_PAGE_DEPTH ? null : parent;
  },

  /** The address a parent and a slug make, unique against pages and articles. */
  composePermalink({ parentId, slug, title, pageId = null }) {
    const parent = this.resolveParent(parentId, { pageId });
    const own = slugify(String(slug || '').split('/').filter(Boolean).pop() || title || 'ny-sida', '')
      || 'ny-sida';
    const base = normalizePermalink(`${parent ? parent.permalink : ''}/${own}`);
    return {
      parentId: parent ? parent.id : null,
      slug: own,
      permalink: permalinkTaken(base, { pageId })
        ? uniqueSlug(base, (c) => permalinkTaken(c, { pageId }))
        : base,
    };
  },

  /** The pages sitting directly under this one. */
  children: (id) => all('SELECT id, title, permalink FROM pages WHERE parent_id = ?', id),

  /** Pages that could be a parent: not itself, not its own descendants, not too deep. */
  parentOptions(pageId = null) {
    const rows = all("SELECT id, title, permalink, parent_id FROM pages WHERE permalink != '/'");
    const banned = new Set();
    if (pageId) {
      banned.add(pageId);
      let grew = true;
      while (grew) {
        grew = false;
        for (const r of rows) {
          if (!banned.has(r.id) && r.parent_id && banned.has(r.parent_id)) { banned.add(r.id); grew = true; }
        }
      }
    }
    return rows
      .filter((r) => !banned.has(r.id))
      // Same test as resolveParent: anything already at the cap has no room
      // under it, so offering it would be offering a choice that gets dropped.
      .filter((r) => r.permalink.split('/').filter(Boolean).length < MAX_PAGE_DEPTH)
      .sort((a, b) => a.permalink.localeCompare(b.permalink));
  },

  create(data, userId) {
    /* '/' is the one address that is not composed: the landing page is the
       root rather than a page sitting at it, so it has no slug to build from
       and asking for one would rename it on the way in. The seed says '/'
       explicitly, which is the only way to ask for it. */
    const root = normalizePermalink(data.permalink || '') === '/' && data.permalink;
    const { parentId, slug, permalink } = root
      ? { parentId: null, slug: '', permalink: '/' }
      : this.composePermalink({
        parentId: data.parent_id,
        slug: data.slug || data.permalink || data.title,
        title: data.title,
      });
    const blocksJson = JSON.stringify(normalizeBlocks(data.blocks || []));
    const info = run(
      `INSERT INTO pages (title, parent_id, slug, permalink, page_type, submenu_id,
                          meta_title, meta_description,
                          og_image_id, use_first_image, content, draft_content, password,
                          status, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      data.title || 'Namnlös sida', parentId, slug, permalink,
      PAGE_TYPES.includes(data.page_type) ? data.page_type : 'default',
      data.submenu_id || null,
      data.meta_title || '', data.meta_description || '', data.og_image_id || null,
      // Both copies start in step, so a page is never born already "edited".
      data.use_first_image ? 1 : 0, blocksJson, blocksJson,
      pagePassword(data.password),
      data.status || 'draft', userId || null);
    return this.byId(info.lastInsertRowid);
  },

  /**
   * The anchors a page offers, in the order and with the numbering the
   * renderer will give them - so a menu built against this list points at ids
   * that actually exist. Read from the draft, because that is the page the
   * author is looking at and about to publish - less its hidden slices, whose
   * sections are not on the site for a link to land on.
   */
  anchors(page) {
    const blocks = visibleBlocks(normalizeBlocks(json(page.draft_content ?? page.content, [])));
    const seen = new Set();
    const out = [];
    const take = (anchor, label) => {
      if (!anchor) return;
      let id = anchor;
      for (let n = 2; seen.has(id); n++) id = `${anchor}-${n}`;
      seen.add(id);
      // The label is only what the picker shows. The stored link is the id,
      // so renaming a heading never moves a menu item that points at it.
      out.push({ id, label: String(label || '').slice(0, 60) || id });
    };
    for (const block of blocks) {
      // Section first, matching renderBlock: the container claims the name
      // before anything inside it does.
      const heading = [...walkObjects([block])].find((o) => o.kind === 'heading' && o.props?.text);
      take(block.props?.anchor, block.name || heading?.props?.text || '');
      for (const obj of walkObjects([block])) take(obj.props?.anchor, obj.props?.text || '');
    }
    return out;
  },

  /** Make the draft live. With `publishScheduled`, the only thing that writes `content`. */
  /**
   * Publishing is what moves a draft across - all of it, not just the blocks.
   * Whatever was waiting in `draft_meta` lands on the row here and the pending
   * copy is emptied, so the two can never drift.
   */
  publish(id) {
    const row = get('SELECT * FROM pages WHERE id = ?', id);
    if (!row) return null;
    const pending = json(row.draft_meta, {});
    // Through the allowlist, so what reaches the column list is a name this
    // file chose rather than a key that happened to be in some JSON.
    const cols = PAGE_DRAFT_META.filter((c) => c in pending);
    /* Publishing now overtakes a schedule: what is on the screen is newer
       than the copy waiting, and leaving it waiting would put the older
       version back over this one when its minute came. */
    tx(() => {
      run(`UPDATE pages SET content = draft_content, draft_meta = '{}', status = 'published',
                            published_at = COALESCE(published_at, ?), updated_at = ?
                            ${cols.map((c) => `, ${c} = ?`).join('')}
            WHERE id = ?`, nowSql(), nowSql(), ...cols.map((c) => pending[c]), id);
      dropSchedule('page_id', id);
    });
    return this.byId(id);
  },

  /**
   * Take a page off the site. What was published stays, so it can go back.
   *
   * Any schedule goes with it. "Take this down" has to mean down: a page
   * pulled because the event was cancelled must not reappear by itself the
   * next morning with the update somebody had queued for it.
   */
  unpublish(id) {
    tx(() => {
      run("UPDATE pages SET status = 'draft', updated_at = ? WHERE id = ?", nowSql(), id);
      dropSchedule('page_id', id);
    });
    return this.byId(id);
  },

  /**
   * Publish later: keep a copy of the draft as it is now and put it out at
   * `at`, a stored UTC timestamp the route has already checked.
   *
   * The copy is the point. The editor goes on autosaving afterwards, and what
   * goes live has to be what was on the screen when Schedule was pressed -
   * the promise Publish makes, kept a few hours later. Scheduling again takes
   * a fresh copy, which is how later edits get in.
   */
  schedule(id, at, userId = null) {
    const page = draftView(this.byId(id));
    if (!page) return null;
    const meta = Object.fromEntries(PAGE_DRAFT_META.map((key) => [key, page[key] ?? null]));
    saveSchedule('page_id', id, at, page.draft_content, meta, userId);
    return this.byId(id);
  },

  /** Call a schedule off. The draft and what is live are left as they are. */
  unschedule(id) {
    dropSchedule('page_id', id);
    return this.byId(id);
  },

  /**
   * The scheduled copy goes live. Run by the clock, not by a person.
   *
   * Whatever the draft has moved on to since it was scheduled stays a draft:
   * `draft_content` is not touched and changed settings land in `draft_meta`,
   * so the page reads Live · edited afterwards rather than either losing the
   * work or publishing it. `published_at` is the minute it was meant for, not
   * the tick that noticed. `updated_at` is left alone - nobody edited it.
   */
  publishScheduled(id) {
    const page = this.byId(id);
    if (!page?.schedule) return null;
    const scheduled = page.schedule.meta;
    const cols = PAGE_DRAFT_META.filter((c) => c in scheduled);
    const pending = pendingBetween(PAGE_DRAFT_META, draftView(page), { ...page, ...scheduled });
    tx(() => {
      run(`UPDATE pages SET content = ?, draft_meta = ?, status = 'published',
                            published_at = COALESCE(published_at, ?)
                            ${cols.map((c) => `, ${c} = ?`).join('')}
            WHERE id = ?`,
      page.scheduled_content, JSON.stringify(pending), page.schedule.at,
      ...cols.map((c) => scheduled[c]), id);
      dropSchedule('page_id', id);
    });
    return this.byId(id);
  },

  /**
   * Throw the draft away and start again from the last version committed to:
   * what is scheduled if anything is, otherwise what is live.
   *
   * This is the undo that autosave takes away: once edits are written the
   * moment they are made, walking away no longer gets the page back, so
   * something has to. A page that is neither live nor scheduled has nothing
   * behind it to return to.
   *
   * `settingsReset` on the result says whether a setting moved back as well
   * as the blocks: the editor's fields still show what was thrown away, and
   * its next autosave would send all of it straight back.
   */
  discardDraft(id) {
    const page = this.byId(id);
    if (!page) return null;
    if (!page.schedule) {
      run("UPDATE pages SET draft_content = content, draft_meta = '{}', updated_at = ? WHERE id = ?",
        nowSql(), id);
    } else {
      /* Back to the scheduled copy. A live page keeps its columns and holds
         the scheduled settings as pending; one that is not live writes its
         settings straight to the row, so they go back there. */
      const scheduled = page.schedule.meta;
      const live = page.status === 'published';
      const cols = live ? [] : PAGE_DRAFT_META.filter((c) => c in scheduled);
      const pending = live ? pendingBetween(PAGE_DRAFT_META, scheduled, page) : {};
      run(`UPDATE pages SET draft_content = ?, draft_meta = ?, updated_at = ?
                            ${cols.map((c) => `, ${c} = ?`).join('')}
            WHERE id = ?`,
      page.scheduled_content, JSON.stringify(pending), nowSql(), ...cols.map((c) => scheduled[c]), id);
    }
    const after = this.byId(id);
    return { ...after, settingsReset: draftSettings(page, PAGE_DRAFT_META) !== draftSettings(after, PAGE_DRAFT_META) };
  },

  /**
   * A page copied whole: same type, same slices, always a draft.
   *
   * Every slice and object is re-normalised on the way in, which mints fresh
   * ids - two pages sharing an object id would make the editor's "find this
   * block" ambiguous the moment either was edited.
   */
  duplicate(id, userId) {
    const source = this.byId(id);
    if (!source) return null;
    return this.create({
      title: `${source.title} copy`,
      // A copy sits beside its original, under the same parent, rather than
      // jumping to the root because its address was rebuilt from a string.
      parent_id: source.parent_id,
      slug: `${source.permalink === '/' ? 'start' : source.slug}-copy`,
      page_type: source.page_type,
      submenu_id: source.submenu_id,
      meta_title: source.meta_title,
      meta_description: source.meta_description,
      og_image_id: source.og_image_id,
      use_first_image: source.use_first_image,
      // A copy of a protected page is protected. The alternative is a draft
      // that quietly drops the lock and goes live open.
      password: source.password,
      // Copy what the author was last looking at, not what is live.
      blocks: reIdBlocks(source.draftBlocks),
      status: 'draft',
    }, userId);
  },

  update(id, data) {
    const current = get('SELECT * FROM pages WHERE id = ?', id);
    if (!current) return null;
    const fields = [];
    const params = [];
    const set = (col, value) => { fields.push(`${col} = ?`); params.push(value); };

    /* Metadata waits for Publish while the page is live, and is written
       straight through while it is not - a page nobody can read has nothing
       public to protect, so the split would only be ceremony. A value set
       back to what is live is dropped rather than stored, so "edited" is
       never true of a change nobody made. */
    const live = current.status === 'published';
    const pending = live ? json(current.draft_meta, {}) : null;
    let pendingTouched = false;
    const meta = (col, value) => {
      if (!pending) return set(col, value);
      pendingTouched = true;
      if (value === current[col]) delete pending[col];
      else pending[col] = value;
    };

    if (data.title !== undefined) meta('title', data.title);

    /* The address, and the two things that make it.
     *
     * Frozen once the page is live, exactly as an article's is: a published
     * address is a promise to whatever links to it. That freeze is also what
     * keeps children safe - a parent that cannot move cannot strand them -
     * so it does more work here than it does for an article.
     *
     * A scheduled page is frozen too. Its address is as good as given out -
     * the newsletter that goes with it is usually written, link included,
     * before the page is live.
     *
     * The landing page has no address to compose. It is the root. */
    const frozen = current.status === 'published' || isScheduled('page_id', id);
    const isRoot = current.permalink === '/';
    if (!frozen && !isRoot && (data.parent_id !== undefined || data.slug !== undefined)) {
      const { parentId, slug, permalink } = this.composePermalink({
        parentId: data.parent_id !== undefined ? data.parent_id : current.parent_id,
        slug: data.slug !== undefined ? data.slug : current.slug,
        title: data.title !== undefined ? data.title : current.title,
        pageId: id,
      });
      set('parent_id', parentId);
      set('slug', slug);
      set('permalink', permalink);
    }
    if (data.page_type !== undefined && PAGE_TYPES.includes(data.page_type)) meta('page_type', data.page_type);
    if (data.submenu_id !== undefined) meta('submenu_id', data.submenu_id || null);
    if (data.meta_title !== undefined) meta('meta_title', data.meta_title);
    if (data.meta_description !== undefined) meta('meta_description', data.meta_description);
    if (data.og_image_id !== undefined) meta('og_image_id', data.og_image_id || null);
    if (data.use_first_image !== undefined) meta('use_first_image', data.use_first_image ? 1 : 0);
    if (data.password !== undefined) set('password', pagePassword(data.password));
    // Editing writes the draft and never what is live. `publish` is the one
    // thing that moves a draft across, which is what makes autosave safe.
    if (data.blocks !== undefined) set('draft_content', JSON.stringify(normalizeBlocks(data.blocks)));
    if (data.status !== undefined) {
      set('status', data.status);
      if (data.status === 'published' && !current.published_at) set('published_at', nowSql());
    }
    if (pendingTouched) set('draft_meta', JSON.stringify(pending));
    if (!fields.length) return this.byId(id);
    set('updated_at', nowSql());
    run(`UPDATE pages SET ${fields.join(', ')} WHERE id = ?`, ...params, id);
    return this.byId(id);
  },

  /**
   * Delete, having first re-homed whatever sat under this page.
   *
   * `ON DELETE SET NULL` would clear the children's `parent_id` and leave
   * their stored permalink pointing through a page that no longer exists -
   * the exact orphaning the parent field was added to prevent. So they are
   * moved first, and their addresses recomposed, before the row goes.
   *
   * `reparentTo` null means the site root, which is the honest default: the
   * page keeps its own slug and simply sits one level up.
   *
   * A published or scheduled child cannot move - its address is frozen and
   * something out there links to it, or soon will - so it keeps the address
   * it has and only loses the parent pointer. Those are reported rather than
   * silently left behind.
   */
  remove(id, { reparentTo = null } = {}) {
    const kids = this.children(id);
    const stranded = [];
    for (const kid of kids) {
      const row = get('SELECT status, slug FROM pages WHERE id = ?', kid.id);
      if (row?.status === 'published' || isScheduled('page_id', kid.id)) {
        run('UPDATE pages SET parent_id = ? WHERE id = ?', null, kid.id);
        stranded.push(kid.permalink);
        continue;
      }
      const { parentId, slug, permalink } = this.composePermalink({
        parentId: reparentTo && Number(reparentTo) !== id ? reparentTo : null,
        slug: row?.slug || kid.title,
        title: kid.title,
        pageId: kid.id,
      });
      run('UPDATE pages SET parent_id = ?, slug = ?, permalink = ?, updated_at = ? WHERE id = ?',
        parentId, slug, permalink, nowSql(), kid.id);
    }
    const gone = run('DELETE FROM pages WHERE id = ?', id).changes > 0;
    return { ok: gone, moved: kids.length - stranded.length, stranded };
  },

  /** How many menu items point at this page - drives the delete dialogue. */
  menuUsage(pageId) {
    const page = get('SELECT permalink FROM pages WHERE id = ?', pageId);
    if (!page) return [];
    return all('SELECT id, name, draft, published FROM menus').filter((menu) => {
      const inTree = (nodes) => (nodes || []).some((n) =>
        n.href === page.permalink || n.pageId === pageId || inTree(n.children));
      return inTree(json(menu.draft, [])) || inTree(json(menu.published, []));
    });
  },

  ogImage(page) {
    if (page.og_image_id) return page.og_image_id;
    if (page.use_first_image) return firstImageId(visibleBlocks(page.blocks));
    return null;
  },

  countViews: (id) => run('UPDATE pages SET views = views + 1 WHERE id = ?', id),
};

/* --------------------------------------------------------------- articles */

/**
 * The primary subject, as a sub-select rather than a join on `position = 0`.
 *
 * "First by position" survives the primary subject being deleted from the
 * palette: the next one simply becomes primary, where a join pinned to
 * position 0 would leave an article with subjects and no name to show.
 */
const PRIMARY_CATEGORY = `(SELECT ac.category_id FROM article_categories ac
                            WHERE ac.article_id = a.id
                            ORDER BY ac.position, ac.category_id LIMIT 1)`;

/**
 * An article carries two block lists, exactly as a page does.
 *
 * The editor is the same canvas, so it autosaves the same way - and an
 * autosave that could reach what the public reads would make writing a live
 * article impossible.
 */
const hydrateArticle = (row) => row && {
  ...row,
  blocks: normalizeBlocks(json(row.content, [])),
  draftBlocks: normalizeBlocks(json(row.draft_content ?? row.content, [])),
  /* Not overlaid, for the same reason a page's is not: `list()` draws the
     feeds on the public site as well as the list in the CMS. */
  draftMeta: json(row.draft_meta, {}),
  hasDraftChanges: row.status === 'published'
    && (!sameBlocks(row.content, row.draft_content)
      || Object.keys(json(row.draft_meta, {})).length > 0),
  // Subjects are not on the row, so `byId` finishes the comparison.
  schedule: scheduleOf(row, ARTICLE_COLUMN_META),
};

/** An article's subjects as the editor shows them: pending ones if any. */
const draftSubjects = (article) => (Array.isArray(article.draftMeta?.category_ids)
  ? article.draftMeta.category_ids
  : (article.categories || []).map((c) => c.id));

/**
 * The excerpt an article falls back to: the opening of its first text.
 *
 * `lead` used to be stripped from a body that was one blob of HTML. The body
 * is objects now, so the first words have to be found rather than sliced off
 * the front.
 */
export function firstText(blocks) {
  for (const obj of walkObjects(blocks)) {
    if (obj.kind === 'text' && obj.props?.html) return obj.props.html;
  }
  return '';
}

/** The columns every article query returns, so the three cannot drift. */
const ARTICLE_SELECT = `SELECT a.*, c.name AS category_name, c.slug AS category_slug,
              u.full_name AS author_name, m.filename AS image_filename, m.alt AS image_alt,
              m.caption AS image_caption,
              m.variants AS image_variants, m.width AS image_width, m.height AS image_height,
              m.fallback_filename AS image_fallback,
              ${SCHEDULE_COLUMNS}
         FROM articles a
         LEFT JOIN categories c ON c.id = ${PRIMARY_CATEGORY}
         LEFT JOIN users u ON u.id = a.author_id
         LEFT JOIN media m ON m.id = a.image_id
         LEFT JOIN schedules s ON s.article_id = a.id`;

/**
 * Where an article lives: its parent page's address, plus its own slug.
 *
 * A parent of the landing page, or none at all, leaves the article at the
 * root - `/nya-maskiner` - rather than doubling the slash.
 */
function composePermalink(parentId, slug) {
  const parent = parentId ? get('SELECT permalink FROM pages WHERE id = ?', parentId) : null;
  const base = parent && parent.permalink !== '/' ? parent.permalink : '';
  return `${base}/${slug}`;
}

/** Whole numbers only, deduped - what a list of category ids has to be. */
const idList = (value) => [...new Set(
  (Array.isArray(value) ? value : [value])
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isFinite(n) && n > 0))];

export const articles = {
  /**
   * `categoryIds` matches an article carrying *any* of them, which is what a
   * feed pointed at "Produktion or Forskning" means. An empty list is no
   * filter at all - the news page, which is every article there is.
   *
   * `random` is a feed's fresh pick, dealt again on every call. A flag
   * rather than a key in ARTICLE_SORTS, which is what the CMS list's column
   * headers may ask for, and "random" is not a way to sort that table.
   */
  list({ search = '', status = '', categoryIds = [], authorId = null,
    limit = 0, offset = 0, sort = '', dir = '', random = false } = {}) {
    const where = [];
    const params = [];
    if (search) { where.push('(a.title LIKE ? OR a.lead LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (status) { where.push('a.status = ?'); params.push(status); }
    const cats = idList(categoryIds);
    if (cats.length) {
      where.push(`EXISTS (SELECT 1 FROM article_categories ac
                           WHERE ac.article_id = a.id
                             AND ac.category_id IN (${cats.map(() => '?').join(',')}))`);
      params.push(...cats);
    }
    if (authorId) { where.push('a.author_id = ?'); params.push(authorId); }
    return all(
      `${ARTICLE_SELECT}
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY ${random ? 'RANDOM()' : orderBy(sort, dir, ARTICLE_SORTS,
          'COALESCE(a.published_at, a.created_at) DESC, a.id DESC')}
        ${limit ? `LIMIT ${Number(limit)} OFFSET ${Number(offset)}` : ''}`, ...params)
      /* Hydrated, as the pages list is. It was not, so the articles list
         never once said Live · edited and showed the live title over a
         pending one - `draftView` had no pending values to lay over. Safe
         for the feeds: the hydrator adds fields and overlays nothing. */
      .map(hydrateArticle);
  },

  /** Every subject an article carries, primary first. */
  categoriesOf: (articleId) => all(
    `SELECT c.id, c.name, c.slug FROM article_categories ac
       JOIN categories c ON c.id = ac.category_id
      WHERE ac.article_id = ? ORDER BY ac.position, c.id`, articleId),

  /**
   * Replace an article's subjects. Order is the argument's order, so the
   * first one given is the primary - which is what the form's Category field
   * decides, with the rest coming from the checkboxes below it.
   */
  setCategories(articleId, ids) {
    run('DELETE FROM article_categories WHERE article_id = ?', articleId);
    idList(ids).slice(0, 12).forEach((categoryId, position) => {
      // A subject deleted from the palette between reading the form and
      // saving it would fail the foreign key and lose the whole save.
      if (get('SELECT 1 FROM categories WHERE id = ?', categoryId)) {
        run('INSERT OR IGNORE INTO article_categories (article_id, category_id, position) VALUES (?,?,?)',
          articleId, categoryId, position);
      }
    });
  },

  byId(id) {
    const row = hydrateArticle(get(`${ARTICLE_SELECT} WHERE a.id = ?`, id));
    if (!row) return row;
    const article = { ...row, categories: this.categoriesOf(row.id) };
    if (article.schedule && !article.schedule.edited) {
      article.schedule.edited = !sameValue(
        article.schedule.meta.category_ids ?? [], draftSubjects(article));
    }
    return article;
  },

  bySlug(slug) {
    const row = hydrateArticle(get(`${ARTICLE_SELECT} WHERE a.slug = ? AND a.status = 'published'`, slug));
    return row && { ...row, categories: this.categoriesOf(row.id) };
  },

  /** How the site finds an article: one lookup, exactly like a page. */
  byPermalink(permalink) {
    const row = hydrateArticle(
      get(`${ARTICLE_SELECT} WHERE a.permalink = ? AND a.status = 'published'`, permalink));
    return row && { ...row, categories: this.categoriesOf(row.id) };
  },

  /** Make the draft live. With `publishScheduled`, the only thing that writes `content`. */
  publish(id) {
    const row = get('SELECT * FROM articles WHERE id = ?', id);
    if (!row) return null;
    const pending = json(row.draft_meta, {});
    const cols = ARTICLE_COLUMN_META.filter((c) => c in pending && c !== 'published_at');
    // Overtakes a schedule, for the reason a page's publish does.
    tx(() => {
      /* The date: one waiting in the editor, else the one the article already
         carries - set by hand, or from when it first went out - else today. */
      run(`UPDATE articles SET content = draft_content, draft_meta = '{}', status = 'published',
                               published_at = COALESCE(?, published_at, ?), updated_at = ?
                               ${cols.map((c) => `, ${c} = ?`).join('')}
            WHERE id = ?`, pending.published_at ?? null, nowSql(), nowSql(),
      ...cols.map((c) => pending[c]), id);
      // Subjects are rows elsewhere, so they are applied rather than copied.
      if (Array.isArray(pending.category_ids)) this.setCategories(id, pending.category_ids);
      dropSchedule('article_id', id);
    });
    return this.byId(id);
  },

  /**
   * Take an article off the site. What was published stays, so it can go back.
   * Any schedule goes with it - see the note on a page's unpublish.
   */
  unpublish(id) {
    tx(() => {
      run("UPDATE articles SET status = 'draft', updated_at = ? WHERE id = ?", nowSql(), id);
      dropSchedule('article_id', id);
    });
    return this.byId(id);
  },

  /**
   * Publish later, from a copy of the draft as it is now. See `pages.schedule`.
   * The subjects go into the copy as a list, primary first.
   */
  schedule(id, at, userId = null) {
    const article = this.byId(id);
    if (!article) return null;
    const draft = draftView(article);
    const meta = {
      ...Object.fromEntries(ARTICLE_COLUMN_META.map((key) => [key, draft[key] ?? null])),
      category_ids: draftSubjects(article),
    };
    saveSchedule('article_id', id, at, article.draft_content, meta, userId);
    return this.byId(id);
  },

  unschedule(id) {
    dropSchedule('article_id', id);
    return this.byId(id);
  },

  /** The scheduled copy goes live. See `pages.publishScheduled`. */
  publishScheduled(id) {
    const article = this.byId(id);
    if (!article?.schedule) return null;
    const scheduled = article.schedule.meta;
    const cols = ARTICLE_COLUMN_META.filter((c) => c in scheduled && c !== 'published_at');
    const pending = pendingBetween(ARTICLE_COLUMN_META, draftView(article), { ...article, ...scheduled });
    const subjects = draftSubjects(article);
    if (Array.isArray(scheduled.category_ids) && !sameValue(subjects, scheduled.category_ids)) {
      pending.category_ids = subjects;
    }
    tx(() => {
      // As on publish, with the minute it was meant for in place of today -
      // and a copy with no date in it must not take away the one it has.
      run(`UPDATE articles SET content = ?, draft_meta = ?, status = 'published',
                               published_at = COALESCE(?, published_at, ?)
                               ${cols.map((c) => `, ${c} = ?`).join('')}
            WHERE id = ?`,
      article.scheduled_content, JSON.stringify(pending), scheduled.published_at ?? null,
      article.schedule.at, ...cols.map((c) => scheduled[c]), id);
      if (Array.isArray(scheduled.category_ids)) this.setCategories(id, scheduled.category_ids);
      dropSchedule('article_id', id);
    });
    return this.byId(id);
  },

  /**
   * Throw the draft away and start again from the last version committed to:
   * what is scheduled if anything is, otherwise what is live. `settingsReset`
   * as on a page.
   */
  discardDraft(id) {
    const article = this.byId(id);
    if (!article) return null;
    if (!article.schedule) {
      run("UPDATE articles SET draft_content = content, draft_meta = '{}', updated_at = ? WHERE id = ?",
        nowSql(), id);
    } else {
      const scheduled = article.schedule.meta;
      const live = article.status === 'published';
      const cols = live ? [] : ARTICLE_COLUMN_META.filter((c) => c in scheduled);
      const pending = live ? pendingBetween(ARTICLE_COLUMN_META, scheduled, article) : {};
      const liveSubjects = article.categories.map((c) => c.id);
      const wanted = Array.isArray(scheduled.category_ids) ? scheduled.category_ids : null;
      if (live && wanted && !sameValue(wanted, liveSubjects)) pending.category_ids = wanted;
      tx(() => {
        run(`UPDATE articles SET draft_content = ?, draft_meta = ?, updated_at = ?
                                 ${cols.map((c) => `, ${c} = ?`).join('')}
              WHERE id = ?`,
        article.scheduled_content, JSON.stringify(pending), nowSql(),
        ...cols.map((c) => scheduled[c]), id);
        // Not live, so the subjects the editor shows are the rows themselves.
        if (!live && wanted) this.setCategories(id, wanted);
      });
    }
    const after = this.byId(id);
    const settings = (doc) => draftSettings(doc, ARTICLE_COLUMN_META) + JSON.stringify(draftSubjects(doc));
    return { ...after, settingsReset: settings(article) !== settings(after) };
  },

  create(data, userId) {
    const parentId = Number(data.parent_id) || null;
    // Unique as a slug *and* as a whole address: the slug is what the CMS
    // addresses an article by, the address is what the site does.
    const slug = uniqueSlug(slugify(data.title || 'artikel', 'artikel'),
      (c) => !!get('SELECT 1 FROM articles WHERE slug = ?', c)
        || permalinkTaken(composePermalink(parentId, c)));
    // Both copies start in step, so an article is never born already "edited".
    const blocksJson = JSON.stringify(normalizeBlocks(data.blocks || []));
    const info = run(
      `INSERT INTO articles (title, slug, parent_id, permalink, lead, content, draft_content,
                             image_id, status, author_id, cta_label, cta_url, published_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      data.title || '', slug, parentId, composePermalink(parentId, slug),
      data.lead || '', blocksJson, blocksJson,
      data.image_id || null, data.status || 'draft', userId || null,
      data.cta_label || '', data.cta_url || '',
      data.status === 'published' ? nowSql() : null);
    if (data.category_ids !== undefined) this.setCategories(info.lastInsertRowid, data.category_ids);
    return this.byId(info.lastInsertRowid);
  },

  update(id, data) {
    const current = get('SELECT * FROM articles WHERE id = ?', id);
    if (!current) return null;
    const fields = [];
    const params = [];
    const set = (col, value) => { fields.push(`${col} = ?`); params.push(value); };

    /* Slug, parent and address move together, and all three freeze while the
       article is live - a link that has been given out has to keep working
       however the piece is later re-titled or re-filed.
       While it is *live*, not once it ever was. `published_at` is never
       cleared, so testing it made the address final for good: an article filed
       under the wrong page on the day it went out could never be moved, and
       the only way round was to delete it and write it again - which breaks
       the link anyway and loses the piece with it. Unpublishing is the honest
       version of that, and it is what a page asks for too.
       Scheduled counts as live here, for the reason it does on a page. */
    if (current.status !== 'published' && !isScheduled('article_id', id)) {
      const parentId = data.parent_id !== undefined
        ? (Number(data.parent_id) || null) : current.parent_id;
      const wanted = data.title ? slugify(data.title, 'artikel') : current.slug;
      const slug = uniqueSlug(wanted,
        (c) => !!get('SELECT 1 FROM articles WHERE slug = ? AND id <> ?', c, id)
          || permalinkTaken(composePermalink(parentId, c), { articleId: id }));
      set('slug', slug);
      set('parent_id', parentId);
      set('permalink', composePermalink(parentId, slug));
    }
    /* The same bargain a page makes: while the article is live, what a reader
       would notice waits for Publish. See PAGE_DRAFT_META. */
    const live = current.status === 'published';
    const pending = live ? json(current.draft_meta, {}) : null;
    let pendingTouched = false;
    const meta = (col, value) => {
      if (!pending) return set(col, value);
      pendingTouched = true;
      if (value === current[col]) delete pending[col];
      else pending[col] = value;
    };

    if (data.title !== undefined) meta('title', data.title);
    for (const key of ['lead', 'cta_label', 'cta_url', 'published_at']) {
      if (data[key] !== undefined) meta(key, data[key]);
    }
    // Writing lands in the draft and never in what is live, which is what
    // lets the editor save on every change without publishing anything.
    if (data.blocks !== undefined) set('draft_content', JSON.stringify(normalizeBlocks(data.blocks)));
    /* Subjects live in a join table rather than a column, so there is no
       value to stash - the ids wait in `draft_meta` and Publish applies them
       through the same setter the draft path uses. */
    if (data.category_ids !== undefined) {
      const ids = idList(data.category_ids);
      if (!live) this.setCategories(id, ids);
      else {
        pendingTouched = true;
        const now = (this.byId(id)?.categories || []).map((c) => c.id);
        if (ids.length === now.length && ids.every((v, i) => v === now[i])) delete pending.category_ids;
        else pending.category_ids = ids;
      }
    }
    if (data.image_id !== undefined) meta('image_id', data.image_id || null);
    if (data.status !== undefined) {
      set('status', data.status);
      // Today only for an article with no date - not one given a moment ago.
      if (data.status === 'published' && !(data.published_at ?? current.published_at)) {
        set('published_at', nowSql());
      }
    }
    if (pendingTouched) set('draft_meta', JSON.stringify(pending));
    if (!fields.length) return this.byId(id);
    set('updated_at', nowSql());
    run(`UPDATE articles SET ${fields.join(', ')} WHERE id = ?`, ...params, id);
    return this.byId(id);
  },

  remove: (id) => run('DELETE FROM articles WHERE id = ?', id).changes > 0,
  countViews: (id) => run('UPDATE articles SET views = views + 1 WHERE id = ?', id),
};

/* ------------------------------------------------------------- categories */

export const categories = {
  list: () => all(
    `SELECT c.*, u.full_name AS author_name,
            (SELECT COUNT(*) FROM article_categories ac WHERE ac.category_id = c.id) AS article_count
       FROM categories c LEFT JOIN users u ON u.id = c.created_by
      ORDER BY c.name COLLATE NOCASE`),

  /** Subjects that at least one *published* article carries - what chips offer. */
  inUse: () => all(
    `SELECT c.* FROM categories c
      WHERE EXISTS (SELECT 1 FROM article_categories ac JOIN articles a ON a.id = ac.article_id
                     WHERE ac.category_id = c.id AND a.status = 'published')
      ORDER BY c.name COLLATE NOCASE`),

  byId: (id) => get('SELECT * FROM categories WHERE id = ?', id),
  bySlug: (slug) => get('SELECT * FROM categories WHERE slug = ?', slug),

  create(name, userId) {
    const slug = uniqueSlug(slugify(name, 'kategori'), (c) => !!get('SELECT 1 FROM categories WHERE slug = ?', c));
    const info = run('INSERT INTO categories (name, slug, created_by) VALUES (?,?,?)', name, slug, userId || null);
    return this.byId(info.lastInsertRowid);
  },

  update(id, name) {
    run('UPDATE categories SET name = ? WHERE id = ?', name, id);
    return this.byId(id);
  },

  /**
   * Optionally move articles to `replacementId` before deleting.
   *
   * OR IGNORE because an article can already carry the replacement - it has
   * several subjects now, so "move Produktion to Forskning" can meet an
   * article filed under both. That row is simply dropped by the cascade, and
   * the article keeps the one copy it should have.
   */
  remove(id, replacementId = null) {
    if (replacementId && replacementId !== id) {
      run('UPDATE OR IGNORE article_categories SET category_id = ? WHERE category_id = ?', replacementId, id);
    }
    return run('DELETE FROM categories WHERE id = ?', id).changes > 0;
  },
};

/* ------------------------------------------------------------------ media */

export const media = {
  list({ search = '', limit = 0, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (search) {
      where.push('(original_name LIKE ? OR caption LIKE ? OR alt LIKE ? OR mime LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    return all(
      `SELECT * FROM media ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY created_at DESC, id DESC
        ${limit ? `LIMIT ${Number(limit)} OFFSET ${Number(offset)}` : ''}`, ...params);
  },

  count: (search = '') => get(
    `SELECT COUNT(*) AS n FROM media
      ${search ? 'WHERE original_name LIKE ? OR caption LIKE ? OR alt LIKE ? OR mime LIKE ?' : ''}`,
    ...(search ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`] : [])).n,

  byId: (id) => get('SELECT * FROM media WHERE id = ?', id),
  byIds(ids) {
    const list = [...new Set((ids || []).filter(Boolean))];
    if (!list.length) return new Map();
    const rows = all(`SELECT * FROM media WHERE id IN (${list.map(() => '?').join(',')})`, ...list);
    return new Map(rows.map((r) => [r.id, r]));
  },

  create(data, userId) {
    const info = run(
      `INSERT INTO media (filename, original_name, mime, bytes, width, height, alt, caption,
                          source_filename, source_bytes, variants, fallback_filename, fallback_bytes,
                          uploaded_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      data.filename, data.original_name, data.mime, data.bytes || 0,
      data.width ?? null, data.height ?? null, data.alt || '', data.caption || '',
      data.source_filename || '', data.source_bytes || 0, data.variants || '',
      data.fallback_filename || '', data.fallback_bytes || 0, userId || null);
    return this.byId(info.lastInsertRowid);
  },

  update(id, data) {
    const fields = [];
    const params = [];
    for (const key of ['alt', 'caption', 'filename', 'original_name', 'mime', 'bytes', 'width', 'height',
      'source_filename', 'source_bytes', 'variants', 'fallback_filename', 'fallback_bytes']) {
      if (data[key] !== undefined) { fields.push(`${key} = ?`); params.push(data[key]); }
    }
    if (fields.length) run(`UPDATE media SET ${fields.join(', ')} WHERE id = ?`, ...params, id);
    return this.byId(id);
  },

  remove(id) {
    const row = this.byId(id);
    if (!row) return false;
    // Takes the WebP variants, the fallback and the archived original with it.
    removeMediaFiles(row);
    return run('DELETE FROM media WHERE id = ?', id).changes > 0;
  },

  /** Where a media item is referenced, so deleting can warn first. */
  usage(id) {
    const used = [];
    for (const page of all('SELECT id, title, content, og_image_id FROM pages')) {
      const blocks = normalizeBlocks(json(page.content, []));
      const hit = page.og_image_id === id
        || [...walkObjects(blocks)].some((obj) => obj.props?.media === id);
      if (hit) used.push({ kind: 'page', id: page.id, title: page.title });
    }
    for (const a of all('SELECT id, title FROM articles WHERE image_id = ?', id)) {
      used.push({ kind: 'article', id: a.id, title: a.title });
    }
    return used;
  },
};

/* ----------------------------------------------------------------- slices */

export const slices = {
  list: () => all(
    `SELECT s.*, u.full_name AS author_name FROM slices s
       LEFT JOIN users u ON u.id = s.created_by ORDER BY s.name COLLATE NOCASE`),

  byId(id) {
    const row = get('SELECT * FROM slices WHERE id = ?', id);
    return row && { ...row, definition: sliceDefinition(json(row.definition, {})) };
  },

  create(name, definition, userId) {
    const info = run('INSERT INTO slices (name, definition, created_by) VALUES (?,?,?)',
      name, JSON.stringify(sliceDefinition(definition)), userId || null);
    return this.byId(info.lastInsertRowid);
  },

  update(id, name, definition) {
    run('UPDATE slices SET name = ?, definition = ?, updated_at = ? WHERE id = ?',
      name, JSON.stringify(sliceDefinition(definition)), nowSql(), id);
    return this.byId(id);
  },

  remove: (id) => run('DELETE FROM slices WHERE id = ?', id).changes > 0,

  /** Pages that currently embed this slice. */
  usage(id) {
    return all('SELECT id, title, content FROM pages').filter((p) =>
      normalizeBlocks(json(p.content, [])).some((b) => b.sliceId === id))
      .map((p) => ({ id: p.id, title: p.title }));
  },
};

/* -------------------------------------------------------------- templates */

/**
 * A page template is a saved page: its type and its slices, content and all.
 *
 * It used to be a name attached to a frame, which meant two templates could
 * differ in nothing but their name and produce two identical choices in the
 * editor. The frame is a page's own property now, and this is the library -
 * seeded with nothing and filled from real pages, exactly like slices.
 */
export const templates = {
  list: () => all(`SELECT id, name, slug, page_type, created_at, definition
                     FROM templates ORDER BY name COLLATE NOCASE`)
    .map((row) => ({ ...row, blockCount: normalizeBlocks(json(row.definition, [])).length })),

  byId(id) {
    const row = get('SELECT * FROM templates WHERE id = ?', id);
    return row && { ...row, blocks: normalizeBlocks(json(row.definition, [])) };
  },

  bySlug: (slug) => get('SELECT * FROM templates WHERE slug = ?', slug),

  /** Save a page as a template. Blocks are re-normalised, never trusted raw. */
  create(name, { pageType = 'default', blocks = [] } = {}) {
    const slug = uniqueSlug(slugify(name, 'mall'), (c) => !!get('SELECT 1 FROM templates WHERE slug = ?', c));
    const info = run('INSERT INTO templates (name, slug, page_type, definition) VALUES (?,?,?,?)',
      name, slug, PAGE_TYPES.includes(pageType) ? pageType : 'default',
      JSON.stringify(normalizeBlocks(blocks)));
    return this.byId(info.lastInsertRowid);
  },

  update(id, data) {
    const fields = [];
    const params = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.page_type !== undefined && PAGE_TYPES.includes(data.page_type)) {
      fields.push('page_type = ?'); params.push(data.page_type);
    }
    if (data.blocks !== undefined) {
      fields.push('definition = ?'); params.push(JSON.stringify(normalizeBlocks(data.blocks)));
    }
    if (fields.length) run(`UPDATE templates SET ${fields.join(', ')} WHERE id = ?`, ...params, id);
    return this.byId(id);
  },

  remove: (id) => run('DELETE FROM templates WHERE id = ?', id).changes > 0,
};

/* ------------------------------------------------------------------ menus */

/**
 * Normalise a menu tree: max two levels of nesting below the top (Frame 4.7).
 *
 * An item that names a page follows it. `pageId` has been carried through the
 * shape all along and nothing ever wrote one, so a menu stored a path - and
 * moving a page left every menu pointing at where it used to be. Silently,
 * because a stored string cannot tell you it has gone stale.
 *
 * The address is resolved here rather than at each of the six places that
 * render a link, so `href` stays the one thing a renderer reads and `isActive`
 * keeps comparing what it already compares. `anchor` rides alongside, because
 * an item can point at a section of a page and the section outlives the move.
 *
 * A custom link has no `pageId` and is left exactly as typed. A `pageId` whose
 * page has been deleted falls back to the stored path, which is what it was
 * before any of this - a link to a page that is not there.
 */
export function normalizeMenuTree(nodes, depth = 0) {
  if (!Array.isArray(nodes)) return [];
  return nodes.slice(0, 100).map((node) => {
    const pageId = Number.parseInt(node?.pageId, 10);
    const id = Number.isFinite(pageId) && pageId > 0 ? pageId : null;
    const anchor = anchorSlug(node?.anchor ?? '');
    const target = id ? get('SELECT permalink FROM pages WHERE id = ?', id) : null;
    const item = {
      label: String(node?.label ?? '').slice(0, 120),
      href: target
        ? `${target.permalink}${anchor ? `#${anchor}` : ''}`
        : String(node?.href ?? '').slice(0, 500),
      pageId: id,
      anchor,
      children: depth < 2 ? normalizeMenuTree(node?.children, depth + 1) : [],
    };
    return item;
  }).filter((n) => n.label);
}

/**
 * Forms.
 *
 * One row per form, and pages point at it. `content` is blocks, exactly as a
 * page stores them, so the same canvas writes it and the same renderer draws
 * it - a form is not a new kind of document, it is a short one with a
 * destination.
 *
 * Saved outright rather than draft-then-publish. A menu earns that pair
 * because it is composed over sittings and is dangerous half-finished; a form
 * is a handful of fields on one screen, closer to Settings, which also saves
 * when you press save.
 */
export const forms = {
  /**
   * A form is a *set*, not a document.
   *
   * Its content was blocks - the same stack of slices a page is - which
   * brought a whole level of layout with it: a background, a padding, a
   * container width, on something that is a list of fields. It also meant a
   * placed form was always a full-width band, so one could never sit tightly
   * inside a card or a table cell.
   *
   * A flat, ordered list of objects instead. Two fields side by side is a
   * field set to half width, which already existed and is exactly as much
   * layout as a form should own.
   */
  hydrate: (row) => row && {
    ...row,
    objects: normalizeObjects(json(row.content, [])),
    outline: !!row.outline,
  },

  list() { return all('SELECT * FROM forms ORDER BY name COLLATE NOCASE').map((r) => this.hydrate(r)); },
  byId(id) { return this.hydrate(get('SELECT * FROM forms WHERE id = ?', Number(id) || 0)); },

  create(name) {
    const info = run('INSERT INTO forms (name) VALUES (?)', String(name || '').trim() || 'Nytt formulär');
    return this.byId(info.lastInsertRowid);
  },

  update(id, data) {
    const fields = [];
    const params = [];
    const set = (column, value) => { fields.push(`${column} = ?`); params.push(value); };

    if (data.name !== undefined) set('name', String(data.name).trim() || 'Nytt formulär');
    if (data.objects !== undefined) set('content', JSON.stringify(normalizeObjects(data.objects)));
    if (data.recipient !== undefined) set('recipient', String(data.recipient).trim());
    if (data.subject !== undefined) set('subject', String(data.subject).trim());
    if (data.success_message !== undefined) set('success_message', String(data.success_message).trim());
    if (data.submit_label !== undefined) set('submit_label', String(data.submit_label).trim());
    if (data.colour !== undefined) set('colour', themeColour(data.colour));
    if (data.outline !== undefined) set('outline', data.outline ? 1 : 0);
    if (data.button_size !== undefined) {
      set('button_size', BUTTON_SIZES.includes(data.button_size) ? data.button_size : 'medium');
    }
    if (!fields.length) return this.byId(id);
    set('updated_at', nowSql());
    run(`UPDATE forms SET ${fields.join(', ')} WHERE id = ?`, ...params, Number(id) || 0);
    return this.byId(id);
  },

  remove: (id) => run('DELETE FROM forms WHERE id = ?', Number(id) || 0).changes > 0,

  /**
   * The pages carrying this form.
   *
   * Asked before a form is deleted, so the answer is "three pages will lose
   * their form" rather than three pages silently losing it.
   */
  usage(id) {
    const wanted = Number(id) || 0;
    return all("SELECT id, title, permalink, content, draft_content FROM pages")
      .filter((page) => [...walkObjects(normalizeBlocks(json(page.draft_content ?? page.content, [])))]
        .some((obj) => obj.kind === 'form' && obj.props?.formId === wanted))
      .map((page) => ({ id: page.id, title: page.title, permalink: page.permalink }));
  },

  /** Every form a page needs, by id, so the renderer never reads the database. */
  mapFor(blocks) {
    const wanted = [...walkObjects(blocks)]
      .filter((obj) => obj.kind === 'form' && obj.props?.formId)
      .map((obj) => obj.props.formId);
    const out = new Map();
    for (const id of new Set(wanted)) {
      const form = this.byId(id);
      if (form) out.set(id, form);
    }
    return out;
  },
};

export const menus = {
  list: () => all('SELECT * FROM menus ORDER BY is_main DESC, name COLLATE NOCASE'),

  hydrate(row) {
    return row && {
      ...row,
      draftTree: normalizeMenuTree(json(row.draft, [])),
      publishedTree: normalizeMenuTree(json(row.published, [])),
      dirty: (row.published ?? null) !== (row.draft ?? null),
    };
  },

  byId(id) { return this.hydrate(get('SELECT * FROM menus WHERE id = ?', id)); },
  byName(name) { return this.hydrate(get('SELECT * FROM menus WHERE name = ? COLLATE NOCASE', name)); },
  main() { return this.hydrate(get('SELECT * FROM menus WHERE is_main = 1 LIMIT 1')); },
  allHydrated() { return this.list().map((m) => this.hydrate(m)); },

  create(name, tree = []) {
    const info = run('INSERT INTO menus (name, draft) VALUES (?,?)',
      name || 'Ny meny', JSON.stringify(normalizeMenuTree(tree)));
    return this.byId(info.lastInsertRowid);
  },

  saveDraft(id, tree, name) {
    const fields = ['draft = ?', 'updated_at = ?'];
    const params = [JSON.stringify(normalizeMenuTree(tree)), nowSql()];
    if (name !== undefined) { fields.splice(1, 0, 'name = ?'); params.splice(1, 0, name); }
    run(`UPDATE menus SET ${fields.join(', ')} WHERE id = ?`, ...params, id);
    return this.byId(id);
  },

  publish(id) {
    const row = get('SELECT draft FROM menus WHERE id = ?', id);
    if (!row) return null;
    run('UPDATE menus SET published = ?, updated_at = ? WHERE id = ?', row.draft, nowSql(), id);
    return this.byId(id);
  },

  /** Only one main menu may exist at a time (Frame 4.7). */
  setMain(id) {
    run('UPDATE menus SET is_main = 0');
    run('UPDATE menus SET is_main = 1 WHERE id = ?', id);
    return this.byId(id);
  },

  duplicate(id) {
    const src = get('SELECT * FROM menus WHERE id = ?', id);
    if (!src) return null;
    const info = run('INSERT INTO menus (name, draft) VALUES (?,?)', `${src.name} (kopia)`, src.draft);
    return this.byId(info.lastInsertRowid);
  },

  remove: (id) => run('DELETE FROM menus WHERE id = ?', id).changes > 0,
};

/* ------------------------------------------------------------------ users */

export const users = {
  list: () => all(
    `SELECT u.*, m.filename AS image_filename FROM users u
       LEFT JOIN media m ON m.id = u.image_id
      ORDER BY u.full_name COLLATE NOCASE, u.email`),

  byId: (id) => get(
    `SELECT u.*, m.filename AS image_filename FROM users u
       LEFT JOIN media m ON m.id = u.image_id WHERE u.id = ?`, id),

  byEmail: (email) => get('SELECT * FROM users WHERE email = ? COLLATE NOCASE', email),

  create(data) {
    const info = run(
      `INSERT INTO users (full_name, email, phone, role, country, address, zip, city)
       VALUES (?,?,?,?,?,?,?,?)`,
      data.full_name || '', String(data.email || '').toLowerCase(), data.phone || '',
      data.role || 'visitor', data.country || 'SE', data.address || '', data.zip || '', data.city || '');
    return this.byId(info.lastInsertRowid);
  },

  update(id, data) {
    const fields = [];
    const params = [];
    for (const key of ['full_name', 'email', 'phone', 'role', 'country', 'address', 'zip', 'city', 'image_id']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(key === 'email' ? String(data[key]).toLowerCase() : data[key]);
      }
    }
    if (fields.length) run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, ...params, id);
    return this.byId(id);
  },

  /** Store a hash made by src/lib/password.js; '' clears the password. */
  setPasswordHash: (id, hash) => run('UPDATE users SET password_hash = ? WHERE id = ?', hash, id),

  remove: (id) => run('DELETE FROM users WHERE id = ?', id).changes > 0,
};

/* --------------------------------------------------------------- messages */

export const messages = {
  create: (data) => run(
    `INSERT INTO messages (subject, from_email, body, page, form_id, delivered)
     VALUES (?,?,?,?,?,?)`,
    data.subject, data.from_email, data.body, data.page || '',
    Number(data.form_id) || null, data.delivered ? 1 : 0),
  list: (limit = 50) => all(`SELECT * FROM messages ORDER BY created_at DESC LIMIT ${Number(limit)}`),
};
