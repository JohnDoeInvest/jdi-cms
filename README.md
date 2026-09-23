# Slice

A CMS and the website it serves, in one small Node app.

A page is a stack of **slices**. A slice owns the layout — one to four
columns, how they split, the gap, the width, a background band — and
**objects** are the content inside a column: headings, text, images,
buttons, tables, forms, article feeds, embeds. The editor is a WYSIWYG
canvas that draws content through the same stylesheet the public site uses,
so what you see while editing is what visitors get.

- **Small.** Express on Node's built-in `node:sqlite`, and three npm packages
  in all: `express`, `compression` and `sharp`.
- **Self-hosted all the way down.** Typefaces are uploaded files, never a font
  CDN; images are converted on your machine; nothing about a visitor is handed
  to a third party to draw a page.
- **Nothing goes live as it is typed.** Pages and articles keep a draft and a
  live copy. Publishing — now or at a set time — is the only thing that
  changes what the public sees.
- **Your look, not ours.** Colours, typefaces, sizes and measures are set in
  the CMS; the rest of a site's look is two stylesheets you can replace
  without forking.

The CMS interface is English. The site it builds is whatever language you
write it in — and the handful of words the site supplies for itself ("Read
more", "Send", "Page not found"), along with the way it writes dates, follow
the **Content language** you set in Settings. English and Swedish ship; a
language with no words of its own is furnished in English and still says in
its markup what it is written in. Adding one is a block of about thirty
strings in `src/lib/words.js`.

---

## Requirements

- **Node.js 22.5 or newer** — `node:sqlite` arrived in 22.5. Tested on Node 26.
- **Nothing else.** `sharp` ships its own libvips for macOS and Linux. If it
  cannot load, uploads are stored as they arrive and the media library says so.

## Install and first run

```bash
git clone <this repository> slice
cd slice
./start.sh
```

`./start.sh` runs `npm ci` when `node_modules` is missing or older than the
lockfile, creates `data/cms.db` with a starting structure — Home, About,
News and Contact pages and two menus — and starts the server on
port 8080. Stop it with `Ctrl+C` or `./stop.sh`.

The first time, the start-up banner prints a line like this:

```
  First run:     http://localhost:8080/cms/setup?token=f1IEfqlzXg9VgPuNlVJTJzaM
```

Open it and create the first account, which is an administrator. From the
machine the server runs on, `/cms/setup` works without the token; from
anywhere else it needs it, so nobody else on the network can claim the site
in the minutes before you do. Once an administrator exists the screen is gone
for good.

| Address | What |
|---|---|
| <http://localhost:8080> | The public site |
| <http://localhost:8080/cms> | The CMS |

Then, in the CMS: **Settings** for the site's name, address, logo and footer;
**Theme** for colours, typefaces and sizes; **Users** to invite people.

## Signing in

People sign in with an email address and a password. Passwords are hashed
with scrypt from `node:crypto`; five wrong guesses at one address shut it for
fifteen minutes. Everyone can change their own password under **Account**,
and an administrator can set anyone's under **Users**.

**Settings → Sign-in** offers two alternatives, for sites that want them:

- **Password, or a one-time code** — a six-digit code by email or SMS, as well
  as the password.
- **One-time code only** — nobody keeps a password at all.

Codes need a way to reach people, which is `BREVO_API_KEY` (below). Without
one, every message is written to `data/outbox/` instead, and a code is also
shown on screen — but only to a request from the server's own machine, since
anywhere else that would be a way in for anybody.

A phone number typed without a country code is read as local to the
**Country** in Settings.

### Working locally without signing in

```bash
AUTH_DISABLED=1 ./start.sh
```

The CMS opens without a password as `DEV_USER`, or as the first administrator
when that is unset, and the menu rail says *Sign-in disabled* so the state is
never ambiguous. It only ever applies to requests from the machine itself:
the server listens on every interface, and anyone else still gets the sign-in
screen, whatever headers they send.

## Mail

Sign-in codes and form submissions go out through
[Brevo](https://www.brevo.com)'s transactional API when a key is set:

```bash
BREVO_API_KEY=xkeysib-... MAIL_FROM=noreply@example.com ./start.sh
```

Without a key nothing is sent: each message is written to `data/outbox/` and
logged, so the whole flow works offline. Form messages are also kept in the
database either way. Mail is sent from the site's name unless
`MAIL_FROM_NAME` says otherwise.

## Making it look like your site

Two layers, and most sites only need the first.

**The Theme screen** stores a palette (each colour carries the text colour
that reads on it), the body and heading typefaces, the nine type sizes the
editor offers, and the page measures. They are emitted as CSS variables on
every page, and change the moment you save.

**A theme folder** holds everything else. The default look is
`www/assets/tokens.css` (design tokens: greys, accent, spacing, radii, and
the colours of the top bar, sub menu and footer) and `www/assets/site.css`
(the site's furniture). Point `THEME_DIR` at a folder of your own and any
file in it is served in place of the one with the same name:

```
my-theme/
  tokens.css     your colours and tokens — start from a copy of www/assets/tokens.css
  site.css       optional: your own top bar, footer, cards…
  favicon.svg    optional
```

```bash
THEME_DIR=/srv/my-theme ./start.sh
```

Anything the folder doesn't have falls through to the default, so a theme can
be a single `tokens.css`. Keep your theme in its own repository and this one
stays updatable. `www/assets/blocks.css` draws the content objects, and the
editor's canvas uses the same file; override it only if you mean the editor
to change with it.

Typefaces are uploaded under **Theme → Typefaces** (woff2 preferred). The
CMS itself has its own tokens in `cms-tokens.css`, deliberately separate, so
no site theme can move the editor's interface.

## Keeping it running

On macOS, `scripts/autostart.sh` installs a launchd user agent that starts
the server at login and restarts it if it stops:

```
./scripts/autostart.sh install     install the agent and start now
./scripts/autostart.sh status      what is loaded and listening
./scripts/autostart.sh restart     restart it
./scripts/autostart.sh uninstall   stop and remove the agent
```

It runs as the logged-in user, needs no root, and logs to `data/logs/`. It
starts at login, not at boot. On Linux, run `node src/server.js` from the
repository root under systemd or any process manager, with the environment
below.

Node faces the network directly — there is no nginx to configure. For HTTPS,
a proxy in front, and what the app does in nginx's place, see
[docs/deploying.md](docs/deploying.md).

## Configuration

Everything that differs between one site and the next is in **Settings**.
The environment holds only what carries a secret or decides how the server
starts.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on |
| `HOST` | `0.0.0.0` | Interface to listen on; `127.0.0.1` keeps it local, as it should be behind a proxy |
| `SITE_URL` | `http://localhost:<PORT>` | The public address; the starting value for Settings → Site address |
| `TRUST_PROXY` | *(off)* | A proxy allowed to report the visitor's address and protocol: `loopback` for one on this machine, otherwise its address |
| `THEME_DIR` | *(none)* | A folder whose files replace the defaults in `www/assets` |
| `DB_PATH` | `data/cms.db` | Where the database lives |
| `BREVO_API_KEY` | *(none)* | Sends mail and SMS; without it they go to `data/outbox/` |
| `MAIL_FROM` | `noreply@<host of SITE_URL>` | Sender address |
| `MAIL_FROM_NAME` | *(the site name)* | Sender name |
| `CONTACT_TO` | *(none)* | Where forms deliver when neither the form nor Settings names anyone |
| `AUTH_DISABLED` | `0` | `1` opens the CMS without signing in, from this machine only |
| `DEV_USER` | *(first admin)* | Who `AUTH_DISABLED=1` signs you in as |
| `LOG_REQUESTS` | `0` | `1` logs every request |
| `UPLOAD_MAX_MB` | `25` | Largest image or document upload |
| `UPLOAD_MAX_VIDEO_MB` | `200` | Largest video upload |
| `WEBP_QUALITY` | `65` | WebP quality for photographs, 0–100 |
| `WEBP_METHOD` | `6` | libwebp effort, 0–6 (6 is smallest and slowest) |
| `FALLBACK_WIDTH` | `800` | Width of the one JPG kept for browsers without WebP |
| `FALLBACK_QUALITY` | `50` | Its JPG quality, 0–100 |

## Backups and upgrades

An installation's content is three places, all ignored by git:

- `data/cms.db` — pages, articles, settings, users (with its `-wal` file
  while the server runs; copy it with `sqlite3 data/cms.db ".backup out.db"`
  or stop the server first)
- `www/media/` — uploads, and the originals kept beside each converted image
- `www/fonts/` — uploaded typefaces

To upgrade, pull and restart. A new column is added to an existing database
on start; anything bigger comes as a one-off script in `scripts/`, named for
what it migrates, and the release that needs it says so.

## Development

```bash
npm run dev          # restart on every change
npm test             # unit tests, including the Express app itself
npm run test:e2e     # against a running server: E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e
npm run test:clean   # clear what an interrupted e2e run left behind
npm run reset        # wipe the database and seed it again (refuses while the server is up)
```

```
src/
  server.js          start-up: seed, clock, listen
  app.js             Express: static files, routes, errors
  config.js          the environment, and nothing else
  models.js          every table's reads and writes
  routes/            site.js (public), auth.js, cms/*.js (one file per screen)
  views/             server-rendered HTML; render.js draws slices and objects
  lib/               auth, passwords, theme, media, fonts, mail, …
  db/                schema.sql and the starting structure
www/assets/          blocks.css (content), tokens.css + site.css (the default theme),
                     cms-*.css/js (the editor)
test/                node --test
```

[`NOTES.md`](NOTES.md) is the long-form record of why things are the way
they are. Read the relevant part before changing a design decision.

## Licence

[GNU Affero General Public License v3.0](LICENSE). You may run, change and
share Slice freely; if you run a modified version as a service for others,
you have to offer them its source.
