import { config } from './config.js';
import { createApp } from './app.js';
import { purgeExpired } from './lib/auth.js';
import { ensureSeed } from './db/seed.js';
import { ensureBuiltin } from './lib/fonts.js';
import { detect as detectImages } from './lib/images.js';
import { publishDue } from './models.js';

// Load sharp before the first upload can land, so conversion is either ready
// or has already logged why it is not.
const images = await detectImages();
await ensureSeed();
/* A site with no typeface installed draws in whatever the browser keeps for
   last resort, so an install that has never had one is given the shipped
   family. Does nothing once any font exists - including once the shipped one
   has been removed on purpose. */
ensureBuiltin();
purgeExpired();
setInterval(purgeExpired, 6 * 3600 * 1000).unref();

/* Scheduled publishing. The clock ticks just after each minute turns, since
   a schedule is set to the minute, so 08:00 goes out at 08:00 rather than
   somewhere in the minute after. It re-aims every time instead of trusting an
   interval not to drift, and it runs once now: anything that came due while
   the server was down goes out on start. */
(function scheduleTick() {
  try {
    const count = publishDue();
    if (count) console.log(`  [schedule] published ${count} item${count === 1 ? '' : 's'}`);
  } catch (err) {
    console.error('  [schedule] tick failed:', err.message);
  }
  setTimeout(scheduleTick, 60000 - (Date.now() % 60000) + 250).unref();
}());

const server = createApp().listen(config.port, config.host, (err) => {
  // Express hands a failed listen to this callback rather than throwing it.
  // A server that is not listening has to exit, or launchd never restarts it.
  if (err) throw err;
  const bypass = config.authDisabled ? `  Login bypass:  ON (signed in as ${config.devUser})` : '  Login bypass:  off (one-time token required)';
  const mail = config.brevoApiKey ? '  Mail:          Brevo' : '  Mail:          offline (written to data/outbox/)';
  console.log(`
  Smartare Mat
  ------------------------------------------------------------
  Listening:     http://${config.host}:${config.port}
  Public site:   ${config.siteUrl}
  CMS:           ${config.siteUrl}/cms
  Images:        ${images.available ? images.version : 'unconverted (sharp did not load)'}
${bypass}
${mail}
  ------------------------------------------------------------`);
});

/* nginx used to take a slow upload in full before the app saw a byte of it.
   Node now reads it off the wire itself, and its own default cuts off any
   request still arriving after five minutes - a 200 MB video on a home
   connection takes longer. So: half an hour for the whole of a request, and
   five minutes of silence before a stalled one is dropped, which is what
   nginx allowed between reads. */
server.requestTimeout = 30 * 60 * 1000;
server.timeout = 5 * 60 * 1000;

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n  Shutting down.');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
