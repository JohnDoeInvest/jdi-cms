import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bool = (v, def) => (v === undefined ? def : /^(1|true|yes|on)$/i.test(String(v)));
const mb = (v, def) => Math.max(1, Number(v) || def) * 1024 * 1024;

/*
 * Which proxy in front, if any, to believe about the visitor.
 *
 * Nothing is in front by default: Node is the front door, so the socket's
 * address *is* the visitor, and an X-Forwarded-For or X-Forwarded-Proto
 * arriving from a visitor is ignored rather than trusted. Put something in
 * front - a TLS terminator, a load balancer - and it has to be named here,
 * because the login bypass and the `Secure` cookie both rest on what
 * `req.ip` and `req.protocol` report.
 *
 *   TRUST_PROXY=loopback     a proxy on this machine (what `true` means here)
 *   TRUST_PROXY=10.0.0.5     a proxy elsewhere, by address
 *
 * A hop count (`1`) works too, but only where nothing can reach Node except
 * through that proxy - bind HOST=127.0.0.1 - or a visitor can name their own
 * address.
 *
 * Express's own `true` trusts every hop, which lets a visitor write their own
 * address, so it is read as `loopback` instead: the safe way to be wrong.
 */
function trustProxy(value) {
  const v = String(value ?? '').trim();
  if (!v || /^(0|false|no|off)$/i.test(v)) return false;
  if (/^(true|yes|on)$/i.test(v)) return 'loopback';
  return /^\d+$/.test(v) ? Number(v) : v;
}

const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};

const port = Number(process.env.PORT || 8080);

