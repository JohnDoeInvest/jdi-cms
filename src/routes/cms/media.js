import { html, redirect, parseForm, json } from '../../lib/http.js';
import { esc } from '../../lib/html.js';
import { icon } from '../../views/icons.js';
import { cmsLayout, cmsHead } from '../../views/cms/layout.js';
import { field, emptyState, mediaThumb } from '../../views/cms/parts.js';
import { media } from '../../models.js';
import { config } from '../../config.js';
import {
  storeUpload, replaceUpload, mediaUrl, kindOf, uploadLimit, mimeMatchesBytes,
  srcsetFor, variantAtLeast, parseVariants, imagesAvailable,
} from '../../lib/media.js';
import { formatBytes, formatDate } from '../../views/helpers.js';

const PAGE_SIZE = 24;

export function mediaCard(item, { selectable = false } = {}) {
  const kind = kindOf(item.mime);
  // The grid shows ~180px tiles, so it takes the narrowest variant that covers
  // a 2x display rather than the full-size image.
  const thumb = variantAtLeast(item, 400);
  const preview = kind === 'image'
    ? `<img src="${esc(mediaUrl(thumb?.filename || item.filename))}" alt="${esc(item.alt || '')}" loading="lazy">`
    : icon(kind === 'video' ? 'video' : kind === 'pdf' ? 'pdf' : 'file', 34);

  return `<article class="media-item" data-media-id="${item.id}"
      data-url="${esc(mediaUrl(item.filename))}" data-kind="${esc(kind)}"
      data-name="${esc(item.original_name)}" tabindex="0" role="button"
      aria-label="${esc(item.original_name)}">
    <div class="media-item__preview">${preview}</div>
    <div class="media-item__tools">
      <button class="icon-btn" type="button" title="Copy permalink"
              data-copy="${esc(config.siteUrl + mediaUrl(item.filename))}">${icon('copy', 15)}</button>
      ${selectable ? '' : `<button class="icon-btn icon-btn--danger" type="button" title="Delete"
              data-delete-media="${item.id}">${icon('trash', 15)}</button>`}
    </div>
    <div class="media-item__name truncate" title="${esc(item.original_name)}">${esc(item.original_name)}</div>
    <div class="media-item__meta">${item.width && item.height
      ? `${item.width}&times;${item.height}` : esc(item.mime.split('/')[1] || '')} &middot; ${esc(formatBytes(item.bytes))}${
      savingPercent(item) ? ` <span class="media-item__saving">&minus;${savingPercent(item)}%</span>` : ''}</div>
    ${item.caption ? `<div class="media-item__meta truncate">${esc(item.caption)}</div>` : ''}
  </article>`;
}

