import { esc, cls, attrs, joinHtml } from '../../lib/html.js';
import { icon } from '../icons.js';
import { formatBytes, relativeDate, scheduleDate } from '../helpers.js';
import { mediaUrl, kindOf } from '../../lib/media.js';
import { serializeCookie } from '../../lib/http.js';
import { pages } from '../../models.js';

/* --------------------------------------------------------------- links */

/**
 * The link targets a menu item can point at: every page, and under each one
 * any section of it that carries an anchor.
 *
 * Built once and used by both the rows rendered here and the rows the editor
 * adds in the browser - the two used to build their own lists, so a target
 * offered by one was missing from the other.
 */
export function linkOptions(pageList) {
  return pageList.map((p) => {
    /* Named by what the section reads as, not by its anchor: the anchor is
       what the link stores and never changes, which is exactly why nobody
       needs to look at it. The id shows only when there is no text to use.

       `data-page` is what a menu item stores, so the link follows the page
       when it moves rather than remembering where it used to be. The value
       stays the address: it is what the select matches on when a saved menu
       is loaded back, and what a custom link would have held anyway. */
    const anchors = pages.anchors(p).map((a) =>
      `<option value="${esc(p.permalink)}#${esc(a.id)}" data-page="${p.id}" data-anchor="${esc(a.id)}"
        >&nbsp;&nbsp;&#9492; ${esc(a.label)}</option>`);
    return `<option value="${esc(p.permalink)}" data-page="${p.id}">${esc(p.title)}</option>${anchors.join('')}`;
  }).join('');
}

/* -------------------------------------------------------------- fields */

export function field({ label, name, value = '', type = 'text', hint = '', placeholder = '',
  required = false, disabled = false, id = null, autofocus = false, extra = '' }) {
  const fieldId = id || `f-${name}`;
  return `<div class="field">
    ${label ? `<label for="${esc(fieldId)}">${esc(label)}</label>` : ''}
    <input${attrs({ id: fieldId, name, type, value, placeholder, required, disabled, autofocus })}${extra ? ' ' + extra : ''}>
    ${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}
  </div>`;
}

export function textarea({ label, name, value = '', rows = 4, hint = '', placeholder = '', id = null, extra = '' }) {
  const fieldId = id || `f-${name}`;
  return `<div class="field">
    ${label ? `<label for="${esc(fieldId)}">${esc(label)}</label>` : ''}
    <textarea${attrs({ id: fieldId, name, rows, placeholder })}${extra ? ' ' + extra : ''}>${esc(value)}</textarea>
    ${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}
  </div>`;
}

export function select({ label, name, value = '', options = [], hint = '', id = null,
  placeholder = null, disabled = false, extra = '' }) {
  const fieldId = id || `f-${name}`;
  const opts = [
    ...(placeholder ? [{ value: '', label: placeholder }] : []),
    ...options,
  ].map((option) =>
    `<option${attrs({ value: option.value, selected: String(option.value) === String(value ?? '') })}>${esc(option.label)}</option>`);
  return `<div class="field">
    ${label ? `<label for="${esc(fieldId)}">${esc(label)}</label>` : ''}
    <select${attrs({ id: fieldId, name, disabled })}${extra ? ' ' + extra : ''}>${opts.join('')}</select>
    ${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}
  </div>`;
}

export function checkbox({ label, name, checked = false, hint = '', id = null, value = '1', extra = '' }) {
  const fieldId = id || `f-${name}`;
  return `<div class="field">
    <label class="check" for="${esc(fieldId)}">
      <input type="checkbox"${attrs({ id: fieldId, name, value, checked })}${extra ? ' ' + extra : ''}>
      <span>${esc(label)}</span>
    </label>
    ${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}
  </div>`;
}

/**
 * A set of checkboxes under one label, posting as `name[]`.
 *
 * Used where a thing belongs to several others at once - an article's
 * subjects - which a `<select multiple>` states badly: it hides what is
 * chosen behind a scroll and gives no clue that more than one is allowed.
 */
export function checkboxGroup({ label, name, options = [], values = [], hint = '', extra = '' }) {
  const chosen = new Set((values || []).map(String));
  return `<div class="field">
    ${label ? `<span class="label">${esc(label)}</span>` : ''}
    <div class="check-grid">
      ${options.map((option) => `<label class="check">
        <input type="checkbox"${attrs({ name: `${name}[]`, value: option.value,
          checked: chosen.has(String(option.value)) })}${extra ? ' ' + extra : ''}>
        <span>${esc(option.label)}</span></label>`).join('')}
    </div>
    ${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}
  </div>`;
}

