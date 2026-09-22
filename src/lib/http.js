import { config } from '../config.js';
import { EMBED_FRAME_ORIGINS } from './embed.js';

/**
 * Whether this request reached us over TLS.
 *
 * Asked of the request rather than read off `SITE_URL`, because those two
 * come apart in exactly the case that matters: put a certificate on a proxy
 * and forget the environment variable, and the site works, the padlock is
 * there, and session cookies quietly go out without `Secure`. Nothing breaks,
 * so nobody notices until somebody tests for it.
 *
 * `req.secure` is Express's answer, and it only believes X-Forwarded-Proto
 * from a proxy named in TRUST_PROXY - with nothing named, a visitor sending
 * the header gets nowhere, which matters now that Node faces the network
 * itself. `SITE_URL` stays as the fallback for a front door nobody named, so
 * an https site behind one still marks its cookies `Secure`.
 *
 * Conditional rather than always on, because a cookie marked Secure is
 * dropped over plain HTTP - set unconditionally, every local install fails
 * closed in the most confusing way there is: nobody can log in, nothing says
 * why.
 */
export const overTls = (req) => {
  if (req?.secure) return true;
  if (config.trustProxy) return false;
  return config.siteUrl.startsWith('https:');
};


/* ------------------------------------------------------------------ cookies */

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch { out[k] = part.slice(i + 1).trim(); }
  }
  return out;
}

export function serializeCookie(name, value, opts = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`];
  bits.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge != null) bits.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.expires) bits.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.httpOnly !== false) bits.push('HttpOnly');
  bits.push(`SameSite=${opts.sameSite || 'Lax'}`);
  if (opts.secure) bits.push('Secure');
  return bits.join('; ');
}

/* --------------------------------------------------------------- body parse */

const MAX_FORM = 2 * 1024 * 1024;

export function readBody(req, limit = MAX_FORM) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Turn `a=1&b=2&tags[]=x` into a plain object. Repeated keys and keys ending
 * in `[]` collect into arrays so checkbox groups round-trip correctly.
 */
export function parseQuery(str) {
  const out = {};
  const sp = new URLSearchParams(str);
  for (const key of new Set(sp.keys())) {
    const values = sp.getAll(key);
    const name = key.endsWith('[]') ? key.slice(0, -2) : key;
    out[name] = key.endsWith('[]') || values.length > 1 ? values : values[0];
  }
  return out;
}

export async function parseForm(req) {
  const type = req.headers['content-type'] || '';
  if (type.startsWith('application/json')) {
    const raw = (await readBody(req)).toString('utf8');
    try { return { fields: raw ? JSON.parse(raw) : {}, files: [] }; }
    catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400 }); }
  }
  if (type.startsWith('multipart/form-data')) return parseMultipart(req, type);
  const raw = (await readBody(req)).toString('utf8');
  return { fields: parseQuery(raw), files: [] };
}

/**
 * Minimal but correct multipart/form-data reader. Splits on the boundary at
 * the byte level so binary uploads survive intact.
 */
async function parseMultipart(req, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) throw Object.assign(new Error('Missing multipart boundary'), { status: 400 });
  const boundary = Buffer.from('--' + (match[1] || match[2]).trim());
  // The whole body, not one file: an upload may carry several, and none can
  // be looked at until all of it has arrived.
  const body = await readBody(req, config.uploads.maxRequest);

  const fields = {};
  const files = [];
  let pos = body.indexOf(boundary);
  if (pos < 0) return { fields, files };
  pos += boundary.length;

  while (pos < body.length) {
    if (body[pos] === 0x2d && body[pos + 1] === 0x2d) break;      // closing '--'
    if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;   // CRLF after boundary

    const headerEnd = body.indexOf('\r\n\r\n', pos, 'latin1');
    if (headerEnd < 0) break;
    const rawHeaders = body.toString('utf8', pos, headerEnd);
    const bodyStart = headerEnd + 4;

    let next = body.indexOf(boundary, bodyStart);
    if (next < 0) next = body.length;
    const value = body.subarray(bodyStart, Math.max(bodyStart, next - 2)); // trim trailing CRLF

    const disposition = /content-disposition:([^\r\n]*)/i.exec(rawHeaders)?.[1] || '';
    const name = /name="([^"]*)"/i.exec(disposition)?.[1];
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
    const mime = (/content-type:\s*([^\r\n;]+)/i.exec(rawHeaders)?.[1] || '').trim();

    if (name) {
      if (filename !== undefined) {
        if (filename !== '' && value.length) {
          files.push({ field: name, filename, mime: mime || 'application/octet-stream', data: value });
        }
      } else {
        const text = value.toString('utf8');
        const key = name.endsWith('[]') ? name.slice(0, -2) : name;
        if (name.endsWith('[]') || key in fields) {
          fields[key] = [].concat(fields[key] ?? [], text);
        } else {
          fields[key] = text;
        }
      }
    }
    pos = next + boundary.length;
  }
  return { fields, files };
}

/* ----------------------------------------------------------------- replies */

export function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ''), 'utf8');
  res.writeHead(status, { 'Content-Length': buf.length, ...headers });
  res.end(buf);
}

/**
 * What every HTML response carries.
 *
 * `script-src 'self'` with no `unsafe-inline` and no nonce, which is only
 * possible because nothing here has an executable inline script - the one
 * `<script>` without a src is a JSON island typed application/json, which the
 * browser will not run. That single fact is what makes this policy worth
 * having rather than theatre.
 *
 * Styles are the exception and stay `unsafe-inline`: the theme is an inline
 * <style> and the editor writes a hundred-odd `style=` attributes. An inline
 * style is a far smaller thing to give away than an inline script.
 *
 * `frame-src` comes from src/lib/embed.js, which is what builds the iframe
 * src in the first place, so adding a provider is still one edit.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  // blob: is the theme screen reading a local image to pick a palette out of
  // it; data: is what the browser hands back for a preview.
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "font-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  `frame-src 'self' ${EMBED_FRAME_ORIGINS.join(' ')}`,
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  // frame-ancestors above is the real rule; this is for anything too old to
  // read it, and costs one header.
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Nothing here uses any of them, and saying so is free.
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

/* HSTS is the one header that has to be decided per request, because it is
   the one that is wrong to send when there is no TLS: on a plain-HTTP install
   it is ignored, and on localhost it would pin a developer's browser to https
   for a host with no certificate. Read off the request rather than SITE_URL,
   which comes apart from reality the moment somebody puts a certificate on a
   proxy and forgets the environment variable. `res.req` is Node's own back
   reference, so no call site has to change to get it. */
const hsts = (res) => (overTls(res.req)
  ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }
  : {});

export const html = (res, body, status = 200, headers = {}) =>
  send(res, status, body, {
    'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS, ...hsts(res), ...headers,
  });

export const json = (res, data, status = 200, headers = {}) =>
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', ...headers });

export function redirect(res, location, status = 303) {
  res.writeHead(status, { Location: location });
  res.end();
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