/** Frames 4.8 + 5.2 - the media library and its Properties pane. */
export function registerMedia(router, guard) {
  router.get('/cms/media', guard((req, res, { user, url }) => {
    const search = url.searchParams.get('q') || '';
    const refused = (url.searchParams.get('refused') || '').slice(0, 400);
    const list = media.list({ search, limit: PAGE_SIZE });
    const total = media.count(search);
    const editing = media.byId(Number(url.searchParams.get('edit')));

    const center = `
      ${cmsHead('Media library', `
        <div class="field" style="max-width:260px">
          <input type="search" name="q" value="${esc(search)}" placeholder="Search filename, caption, type"
                 data-media-search autocomplete="off">
        </div>
        <button class="btn btn--primary" type="button" data-upload-trigger>${icon('upload', 17)} Add media</button>`)}
      <hr class="rule">
      <form id="upload-form" method="post" action="/cms/media/upload" enctype="multipart/form-data" hidden>
        <input type="file" name="files" multiple data-upload-input
               accept="image/*,video/*,application/pdf">
      </form>
      ${refused ? `<div class="notice notice--warn" style="margin-bottom:var(--ui-s-5)">
        <strong>Not added:</strong> ${esc(refused)}
      </div>` : ''}
      ${imagesAvailable() ? '' : `<div class="notice notice--warn" style="margin-bottom:var(--ui-s-5)">
        <strong>Image conversion is off.</strong> sharp could not be loaded, so uploads are stored as they arrive.
        Run <code>npm install</code> and restart the server.
      </div>`}
      <div class="dropzone" data-dropzone style="margin-bottom:var(--ui-s-5)">
        ${icon('upload', 24)}
        <p style="margin:var(--ui-s-2) 0 0">Drop files here, or
          <button class="linkish" type="button" data-upload-trigger>choose from your computer</button>.</p>
        <p class="tiny muted" style="margin:4px 0 0">Images and PDF up to
          ${formatBytes(config.uploads.maxBytes)}, video up to
          ${formatBytes(config.uploads.maxVideoBytes)}.</p>
      </div>
      <div class="media-grid" data-media-grid data-total="${total}">
        ${list.length ? list.map((m) => mediaCard(m)).join('') : ''}
      </div>
      ${list.length ? '' : emptyState(search ? 'No matches.' : 'No files yet. Upload something.')}
      ${total > PAGE_SIZE ? `<div class="row" style="justify-content:center;margin-top:var(--ui-s-5)">
        <button class="btn" type="button" data-load-more data-offset="${PAGE_SIZE}">Show more</button></div>` : ''}`;

    const right = editing ? mediaProperties(editing) : `
      <h2 class="h-tool" style="margin-bottom:var(--ui-s-4)">Properties</h2>
      <p class="muted small">Select a file to view and edit its properties.</p>`;

    html(res, cmsLayout({ title: 'Media library', user, path: '/cms/media', center, right,
      data: { page: 'media', search } }));
  }));

  router.post('/cms/media/upload', guard(async (req, res, { user }) => {
    const { files } = await parseForm(req);
    const created = [];
    /* A refused file used to be skipped in silence, so a video two megabytes
       over the line simply never appeared and there was nothing to read about
       why. Every refusal now carries its reason back. */
    const refused = [];

    for (const file of files) {
      if (!config.uploads.allowed.has(file.mime)) {
        refused.push({ name: file.filename, why: 'type', detail: file.mime });
        continue;
      }
      /* The declared type got it into the allowlist; the bytes have to agree
         before it is written into the web root under that name. */
      if (!mimeMatchesBytes(file.mime, file.data)) {
        refused.push({
          name: file.filename,
          why: 'type',
          detail: `not really ${file.mime}`,
        });
        continue;
      }
      const limit = uploadLimit(file.mime);
      if (file.data.length > limit) {
        refused.push({
          name: file.filename,
          why: 'size',
          detail: `${formatBytes(file.data.length)} — the limit is ${formatBytes(limit)}`,
        });
        continue;
      }
      // storeUpload decides whether this file becomes WebP; `stored` already
      // carries the right filename, mime, bytes, dimensions and variant list.
      const stored = await storeUpload(file);
      created.push(media.create({ ...stored, original_name: file.filename }, user.id));
    }

    if ((req.headers.accept || '').includes('application/json')) {
      return json(res, { items: created.map(publicMedia), refused });
    }
    // A redirect carries no body, so the reason travels in the query and the
    // library reads it back out.
    const note = refused.length
      ? `refused=${encodeURIComponent(refused.slice(0, 4).map((r) => `${r.name} (${r.detail})`).join(' · '))}`
      : '';
    const first = created.length ? `edit=${created[0].id}` : '';
    const query = [first, note].filter(Boolean).join('&');
    redirect(res, `/cms/media${query ? `?${query}` : ''}`);
  }, 'editor'));

  router.post('/cms/media/:id', guard(async (req, res, { params }) => {
    const { fields, files } = await parseForm(req);
    const id = Number(params.id);
    const item = media.byId(id);
    if (!item) return redirect(res, '/cms/media');

    // "Replace media" keeps the id and every reference to it intact.
    const upload = files.find((f) => f.field === 'replacement');
    // The replacement path is the same door as the upload path, so it asks
    // the bytes the same question.
    if (upload && config.uploads.allowed.has(upload.mime) && mimeMatchesBytes(upload.mime, upload.data)) {
      // Passing the row, not just the filename, so the previous variants and
      // archived original are removed along with the file being replaced.
      const stored = await replaceUpload(item, upload);
      media.update(id, { ...stored, original_name: upload.filename });
    }
    media.update(id, { alt: String(fields.alt ?? ''), caption: String(fields.caption ?? '') });
    redirect(res, `/cms/media?edit=${id}`);
  }, 'editor'));

  router.post('/cms/media/:id/delete', guard(async (req, res, { params }) => {
    media.remove(Number(params.id));
    redirect(res, '/cms/media');
  }, 'editor'));

  /* --- JSON endpoints used by the picker dialogue and infinite scroll --- */

  router.get('/cms/api/media', guard((req, res, { url }) => {
    const search = url.searchParams.get('q') || '';
    const offset = Number(url.searchParams.get('offset')) || 0;
    const list = media.list({ search, limit: PAGE_SIZE, offset });
    json(res, { items: list.map(publicMedia), total: media.count(search), offset, pageSize: PAGE_SIZE });
  }));

  router.get('/cms/api/media/:id/usage', guard((req, res, { params }) => {
    const id = Number(params.id);
    const item = media.byId(id);
    if (!item) return json(res, { error: 'That file does not exist' }, 404);
    json(res, { item: publicMedia(item), usage: media.usage(id) });
  }));
}