/** When a schedule goes out, as a phrase: "tomorrow at 08:00". */
export const scheduleWhen = (at) => {
  const when = scheduleDate(at);
  return when ? `${when.day} at ${when.time}` : '';
};

/**
 * The action bar's own line while something is scheduled.
 *
 * It says when, and - once the draft has moved on - that the latest edits
 * are not in what goes out, with the one click that puts them in. Discard,
 * beside it, is the other answer to the same question.
 */
const scheduleLine = ({ status, schedule }) => `${icon('clock', 16)}
  <span>${status === 'published' ? 'Changes go live' : 'Goes live'} ${esc(scheduleWhen(schedule.at))}${
    schedule.edited
      ? `, without the latest edits.
         <button class="linkish" type="button" data-schedule-refresh="${esc(schedule.at)}">Include them</button>`
      : '.'}</span>`;

/**
 * The editor's action bar.
 *
 * Which buttons belong here is the server's answer - a live document offers
 * Discard, Unpublish and Publish changes; a draft offers only Publish. It is
 * built here rather than in the route so the API that swaps it after a
 * publish returns exactly what the route would have rendered.
 *
 * Schedule sits beside Publish, since it is Publish at a later time. On a
 * live document it shows only once there is something to put out. While a
 * schedule is waiting, Publish says "now" - it overtakes the schedule - and
 * Discard goes back to the scheduled copy rather than to what is live.
 */
export const editorActions = ({ status, hasDraftChanges = false, schedule = null }) => {
  const live = status === 'published';
  const discardable = schedule ? schedule.edited : live && hasDraftChanges;
  const hideSchedule = !schedule && live && !hasDraftChanges;
  return `
  <span class="cms-actions__status${schedule ? ' cms-actions__status--scheduled' : ''}">${
    schedule ? scheduleLine({ status, schedule }) : ''}</span>
  ${live || schedule
    ? `<button class="btn" type="button" data-discard="${schedule ? 'scheduled' : 'live'}"${
      discardable ? '' : ' hidden'}>Discard changes</button>` : ''}
  ${live ? '<button class="btn" type="button" data-save="draft">Unpublish</button>' : ''}
  <button class="btn" type="button" data-schedule${schedule ? ` data-at="${esc(schedule.at)}"` : ''}${
    hideSchedule ? ' hidden' : ''}>${icon('clock', 16)} ${schedule ? 'Edit schedule' : 'Schedule'}</button>
  <button class="btn btn--accent" type="button" data-save="published">${
    schedule ? 'Publish now' : live ? 'Publish changes' : 'Publish'}</button>`;
};

/**
 * Whether a document's address can move, and if not, what would free it:
 * a live one is taken down, a scheduled one has its schedule called off.
 */
export const addressState = (doc) => {
  if (doc?.status === 'published') return 'live';
  return doc?.schedule ? 'scheduled' : 'free';
};

/**
 * What the editor redraws itself from after a request: the head pill, the
 * action bar, and whether the address fields are frozen. The server decides
 * all three, so the browser never keeps a second copy of the rules.
 */
export const editorState = (doc) => ({
  ok: true,
  status: doc.status,
  permalink: doc.permalink,
  hasDraftChanges: doc.hasDraftChanges,
  savedAt: doc.updated_at,
  scheduledAt: doc.schedule?.at ?? null,
  address: addressState(doc),
  pill: statusPill(doc.status, doc.hasDraftChanges, doc.schedule),
  actions: editorActions(doc),
});

/* --------------------------------------------------------------- bits */

/**
 * Three states, not two. A live page with unpublished edits waiting is its
 * own thing, and if it looks the same as a live page the edits are only
 * findable by opening every page and looking.
 *
 * A schedule outranks both: "this changes by itself at 08:00" is what a list
 * of pages most needs to say about one. It carries a clock so the pair of
 * scheduled states reads apart from the rest at a glance.
 */