export const config = {
  root: ROOT,
  port,
  // Every interface, so the office reaches it over the LAN - what nginx
  // listening on :8080 used to provide. HOST=127.0.0.1 keeps it local.
  host: process.env.HOST || '0.0.0.0',
  trustProxy: trustProxy(process.env.TRUST_PROXY),

  // Public origin the site is reached on.
  siteUrl: process.env.SITE_URL || `http://localhost:${port}`,

  paths: {
    www: path.join(ROOT, 'www'),
    media: path.join(ROOT, 'www', 'media'),
    // Typefaces, beside the uploads rather than among them: a font is not a
    // picture and has no business in the media library's browser.
    fonts: path.join(ROOT, 'www', 'fonts'),
    data: path.join(ROOT, 'data'),
    outbox: path.join(ROOT, 'data', 'outbox'),
    db: process.env.DB_PATH || path.join(ROOT, 'data', 'cms.db'),
  },

  // --- Authentication -------------------------------------------------
  /*
   * Off by default, because a default is what an installation gets.
   *
   * With AUTH_DISABLED on, any visit to the CMS from this machine is signed
   * in as `devUser` with no cookie - which is a real convenience while
   * building and indistinguishable from no authentication at all to anyone
   * else. It used to default to on, so a fresh install shipped open; the
   * bypass is now refused for any request that did not come from localhost,
   * and it has to be asked for.
   *
   * Turn it on for local work:  AUTH_DISABLED=1 ./start.sh
   */
  authDisabled: bool(process.env.AUTH_DISABLED, false),
  devUser: process.env.DEV_USER || 'macsmoser@gmail.com',
  sessionDays: 30,
  otp: { length: 6, ttlMinutes: 10, maxAttempts: 5 },

  // --- Mail (Brevo) ---------------------------------------------------
  // Without an API key every message is written to data/outbox/ and logged,
  // so the whole flow is testable offline.
  brevoApiKey: process.env.BREVO_API_KEY || '',
  mail: {
    // Empty means the site's own name, from Settings, at the moment of sending.
    fromName: process.env.MAIL_FROM_NAME || '',
    fromEmail: process.env.MAIL_FROM || `noreply@${hostOf(process.env.SITE_URL) || 'localhost'}`,
    // Where a form delivers when neither it nor Settings names anyone.
    contactTo: process.env.CONTACT_TO || '',
  },

  /*
   * Upload limits, per kind.
   *
   * An image has no business being large: it goes through the WebP pipeline
   * and is capped at 2000px on the way in, so anything past a few megabytes
   * is bytes nobody will ever be served. Video is a different animal - a
   * minute of 1080p is tens of megabytes before anything unreasonable has
   * happened - so it gets its own, much larger, ceiling.
   *
   * `maxRequest` is not the file limit: one upload may carry several files,
   * and the whole body is read before any of them can be looked at. It is
   * also the real memory ceiling - src/lib/http.js buffers a request in
   * memory rather than streaming it to disk, so a 200 MB upload costs 200 MB
   * of RAM while it lands. Streaming would be the fix if that ever bites.
   */
  uploads: {
    maxBytes: mb(process.env.UPLOAD_MAX_MB, 25),
    maxVideoBytes: mb(process.env.UPLOAD_MAX_VIDEO_MB, 200),
    maxRequest: mb(process.env.UPLOAD_MAX_REQUEST_MB, 260),
    allowed: new Set([
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/pdf',
    ]),
  },

  // --- Derived images -------------------------------------------------
  // Raster uploads are re-encoded to WebP at several widths so the front end
  // can hand every device only the pixels it needs, plus one small JPG for
  // the few that cannot show WebP at all. All of it goes through sharp (see
  // src/lib/images.js); if sharp cannot load, uploads pass through untouched.
  images: {
    // Method 6 is libwebp's slowest, best search: roughly 16% smaller than
    // the default 4 at identical quality, which buys back a quality notch.
    // sharp_yuv cleans up chroma fringing on saturated edges, which is where
    // food photography otherwise shows WebP's worst artefacts.
    quality: Number(process.env.WEBP_QUALITY || 65),
    method: Number(process.env.WEBP_METHOD || 6),
    sharpYuv: bool(process.env.WEBP_SHARP_YUV, true),

    // Flat artwork - logos, diagrams, screenshots - rings badly under lossy
    // encoding, so it goes through near-lossless instead.
    nearLossless: 60,

    // How rungs are scaled down. sharp's own default, Lanczos 3, is the
    // sharper filter and made this site's photographs 8% heavier at the same
    // quality; Mitchell is the closest to the cwebp resize these settings
    // were tuned against, and lands the whole library 0.3% under what cwebp
    // made. The encoder itself is the same libwebp: at full size, byte for
    // byte identical (measured September 2026, on this site's uploads).
    kernel: 'mitchell',

    // Rungs are only generated below the source width; the full-size variant
    // is the source width capped at maxWidth. 2000px covers the 1000px content
    // column on a 2x display, so anything larger is wasted bytes.
    widths: [400, 800, 1200, 1600],
    maxWidth: 2000,

    /* The fallback: one image per upload for whatever cannot show WebP - an
       old iPad, Safari before Big Sur, the link preview a chat app or a
       social network draws. Few enough that one small, hard-compressed JPG
       serves them all rather than a ladder of its own: 800px at q50 was a
       24 KB median here, where the same images' 800px WebPs weigh more. A
       transparent image gets a PNG instead, or it would sit on a white box. */
    fallback: {
      width: Number(process.env.FALLBACK_WIDTH || 800),
      quality: Number(process.env.FALLBACK_QUALITY || 50),
    },

    convert: new Set(['image/jpeg', 'image/png', 'image/gif']),
    // Already in a format older browsers cannot show: served as uploaded,
    // with only the fallback made beside it.
    fallbackOnly: new Set(['image/webp', 'image/avif']),
  },

  // Fallback for the site's lang attribute; the real value is a CMS setting.
  defaultLang: 'sv',
  // Which country a phone field starts on, for the same reason and in the
  // same way: a fallback here, a setting in the CMS.
  defaultCountry: 'SE',
};

for (const dir of [config.paths.data, config.paths.outbox, config.paths.media]) {
  fs.mkdirSync(dir, { recursive: true });
}