export const publicMedia = (m) => ({
  id: m.id,
  url: mediaUrl(m.filename),
  permalink: config.siteUrl + mediaUrl(m.filename),
  // A small variant for grids and pickers, and the full set for anything that
  // renders the image at a real size.
  thumb: mediaUrl(variantAtLeast(m, 400)?.filename || m.filename),
  srcset: srcsetFor(m),
  name: m.original_name,
  mime: m.mime,
  kind: kindOf(m.mime),
  width: m.width,
  height: m.height,
  bytes: m.bytes,
  alt: m.alt,
  caption: m.caption,
});

/** How much smaller the served WebP is than the upload it came from, or 0. */
export function savingPercent(m) {
  if (!m?.source_bytes || !m.bytes || m.bytes >= m.source_bytes) return 0;
  return Math.round((1 - m.bytes / m.source_bytes) * 100);
}

/**
 * What conversion did to this file: the saving, the widths now available, the
 * fallback for browsers without WebP, and a way back to the untouched upload.
 * Silent for anything neither converted nor given a fallback.
 */
function conversionSummary(item) {
  const variants = parseVariants(item);
  const fallback = item.fallback_filename
    ? `<a class="tiny textlink" href="${esc(mediaUrl(item.fallback_filename))}" target="_blank"
        rel="noopener">Fallback ${esc(item.fallback_filename.split('.').pop().toUpperCase())},
        ${esc(formatBytes(item.fallback_bytes))} &rarr;</a>`
    : '';
  // Uploaded as WebP or AVIF: served as it came, and only the fallback is new.
  if (!variants.length) return fallback ? `<div class="conversion-note">${fallback}</div>` : '';
  const saving = savingPercent(item);
  const widths = variants.map((v) => `${v.width}w`).join(' · ');
  return `<div class="conversion-note">
    <div class="spread">
      <span class="tiny">Converted to WebP</span>
      ${saving ? `<span class="tiny conversion-note__saving">${esc(formatBytes(item.source_bytes))}
        &rarr; ${esc(formatBytes(item.bytes))} (&minus;${saving}%)</span>` : ''}
    </div>
    <div class="tiny muted">Served at ${esc(widths)}</div>
    ${fallback}
    ${item.source_filename ? `<a class="tiny textlink" href="${esc(mediaUrl(item.source_filename))}"
        target="_blank" rel="noopener">Original kept &rarr;</a>` : ''}
  </div>`;
}

function mediaProperties(item) {
  const kind = kindOf(item.mime);
  const url = mediaUrl(item.filename);
  const permalink = config.siteUrl + url;
  return `<h2 class="h-tool" style="margin-bottom:var(--ui-s-5)">Properties</h2>
  <form class="stack" method="post" action="/cms/media/${item.id}" enctype="multipart/form-data">
    <div class="media-preview-frame">
      ${kind === 'image' ? `<img src="${esc(url)}" alt="${esc(item.alt)}">`
        : kind === 'video' ? `<video controls src="${esc(url)}" style="width:100%"></video>`
        : `<a class="row" href="${esc(url)}" target="_blank" rel="noopener" style="padding:var(--ui-s-5)">
             ${icon(kind === 'pdf' ? 'pdf' : 'file', 26)}<span class="small">Open file</span></a>`}
    </div>
    <div class="spread">
      <span class="small truncate" title="${esc(item.original_name)}">${esc(item.original_name)}</span>
      <span class="tiny muted">${item.width && item.height ? `${item.width}×${item.height}` : esc(item.mime)}</span>
    </div>
    ${conversionSummary(item)}
    <div class="spread">
      <span class="tiny muted truncate" title="${esc(permalink)}">${esc(url)}</span>
      <button class="icon-btn" type="button" title="Copy permalink" data-copy="${esc(permalink)}">${icon('copy', 15)}</button>
    </div>
    <div class="spread"><span class="tiny muted">Uploaded ${esc(formatDate(item.created_at))}</span>
      <span class="tiny muted">${esc(formatBytes(item.bytes))}</span></div>
    ${field({ label: 'Alt text', name: 'alt', value: item.alt, hint: 'Describes the image for screen readers and search engines.' })}
    ${field({ label: 'Caption', name: 'caption', value: item.caption, hint: 'Can be overridden wherever the image is used.' })}
    <hr class="rule" style="margin:var(--ui-s-2) 0">
    <div class="stack-sm">
      <label class="btn btn--full" style="cursor:pointer">
        Replace media
        <input type="file" name="replacement" hidden accept="image/*,video/*,application/pdf"
               onchange="this.form.requestSubmit()">
      </label>
      <span class="field__hint">Keeps the same ID and updates the file everywhere it is used.</span>
    </div>
    <div class="row" style="justify-content:space-between;margin-top:var(--ui-s-2)">
      <button class="btn btn--primary" type="submit">Save</button>
      <button class="btn btn--danger" type="button" data-delete-media="${item.id}">Delete</button>
    </div>
  </form>`;
}