export const statusPill = (status, hasDraftChanges = false, schedule = null) => {
  if (schedule) {
    const live = status === 'published';
    return `<span class="pill pill--scheduled" title="${esc(
      `${live ? 'Changes go live' : 'Goes live'} ${scheduleWhen(schedule.at)}`)}">${
      icon('clock', 13)}${live ? 'Live · scheduled' : 'Scheduled'}</span>`;
  }
  if (status !== 'published') return '<span class="pill pill--draft">Draft</span>';
  return hasDraftChanges
    ? '<span class="pill pill--edited">Live · edited</span>'
    : '<span class="pill pill--live">Live</span>';
};

/**
 * When a scheduled document goes out, under its pill in a list - a hover
 * title is no use on a phone, and "when" is the question the pill raises.
 */
export const scheduleCell = (schedule) => {
  const when = schedule && scheduleDate(schedule.at);
  if (!when) return '';
  return `<div class="tiny muted">${esc(`${when.day.charAt(0).toUpperCase()}${when.day.slice(1)} ${when.time}`)}</div>`;
};

export const usedPill = (used, liveLabel = 'In use', idleLabel = 'Unused') => used
  ? `<span class="pill pill--live">${esc(liveLabel)}</span>`
  : `<span class="pill pill--unused">${esc(idleLabel)}</span>`;

export const searchBox = (value = '', placeholder = 'Search', name = 'q') =>
  `<div class="field grow" style="max-width:280px">
     <input type="search" name="${esc(name)}" value="${esc(value)}" placeholder="${esc(placeholder)}"
            data-live-search autocomplete="off">
   </div>`;

export const emptyState = (message, action = '') =>
  `<div class="empty"><p>${esc(message)}</p>${action}</div>`;

/** Small icon buttons used at the end of every list row. */
export const rowActions = ({ editHref, editAction, deleteAction, extra = '' }) => `
  <div class="row">
    ${extra}
    ${editHref ? `<a class="icon-btn" href="${esc(editHref)}" title="Edit" aria-label="Edit">${icon('pencil', 17)}</a>` : ''}
    ${editAction ? `<button class="icon-btn" type="button" title="Edit" aria-label="Edit" ${editAction}>${icon('pencil', 17)}</button>` : ''}
    ${deleteAction ? `<button class="icon-btn icon-btn--danger" type="button" title="Delete" aria-label="Delete" ${deleteAction}>${icon('trash', 17)}</button>` : ''}
  </div>`;

/* -------------------------------------------------------- media chips */

export function mediaThumb(item, { size = 48, className = 'dialog__subject-thumb' } = {}) {
  if (!item) return `<div class="${className}">${icon('image', Math.round(size * .45))}</div>`;
  const kind = kindOf(item.mime);
  if (kind === 'image') {
    return `<div class="${className}"><img src="${esc(mediaUrl(item.filename))}" alt=""></div>`;
  }
  return `<div class="${className}">${icon(kind === 'video' ? 'video' : kind === 'pdf' ? 'pdf' : 'file', Math.round(size * .45))}</div>`;
}

/** Image picker: preview + "choose from library" button, backed by a hidden input. */
/**
 * Image picker. The slot itself is the control — an empty one shows a plus,
 * a filled one swaps the image on click. No separate button to hunt for.
 */
export function mediaPicker({ name, item = null, label = 'Image', hint = '', extra = '' }) {
  return `<div class="field" data-media-picker data-field="${esc(name)}">
    ${label ? `<span class="label">${esc(label)}</span>` : ''}
    <div class="picker">
      <button type="button" class="picker__slot" data-pick data-preview
              title="${item ? 'Replace image' : 'Add image'}">
        ${item
          ? `<img src="${esc(mediaUrl(item.filename))}" alt="">`
          : `<span class="picker__empty">${icon('plus', 22)}</span>`}
      </button>
      <button class="picker__clear" type="button" data-clear${item ? '' : ' hidden'}
              title="Remove image" aria-label="Remove image">${icon('close', 14)}</button>
    </div>
    ${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}
    <input type="hidden" name="${esc(name)}" value="${esc(item?.id ?? '')}" data-value${extra ? ' ' + extra : ''}>
  </div>`;
}

/* ------------------------------------------------------------- tables */

