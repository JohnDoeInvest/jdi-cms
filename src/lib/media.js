import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { slugify } from './util.js';
import { imageSize, jpegOrientation } from './imagesize.js';
import { deriveVariants, displayDimensions, available } from './images.js';

// Header probing lives in its own module now; re-exported so the rest of the
// app (and the tests) keep importing it from here.
export { imageSize } from './imagesize.js';

/* ------------------------------------------------------------ file storage */

const EXT_BY_MIME = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
  'image/svg+xml': '.svg', 'image/avif': '.avif', 'video/mp4': '.mp4', 'video/webm': '.webm',
  'video/quicktime': '.mov', 'application/pdf': '.pdf',
};

/**
 * What an uploaded file actually is.
 *
 * The multipart part's Content-Type is whatever the uploader typed, and it
 * used to decide both the allowlist check and the stored extension - so a
 * file could arrive claiming to be a PNG and be written as one. `/media/`
 * carries `nosniff` and `script-src 'none'`, so nothing could execute, but
 * the font path already checks magic bytes and the two should agree.
 *
 * Returns the mime the bytes say, or null for something unrecognised. SVG is
 * the one that cannot be sniffed by a fixed signature - it is XML, and may
 * open with a declaration, a comment or whitespace - so it is matched on
 * finding an `<svg` root within the first bytes.
 */
