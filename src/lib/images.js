/**
 * Derived images: WebP at several widths, and one small fallback beside them.
 *
 * Everything goes through sharp (libvips) - one npm package that reads every
 * format an upload arrives in, turns the pixels upright, resizes, and writes
 * WebP, JPEG and PNG. It replaced libwebp's command line tools, so the server
 * needs no image software of its own: `npm install` brings all of it.
 *
 * If sharp cannot load - a platform it ships no binary for - nothing breaks:
 * `available()` reports false, uploads are stored exactly as they arrive, and
 * the site serves the original file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { orientationSwapsAxes, looksPhotographic } from './imagesize.js';

/* ----------------------------------------------------------------- loading */

let sharp = null;
let probed = null;

/**
 * Load sharp once per process. Awaited at boot, so the first upload never pays
 * for it and a broken install says so at start rather than at the first
 * upload. Safe to call repeatedly.
 */
export async function detect() {
  if (probed) return probed;
  try {
    sharp = (await import('sharp')).default;
    /* libvips caches decoded files by name, so a file replaced on disk would
       read back as the old picture. Everything here arrives as a buffer and
       is made once, so the cache would only ever have held memory. */
    sharp.cache(false);
    probed = { available: true, version: `sharp ${sharp.versions.sharp}, libvips ${sharp.versions.vips}` };
  } catch (err) {
    probed = { available: false, version: '' };
    console.warn('[media] sharp could not be loaded - uploads will be stored unconverted.\n'
      + `        ${String(err.message).split('\n')[0]}\n`
      + '        Run npm install, then restart the server.');
  }
  return probed;
}

/** True once `detect()` has run and sharp loaded. */
export const available = () => !!sharp;

/* ---------------------------------------------------------------- encoding */

/**
 * Work out which widths to render. Rungs wider than the source are pointless
 * (upscaling invents detail), and the largest is the source width clamped to
 * `maxWidth` so an 8000px camera original does not ship 8000px to a phone.
 */
export function ladderFor(sourceWidth) {
  const { widths, maxWidth } = config.images;
  const full = Math.min(sourceWidth, maxWidth);
  const rungs = widths.filter((w) => w < full);
  return [...rungs, full];
}

/** WebP settings for a photograph, or for flat artwork. */
function webpOptions(photographic) {
  const { quality, method, sharpYuv, nearLossless } = config.images;
  return photographic
    ? { quality, effort: method, smartSubsample: sharpYuv }
    // Near-lossless keeps hard edges and small text crisp while still landing
    // far below the source PNG.
    : { nearLossless: true, quality: nearLossless, effort: method };
}

/**
 * The upload, upright, at `width` - or at its own size when that is it.
 *
 * `autoOrient` turns the pixels the way the EXIF tag says, so every file made
 * here stands up on its own and no browser has to be trusted to read the tag.
 * The ICC profile rides along, so a wide-gamut photograph keeps its colours;
 * everything else in the metadata, GPS included, is dropped.
 */
function scaled(data, width, fullWidth) {
  const image = sharp(data).autoOrient().keepIccProfile();
  return width < fullWidth
    ? image.resize({ width, kernel: config.images.kernel, fastShrinkOnLoad: false })
    : image;
}

/** What an upload is, as far as making anything from it goes. */
async function inspect(data) {
  try {
    const meta = await sharp(data).metadata();
    const width = meta.autoOrient?.width || meta.width;
    const height = meta.autoOrient?.height || meta.height;
    if (!width || !height) return null;
    // An alpha channel that is opaque everywhere is not transparency, and a
    // JPG serves it perfectly well.
    const transparent = !!meta.hasAlpha && !(await sharp(data).stats()).isOpaque;
    return { width, height, transparent, animated: (meta.pages || 1) > 1 };
  } catch {
    return null;
  }
}

/**
 * The one fallback: a small, hard-compressed JPG, or a palette PNG when the
 * image is transparent - a JPG would put a white box behind a logo. Named for
 * its width, so it sits beside the WebP of the same width: `<base>-800.jpg`.
 */
