/**
 * Bring the media library up to what an upload gets today.
 *
 *   node scripts/image-backfill.mjs              # convert what has no WebPs, add missing fallbacks
 *   node scripts/image-backfill.mjs --dry-run    # report only, touch nothing
 *   node scripts/image-backfill.mjs --all        # re-encode everything from the kept originals
 *   node scripts/image-backfill.mjs --fallbacks  # remake every fallback, WebPs untouched
 *
 * `--fallbacks` is for a change to FALLBACK_WIDTH or FALLBACK_QUALITY, `--all`
 * for a change to anything else. Rows keep their id, so every page, article
 * and setting pointing at an image follows it across automatically.
 * Originals are kept, which is what makes both safe to run whenever the
 * settings change.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { db } from '../src/db/index.js';
import { media } from '../src/models.js';
import { detect, deriveVariants, deriveFallback } from '../src/lib/images.js';
import { parseVariants, removeFile } from '../src/lib/media.js';
import { formatBytes } from '../src/views/helpers.js';

const dryRun = process.argv.includes('--dry-run');
const redoAll = process.argv.includes('--all');
const redoFallbacks = process.argv.includes('--fallbacks');

const tools = await detect();
if (!tools.available) {
  console.error('\n  sharp could not be loaded. Run npm install first.\n');
  process.exit(1);
}
const { quality, method, sharpYuv, kernel, fallback: fb } = config.images;
console.log(`  Using ${tools.version}`);
console.log(`  WebP quality ${quality}, method ${method}${sharpYuv ? ', sharp_yuv' : ''}, ${kernel} resize;`
  + ` fallback ${fb.width}px at q${fb.quality}\n`);

// What a row is made from: the kept original once it has been converted,
// otherwise the file it is served as.
const sourceOf = (row) => row.source_filename || row.filename;

const plan = [];
for (const row of db.prepare('SELECT * FROM media ORDER BY id').all()) {
  const mime = mimeOf(sourceOf(row));
  if (config.images.convert.has(mime)) {
    if (redoAll || !parseVariants(row).length) plan.push({ row, mime, job: 'convert' });
    else if (redoFallbacks || !row.fallback_filename) plan.push({ row, mime, job: 'fallback' });
  } else if (config.images.fallbackOnly.has(mime)) {
    if (redoAll || redoFallbacks || !row.fallback_filename) plan.push({ row, mime, job: 'fallback' });
  }
}

if (!plan.length) {
  console.log('  Everything is already converted and has its fallback.');
  process.exit(0);
}

let before = 0;
let after = 0;
let converted = 0;
let fallbacks = 0;
let fallbackBytes = 0;

for (const { row, mime, job } of plan) {
  const sourceName = sourceOf(row);
  const sourcePath = path.join(config.paths.media, sourceName);
  if (!fs.existsSync(sourcePath)) {
    console.log(`  ! ${row.original_name} - source file missing, skipped`);
    continue;
  }

  const data = fs.readFileSync(sourcePath);
  const label = `${row.original_name} (${formatBytes(data.length)})`;

  if (dryRun) {
    console.log(`  · would ${job === 'convert' ? 'convert' : 'make a fallback for'}  ${label}`);
    continue;
  }

  if (job === 'fallback') {
    const made = await deriveFallback(sourceName, { mime, data });
    if (!made) {
      console.log(`  ! ${label} - no fallback made (animated, or unreadable)`);
      continue;
    }
    if (row.fallback_filename && row.fallback_filename !== made.filename) removeFile(row.fallback_filename);
    media.update(row.id, { fallback_filename: made.filename, fallback_bytes: made.bytes });
    fallbacks++;
    fallbackBytes += made.bytes;
    console.log(`  ✓ ${label}  fallback ${kindOf(made.filename)} ${formatBytes(made.bytes)}`);
    continue;
  }

  const derived = await deriveVariants(sourceName, { mime, data });
  if (!derived?.variants?.length) {
    console.log(`  ! ${label} - conversion produced nothing, left as is`);
    continue;
  }

  // Replace the old set, but never the source just read from.
  const kept = new Set([sourceName, derived.fallback?.filename,
    ...derived.variants.map((v) => v.filename)].filter(Boolean));
  for (const name of [row.fallback_filename, ...parseVariants(row).map((v) => v.filename)]) {
    if (name && !kept.has(name)) removeFile(name);
  }

  const largest = derived.variants[derived.variants.length - 1];
  media.update(row.id, {
    filename: largest.filename,
    mime: 'image/webp',
    bytes: largest.bytes,
    width: largest.width,
    height: largest.height,
    source_filename: sourceName,
    source_bytes: data.length,
    variants: JSON.stringify(derived.variants),
    fallback_filename: derived.fallback?.filename || '',
    fallback_bytes: derived.fallback?.bytes || 0,
  });

  before += data.length;
  after += largest.bytes;
  converted++;
  if (derived.fallback) { fallbacks++; fallbackBytes += derived.fallback.bytes; }
  const pct = Math.round((1 - largest.bytes / data.length) * 100);
  console.log(`  ✓ ${label}  ->  ${formatBytes(largest.bytes)} (-${pct}%)`
    + `  [${derived.variants.map((v) => `${v.width}w`).join(' ')}]`
    + (derived.fallback ? `  fallback ${kindOf(derived.fallback.filename)} ${formatBytes(derived.fallback.bytes)}` : ''));
}

if (dryRun) {
  console.log(`\n  ${plan.length} file(s) would be touched. Nothing was changed.\n`);
} else {
  console.log('');
  if (converted) {
    const pct = Math.round((1 - after / before) * 100);
    console.log(`  Converted ${converted} file(s): ${formatBytes(before)} -> ${formatBytes(after)} (-${pct}%)`);
  }
  if (fallbacks) console.log(`  ${fallbacks} fallback(s) written, ${formatBytes(fallbackBytes)} in all`);
  console.log('  Originals kept alongside; re-run with --all after changing quality settings.\n');
}

function kindOf(name) {
  return path.extname(name).slice(1).toUpperCase();
}

function mimeOf(name) {
  const ext = path.extname(name).toLowerCase();
  return { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.avif': 'image/avif' }[ext] || 'application/octet-stream';
}