export const tableWrap = (head, rows) => `
  <table class="table">
    <thead><tr>${head}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

export const dateCell = (value) => `<span class="small muted">${esc(relativeDate(value))}</span>`;

/**
 * A sortable column header.
 *
 * The sort is a link and lives in the URL, so it survives a reload, can be
 * shared, and composes with the search box already in the query string -
 * which sorting in the browser would have quietly fought with, since the
 * search reloads the page.
 *
 * Clicking the column you are already on reverses it. Arriving at a new one
 * starts at whatever reads as its natural order: A-Z for a name, newest first
 * for a date, because nobody opens a list of pages wanting the oldest.
 */
/**
 * The sort a list should open in: asked for in the URL, remembered in a
 * cookie between visits.
 *
 * A list reached from the nav rail has no query string, so without this it
 * starts over in its default order every time - and a sort is a way of
 * working, not a one-off. Remembered per list, because ordering pages by
 * what was edited last says nothing about how you want articles ordered.
 *
 * The URL still wins whenever it says anything, so a link someone sends shows
 * what the link says rather than what the reader last chose. `remember` is
 * the value to store, and is null when there is nothing new to store.
 *
 * The key is not validated here: the model allowlists what may reach ORDER
 * BY, so a stale or hand-edited cookie falls back to the list's own order
 * rather than needing a second opinion about it.
 */
export function listSort(url, cookies, name) {
  const asked = url.searchParams.get('sort');
  if (asked) {
    const dir = url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc';
    return { sort: asked, dir, remember: `${asked}:${dir}` };
  }
  const [sort = '', stored = 'asc'] = String(cookies?.[`sm_sort_${name}`] || '').split(':');
  return { sort, dir: stored === 'desc' ? 'desc' : 'asc', remember: null };
}

/** The cookie that remembers it. A year, because it is a preference. */
export const sortCookie = (name, value) =>
  serializeCookie(`sm_sort_${name}`, value, { path: '/cms', maxAge: 60 * 60 * 24 * 365 });

export function sortHeader({ label, key, sort, dir, href = '', natural = 'asc', extraClass = '' }) {
  const active = sort === key;
  const next = active && dir === natural ? (natural === 'asc' ? 'desc' : 'asc') : natural;
  const url = new URL(href || '/', 'http://x');
  url.searchParams.set('sort', key);
  url.searchParams.set('dir', next);
  const arrow = active ? (dir === 'asc' ? '&#9650;' : '&#9660;') : '';
  return `<th${extraClass ? ` class="${esc(extraClass)}"` : ''}>
    <a class="th-sort${active ? ' is-on' : ''}" href="${esc(url.pathname + url.search)}"
       aria-sort="${active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}"
       >${esc(label)}<span class="th-sort__arrow">${arrow}</span></a></th>`;
}
export const bytesCell = (value) => `<span class="small muted">${esc(formatBytes(value))}</span>`;

/* ------------------------------------------------------------ toolbar */

/** Rich-text toolbar shared by the article editor and body objects. */
/**
 * Text formatting only. Inserting objects belongs to the Blocks palette, which
 * can place them where they are wanted - a toolbar button could only append.
 *
 * `contextual` hides the bar until an editor actually has the caret, so it can
 * never look like it applies to whatever else is selected.
 */
export function richToolbar({ contextual = false } = {}) {
  const button = (cmd, name, title) =>
    `<button class="icon-btn" type="button" data-cmd="${esc(cmd)}" title="${esc(title)}" aria-label="${esc(title)}">${icon(name, 17)}</button>`;
  return `<div class="toolbar" data-toolbar${contextual ? ' data-contextual hidden' : ''}>
    ${button('h2', 'heading', 'Heading')}
    ${button('h3', 'subheading', 'Subheading')}
    ${button('ul', 'list', 'Bullet list')}
    ${button('quote', 'quote', 'Quote')}
    <span class="toolbar__sep"></span>
    ${button('bold', 'bold', 'Bold')}
    ${button('italic', 'italic', 'Italic')}
    <span class="toolbar__sep"></span>
    ${button('left', 'alignLeft', 'Align left')}
    ${button('center', 'alignCenter', 'Centre')}
    ${button('right', 'alignRight', 'Align right')}
    <span class="toolbar__sep"></span>
    ${button('link', 'link', 'Link')}
  </div>`;
}

export const richEditor = ({ name, html = '', placeholder = 'Write here…', id = 'rich' }) => `
  <div class="richtext" contenteditable="true" data-rich="${esc(name)}" id="${esc(id)}"
       data-placeholder="${esc(placeholder)}">${html}</div>
  <input type="hidden" name="${esc(name)}" value="${esc(html)}" data-rich-value="${esc(name)}">`;