const SIGNATURES = [
  { mime: 'image/jpeg', at: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png',  at: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/gif',  at: 0, text: 'GIF87a' },
  { mime: 'image/gif',  at: 0, text: 'GIF89a' },
  { mime: 'image/webp', at: 8, text: 'WEBP' },
  { mime: 'image/avif', at: 8, text: 'avif' },
  { mime: 'video/mp4',  at: 4, text: 'ftyp' },
  { mime: 'video/webm', at: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { mime: 'application/pdf', at: 0, text: '%PDF-' },
];

export function sniffMedia(data) {
  const buf = Buffer.from(data || []);
  for (const sig of SIGNATURES) {
    const want = sig.text ? Buffer.from(sig.text, 'latin1') : Buffer.from(sig.bytes);
    if (buf.subarray(sig.at, sig.at + want.length).equals(want)) return sig.mime;
  }
  // An SVG is text. Look for the root element rather than a fixed header, and
  // only near the start, so a stray `<svg` deep inside another file is not it.
  if (/<svg[\s>]/i.test(buf.subarray(0, 1024).toString('utf8'))) return 'image/svg+xml';
  return null;
}

/**
 * Whether the bytes agree with what the upload claimed to be.
 *
 * `video/quicktime` and `video/mp4` share the same `ftyp` header and are the
 * same container, so one answers for the other; everything else has to match
 * exactly.
 */
export function mimeMatchesBytes(claimed, data) {
  const actual = sniffMedia(data);
  if (!actual) return false;
  if (actual === claimed) return true;
  const container = (m) => (m === 'video/quicktime' ? 'video/mp4' : m);
  return container(actual) === container(claimed);
}

export const kindOf = (mime) =>
  mime === 'application/pdf' ? 'pdf'
    : mime?.startsWith('video/') ? 'video'
      : mime?.startsWith('image/') ? 'image' : 'file';

/**
 * Write an uploaded buffer into www/media under a safe, unique name, then
 * derive WebP variants from it where that makes sense.
 *
 * The original filename only contributes a slug, never a path.
 *
 * The returned shape is what a `media` row needs. When conversion happens,
 * `filename` points at the largest WebP - so every existing `mediaUrl(row.filename)`
 * call site serves WebP with no change - and `source_filename` holds the
 * untouched upload. When it does not (SVG, video, PDF, or sharp missing)
 * `filename` is the original and `source_filename` is empty.
 *
 * `fallback_filename` is the one small JPG (or PNG) for browsers that cannot
 * show the WebP. An upload that arrives as WebP or AVIF is served as it came
 * and gets only that.
 */
export async function storeUpload({ filename, mime, data }) {
  const ext = EXT_BY_MIME[mime] || path.extname(filename || '').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
  const base = slugify(path.basename(filename || 'fil', path.extname(filename || '')), 'fil').slice(0, 60);
  const stored = `${base}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(config.paths.media, stored), data);

  const size = imageSize(data, mime) || {};
  // Every key a replacement has to clear, so a new file never inherits the
  // old one's fallback.
  const plain = {
    filename: stored,
    mime,
    bytes: data.length,
    source_filename: '',
    source_bytes: 0,
    variants: '',
    fallback_filename: '',
    fallback_bytes: 0,
    ...(mime === 'image/jpeg' ? displayDimensions(size, jpegOrientation(data)) : size),
  };

  let derived = null;
  try {
    derived = await deriveVariants(stored, { mime, data });
  } catch (err) {
    // A conversion failure must never cost the user their upload.
    console.warn(`[media] conversion failed for ${stored}: ${err.message}`);
  }
  if (!derived) return plain;

  const fallback = derived.fallback
    ? { fallback_filename: derived.fallback.filename, fallback_bytes: derived.fallback.bytes }
    : {};
  if (!derived.variants.length) return { ...plain, ...fallback };

  const largest = derived.variants[derived.variants.length - 1];
  return {
    ...plain,
    filename: largest.filename,
    mime: 'image/webp',
    bytes: largest.bytes,
    width: largest.width,
    height: largest.height,
    source_filename: stored,
    source_bytes: data.length,
    variants: JSON.stringify(derived.variants),
    ...fallback,
  };
}

/**
 * Overwrite the bytes behind an existing media row, keeping its id and URL.
 * The old file, its variants, its fallback and its archived source all go.
 */
export async function replaceUpload(existingRow, upload) {
  const stored = await storeUpload(upload);
  removeMediaFiles(existingRow);
  return stored;
}

/** Every file on disk belonging to one media row: served, variants, fallback, source. */
export function filesOf(row) {
  if (!row) return [];
  const names = [row.filename, row.source_filename, row.fallback_filename];
  for (const v of parseVariants(row)) names.push(v.filename);
  return [...new Set(names.filter(Boolean))];
}

/** Delete a row's served file, its WebP variants, fallback and archived original. */
export function removeMediaFiles(row) {
  for (const name of filesOf(row)) removeFile(name);
}

export function removeFile(filename) {
  if (!filename) return;
  const safe = path.basename(String(filename));
  const target = path.join(config.paths.media, safe);
  // Never step outside the media directory, whatever the DB says.
  if (!target.startsWith(config.paths.media + path.sep)) return;
  try { fs.unlinkSync(target); } catch { /* already gone */ }
}

export const mediaUrl = (filename) => (filename ? `/media/${encodeURIComponent(filename)}` : '');

/* --------------------------------------------------- responsive delivery */

/** The variant list of a row, tolerant of rows that predate conversion. */
export function parseVariants(row) {
  if (!row?.variants) return [];
  try {
    const list = JSON.parse(row.variants);
    return Array.isArray(list) ? list.filter((v) => v?.filename && v.width) : [];
  } catch { return []; }
}

/**
 * A `srcset` for one media row, or '' when there is nothing to choose between.
 * A single variant is no choice at all, so it is left off rather than emitting
 * a one-entry srcset the browser gains nothing from.
 */
export function srcsetFor(row) {
  const list = parseVariants(row);
  if (list.length < 2) return '';
  return list.map((v) => `${mediaUrl(v.filename)} ${v.width}w`).join(', ');
}

/** The narrowest variant at or above `want` px - handy for thumbnails. */
export function variantAtLeast(row, want) {
  const list = parseVariants(row);
  if (!list.length) return null;
  return list.find((v) => v.width >= want) || list[list.length - 1];
}

/**
 * Build the `src`/`srcset`/`sizes`/`width`/`height` attributes for an image.
 * `sizes` describes how wide the image renders at a given viewport, which is
 * the one thing the browser cannot work out for itself.
 */
export function imgAttrs(row, { sizes = '' } = {}) {
  const srcset = srcsetFor(row);
  const bits = [`src="${mediaUrl(row.filename)}"`];
  if (srcset) {
    bits.push(`srcset="${srcset}"`);
    if (sizes) bits.push(`sizes="${sizes}"`);
  }
  if (row.width && row.height) bits.push(`width="${row.width}" height="${row.height}"`);
  return bits.join(' ');
}

const SOURCE_TYPE = { '.webp': 'image/webp', '.avif': 'image/avif' };

/**
 * One image on the site, as markup.
 *
 * With a fallback on file it is a `<picture>`: the WebP set as a `<source>`,
 * which every current browser takes, and the fallback as the `<img>` for the
 * few that skip it - so an old iPad draws the JPG and never asks for a WebP.
 * Without one it is the plain `<img>` it always was. `img` is the rest of the
 * `<img>`'s attributes (alt, loading, ...), already escaped.
 */
export function pictureHtml(row, { sizes = '', img = '' } = {}) {
  const rest = img ? ` ${img}` : '';
  const type = SOURCE_TYPE[path.extname(row.filename || '').toLowerCase()];
  if (!row.fallback_filename || !type) return `<img ${imgAttrs(row, { sizes })}${rest}>`;
  const srcset = srcsetFor(row);
  const dims = row.width && row.height ? ` width="${row.width}" height="${row.height}"` : '';
  return `<picture><source type="${type}" srcset="${srcset || mediaUrl(row.filename)}"${
    srcset && sizes ? ` sizes="${sizes}"` : ''}><img src="${mediaUrl(row.fallback_filename)}"${
    dims}${rest}></picture>`;
}

/**
 * The one address for a picture that has to open anywhere - a link preview,
 * a favicon: the fallback when there is one, the served file when not.
 */
export const fallbackUrl = (row) => mediaUrl(row.fallback_filename || row.filename);

/** Common `sizes` values, kept together so layout changes update one place. */
export const SIZES = {
  // The content column is 1000px wide (--body-max) with 24px gutters.
  content: '(max-width: 1048px) 100vw, 1000px',
  // Cards sit in a repeat(auto-fit, minmax(260px, 1fr)) grid inside it.
  card: '(max-width: 760px) 100vw, 340px',
  // The feature band puts the image on roughly half the content column.
  feature: '(max-width: 760px) 100vw, 500px',
};

/**
 * How large this kind of file may be. A video's ceiling is its own: the same
 * number cannot be both "generous for a clip" and "sane for a photograph".
 */
export const uploadLimit = (mime) =>
  (kindOf(mime) === 'video' ? config.uploads.maxVideoBytes : config.uploads.maxBytes);

export { available as imagesAvailable };
