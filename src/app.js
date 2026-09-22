import path from 'node:path';
import express from 'express';
import compression from 'compression';
import { config } from './config.js';
import { html, json, HttpError } from './lib/http.js';
import { assetFile } from './lib/assets.js';
import { registerSiteRoutes, buildContext } from './routes/site.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCmsRoutes } from './routes/cms.js';

/**
 * The application, on Express.
 *
 * nginx used to stand in front and do five jobs besides passing requests on:
 * compress, serve files straight off disk (answering the byte ranges a
 * video on an iPhone needs), harden uploaded files, refuse an oversized
 * upload before the app read it, and absorb slow uploads. All five are here
 * now, so Node faces the network by itself.
 *
 * Built here and started by server.js, so a test can stand the whole thing
 * up on a spare port without the clock, the seed and the rest of a real
 * start.
 */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  // The old router matched paths exactly, so this does too.
  app.set('case sensitive routing', true);

  if (process.env.LOG_REQUESTS === '1') app.use(logRequests);

  // gzip, or brotli where the browser asks for it, for anything textual.
  // Images, video and fonts are compressed already and are left alone.
  app.use(compression({ threshold: 512 }));

  /* --- files, straight off disk ---------------------------------------- */

  const files = (dir, options) => express.static(dir, {
    index: false, redirect: false, fallthrough: false, ...options,
  });
  // A theme's files first, falling through to the default for the rest.
  if (config.paths.theme) {
    app.use('/assets', express.static(config.paths.theme, {
      index: false, redirect: false, fallthrough: true, dotfiles: 'ignore', maxAge: '1h',
    }));
  }
  app.use('/assets', files(path.join(config.paths.www, 'assets'), { maxAge: '1h' }));
  // Uploaded, so hardened rather than trusted: an SVG can carry script, and
  // must never run against our own origin.
  app.use('/media', files(config.paths.media, { maxAge: '7d', setHeaders: inert }));
  // Uploaded as well. A year of caching because the name carries a hash: a
  // replaced face is a new filename, never the same one with new bytes.
  app.use('/fonts', files(config.paths.fonts, { maxAge: '365d', immutable: true, setHeaders: inert }));
  app.get('/favicon.ico', (req, res, next) => {
    res.sendFile('favicon.svg', { root: path.dirname(assetFile('/assets/favicon.svg')), maxAge: '7d' },
      (err) => err && next(err));
  });

  /* --- the site and the CMS -------------------------------------------- */

  app.use(refuseOversized);
  const routes = adapt(app);
  registerAuthRoutes(routes);
  registerCmsRoutes(routes);
  registerSiteRoutes(routes);   // its '/*' catch-alls must be registered last

  // The catch-alls answer every GET and POST, so whatever is left is a
  // method nothing here takes.
  app.use((req, res) => html(res, 'Method not allowed', 405));
  app.use(handleError);
  return app;
}

/**
 * Handlers keep the shape they have always had - (req, res, { params, url,
 * ctx }) - and Express does the matching. `url` is parsed against the public
 * origin as before, and `ctx` is the site context every renderer reads. A
 * trailing `/*` is Express's `/{*wild}`: anything under the prefix, and the
 * prefix itself.
 */
function adapt(app) {
  const add = (method) => (pattern, handler) => {
    app[method](pattern.replace(/\/\*$/, '/{*wild}'), async (req, res) => {
      let url;
      try {
        url = new URL(req.originalUrl, config.siteUrl);
      } catch {
        return html(res, 'Bad request', 400);
      }
      await handler(req, res, { params: req.params, url, ctx: buildContext(req, url) });
    });
  };
  return { get: add('get'), post: add('post'), put: add('put'), delete: add('delete') };
}

/** Uploaded files are inert: no script, no plugin, no sniffing a type. */
function inert(res) {
  res.setHeader('Content-Security-Policy', "script-src 'none'; object-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

/**
 * An upload past the ceiling, refused on its declared length before a byte
 * of it is read - so a 300 MB mistake is answered at once, and in JSON to
 * the picker's fetch, instead of after 260 MB of it has landed in memory.
 * nginx did this; a body that declares no length is still stopped by
 * readBody's own count.
 */
function refuseOversized(req, res, next) {
  if (Number(req.headers['content-length']) > config.uploads.maxRequest) {
    return next(new HttpError(413, 'That file is too large to upload.'));
  }
  next();
}

function handleError(err, req, res, next) {  // eslint-disable-line no-unused-vars
  const status = Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) console.error(`  [error] ${req.method} ${req.path}\n`, err);
  if (res.headersSent) return res.end();
  /* Anything that asked for JSON gets JSON, not an HTML error page it
     cannot read. An upload past the body limit rejects here, and the media
     picker's fetch would otherwise fail to parse the answer and report
     nothing more useful than "upload failed". */
  if (req.path.startsWith('/cms/api/') || (req.headers.accept || '').includes('application/json')) {
    return json(res, { error: err.message || 'Server error' }, status);
  }
  html(res, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Error</title>
    <body style="font-family:system-ui;padding:56px;max-width:640px;margin:auto;color:#17181a">
    <h1 style="letter-spacing:-.03em">${status === 404 ? 'Page not found' : 'Something went wrong'}</h1>
    <p style="color:#6b7076">${status >= 500 ? 'An unexpected error occurred. The details are in the server log.' : ''}</p>
    <p><a href="/" style="color:#1b87e0">Go to the home page</a></p></body>`, status);
}

function logRequests(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(`  ${req.method} ${req.originalUrl.split('?')[0]} -> ${res.statusCode} (${ms.toFixed(1)}ms)`);
  });
  next();
}