async function makeFallback(base, data, info) {
  const { width: most, quality } = config.images.fallback;
  const width = Math.min(most, info.width);
  const out = `${base}-${width}.${info.transparent ? 'png' : 'jpg'}`;
  const target = path.join(config.paths.media, out);
  const image = scaled(data, width, info.width);
  try {
    const made = await (info.transparent
      ? image.png({ palette: true, effort: 10, compressionLevel: 9 })
      // mozjpeg: progressive and trellis-quantised, the smallest JPG there is
      // for its quality. Anything not transparent may still carry an opaque
      // alpha channel, which a JPG has no room for.
      : image.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true })
    ).toFile(target);
    return { filename: out, width: made.width, height: made.height, bytes: made.size };
  } catch (err) {
    console.warn(`[media] fallback failed for ${base}: ${err.message}`);
    removeQuietly(target);
    return null;
  }
}

/** The WebP ladder for a still image, narrowest first. */
async function webpLadder(base, data, info, mime) {
  const options = webpOptions(looksPhotographic(data, mime, info));
  const made = await Promise.all(ladderFor(info.width).map(async (width) => {
    const out = `${base}-${width}.webp`;
    const target = path.join(config.paths.media, out);
    try {
      const result = await scaled(data, width, info.width).webp(options).toFile(target);
      return { filename: out, width: result.width, height: result.height, bytes: result.size };
    } catch (err) {
      // A half-written file is an orphan no row points at; never leave one.
      console.warn(`[media] WebP failed for ${base} at ${width}w: ${err.message}`);
      removeQuietly(target);
      return null;
    }
  }));
  return made.filter(Boolean);
}

/**
 * An animated GIF becomes one animated WebP at its own size. There is no
 * ladder: every frame would be scaled for a few kilobytes, and a GIF is rarely
 * large to begin with.
 */
async function animatedWebp(base, data, info) {
  const out = `${base}.webp`;
  const target = path.join(config.paths.media, out);
  try {
    const { quality, method } = config.images;
    const made = await sharp(data, { animated: true })
      .webp({ quality, effort: method, mixed: true }).toFile(target);
    return [{ filename: out, width: info.width, height: info.height, bytes: made.size }];
  } catch (err) {
    console.warn(`[media] animated WebP failed for ${base}: ${err.message}`);
    removeQuietly(target);
    return [];
  }
}

/**
 * Make everything served in place of one stored upload.
 *
 * `sourceFilename` must already exist in the media directory - the original
 * is deliberately kept, so quality can be retuned or new widths added later
 * without re-uploading anything.
 *
 * Returns `{ variants, fallback }`: the WebPs narrowest first, empty for a
 * format that is served as uploaded and only given a fallback, and the
 * fallback itself (null if it could not be made). Returns `null` when the
 * file is left entirely alone.
 */
export async function deriveVariants(sourceFilename, { mime, data }) {
  const convert = config.images.convert.has(mime);
  if (!convert && !config.images.fallbackOnly.has(mime)) return null;
  await detect();
  if (!sharp) return null;

  const info = await inspect(data);
  // A moving WebP or AVIF is kept as it came: a still frame would be another
  // picture, not a fallback for this one.
  if (!info || (!convert && info.animated)) return null;
  const base = sourceFilename.replace(/\.[^.]+$/, '');

  let variants = [];
  if (convert) {
    variants = info.animated
      ? await animatedWebp(base, data, info)
      : await webpLadder(base, data, info, mime);
    if (!variants.length) return null;
  }
  // An animated GIF's fallback is its first frame, like any still image's.
  const fallback = await makeFallback(base, data, info);
  if (!variants.length && !fallback) return null;
  return { variants, fallback };
}

/**
 * Only the fallback, for media converted before there was one. Reads the
 * kept original, so it is made from the same pixels the WebPs were.
 */
export async function deriveFallback(sourceFilename, { mime, data }) {
  await detect();
  if (!sharp) return null;
  const info = await inspect(data);
  if (!info || (!config.images.convert.has(mime) && info.animated)) return null;
  return makeFallback(sourceFilename.replace(/\.[^.]+$/, ''), data, info);
}

function removeQuietly(target) {
  try { fs.unlinkSync(target); } catch { /* already gone */ }
}

/**
 * Swap a source's own dimensions for the rotated case. Used for uploads that
 * are stored unconverted but still carry an EXIF rotation, where the row's
 * width/height must describe what the browser will actually lay out.
 */
export function displayDimensions({ width, height }, orientation) {
  return orientationSwapsAxes(orientation) ? { width: height, height: width } : { width, height };
}
