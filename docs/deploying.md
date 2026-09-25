# Deploying Slice

Slice is one Node process running Express. There is no nginx in front and
none is needed: the jobs a web server usually does are done by the app, and
`test/server.test.js` checks each of them. This note is for whoever puts it
on a machine the public can reach.

## What the app does in a web server's place

| Job | How |
| --- | --- |
| Browser caching | `express.static` headers: `/assets` 1 hour (every URL carries a version), `/media` 7 days, `/fonts` a year, immutable |
| Compression | gzip, or brotli when the browser asks, for anything textual over 512 bytes (`compression`) |
| Static files | Served off disk with byte ranges (206), which iOS Safari needs to play video |
| Hardened uploads | A no-script CSP and `nosniff` on `/media` and `/fonts`, so an uploaded SVG cannot run script on your origin (`inert()` in `src/app.js`) |
| Oversized uploads | Refused with a 413 in JSON on the declared length, before the body is read (`UPLOAD_MAX_*`) |
| Slow uploads | 30 minutes per request, and 5 minutes of silence before a stalled one is dropped (`src/server.js`) |
| Visitor address and protocol | Taken from the socket; forwarding headers are ignored unless `TRUST_PROXY` names a proxy |
| Access log | `LOG_REQUESTS=1` |

Images are made by `sharp`, so the server needs no image tools of its own:
WebP at several widths, plus one small JPG per image for browsers and link
previews that cannot read WebP. `node scripts/image-backfill.mjs` makes
whatever is missing after an upgrade.

## Decisions to make before it goes public

Nothing terminates HTTPS by default, and that is the main one. The `Secure`
cookie flag and HSTS switch on by themselves once requests arrive over TLS.

| Decision | Options | Setting |
| --- | --- | --- |
| Where TLS ends | A proxy or load balancer in front (Caddy, a cloud load balancer, nginx if you have one), or Node with its own certificate | Behind a proxy: `TRUST_PROXY` and `HOST=127.0.0.1` |
| Which proxy to believe | `loopback` for one on the same machine, its address for one elsewhere | `TRUST_PROXY` (off by default; `true` is read as `loopback`) |
| Public address | Your domain | `SITE_URL`, then Settings → Site address |
| Where it listens | Every interface by default; loopback behind a proxy | `HOST`, `PORT` (`0.0.0.0`, `8080`) |
| Mail | Brevo, or offline to `data/outbox/` | `BREVO_API_KEY`, `MAIL_FROM` — see [Turning mail on](#turning-mail-on) |
| A site's own look | A `theme/` folder beside the code, found by itself | `THEME_DIR` only to keep it elsewhere |

A hop count in `TRUST_PROXY` (`1`) is only safe when nothing can reach Node
except through that proxy — bind `HOST=127.0.0.1` — or a visitor can name
their own address.

## Backing a site up, and moving one

`data/cms.db`, `www/media/` and any *uploaded* typefaces are the whole of an
installation's content; everything else is this repository. The folders they
live in hold other things too — `data/outbox/`, `data/logs/`, `www/assets/`,
the typefaces that ship with the repo — so "copy `data` and `www`" is wrong
in both directions.

```bash
npm run backup                    # ./<site>-2026-09-24.zip
npm run backup -- /backups/x.zip  # somewhere of your choosing
```

The same archive is a button in the CMS, under **Settings → Backup**, for
anyone who has no shell on the machine. Administrators only: it changes
nothing, but it contains everything, the users table and every message
among it. It is built in memory and sent whole, so it briefly costs a few
times the archive's size — a few times a year, from one person, which is
what it was sized for.

Safe against a live site: the database is copied with `VACUUM INTO`, which is
consistent while the server has the file open. Copying `cms.db` by hand while
the server runs is *not* — a running site keeps a write-ahead log beside it,
and the copy silently lacks the newest content.

**The paths inside the archive mirror the destination**, so moving a site is:

```bash
git clone <this repository> newsite && cd newsite
unzip ~/site-2026-09-24.zip      # every file lands where it belongs
./start.sh
```

That includes the theme, which restores to `theme/` — the folder an
installation looks in without being told. There is nothing to set.

`manifest.json` inside carries the row counts it was taken with and the
commit of the CMS it came off, so the far end can tell it arrived whole and
judge version skew rather than discover it.

A backup is refused if the database does not pass its own `integrity_check`,
on the grounds that a corrupt backup is the kind you find out about when you
need it.

### Onto a machine that already has a site

`unzip` **adds and overwrites; it does not remove.** The database is replaced
cleanly, but uploads the old site had and the archive does not are still
there afterwards — orphans, harmless but not a clean restore. And the server
has to be **stopped first**: overwriting `cms.db` underneath a running
process leaves it writing to an unlinked file, which silently resurrects the
old data.

So for a second restore onto a populated machine, by hand:

```bash
./stop.sh                              # or ./scripts/autostart.sh uninstall
mv data/cms.db data/cms.db.replaced    # keep what you are replacing
mv www/media www/media.replaced
unzip ~/site-2026-09-24.zip
./start.sh
```

Onto an empty clone none of that applies, and the unzip is the whole job.

### The first sign-in on the new machine

Worth settling **before** the backup is taken, because the archive carries
the users table and the sign-in setting with it.

A site set to **one-time code** sign-in, on a machine with no
`BREVO_API_KEY`, shows the code on the page only for a request from that
machine — `fromThisMachine(req)` in `src/routes/auth.js`. Deployed to a
server and opened from a laptop, there is no code on screen and none in the
post, so **nobody can sign in**.

There is a way through: the code is written to `data/outbox/` on the server,
and whoever is deploying has a shell.

```bash
ls -t data/outbox | head -1 | xargs -I{} cat data/outbox/{}
```

But the better answer is to not need it. Before handing a site over, in this
order:

1. **Account → set a password** for at least one administrator.
2. **Settings → sign-in →** *Password*, or *Password, or a one-time code* if
   codes should stay available once mail is configured.
3. *Then* take the backup.

Settings refuses to switch to passwords-only when the administrator making
the change has none, which is the same trap seen from the other side.

## Keeping it running

- **Install:** `./start.sh` and `./scripts/autostart.sh install` run `npm ci`
  themselves when `node_modules` is missing or older than the lockfile. Node
  22.5 or newer, and nothing else.
- **macOS:** `./scripts/autostart.sh` installs a launchd user agent named after
  the directory (`local.<folder>.node`), with `install`, `status`, `restart` and
  `uninstall`. Logs go to `data/logs/`. It waits for launchd to finish
  unloading the old job before loading the new one; without that wait a
  reload can fail with "Input/output error" and leave the site down for half a
  minute.
- **macOS firewall:** if it is on, it allows `node` by path. After a Node
  upgrade macOS asks once, and nothing on the network can connect until
  someone clicks Allow.
- **Linux:** run `node src/server.js` from the repository root under systemd
  or another process manager. A restart takes a second or two, and there is
  no holding page while it happens.

## Turning mail on

Without `BREVO_API_KEY` every message is written to `data/outbox/` and logged,
so forms and sign-in are testable offline. Two variables switch it to real
delivery:

| Variable | What it is |
| --- | --- |
| `BREVO_API_KEY` | The Brevo transactional key. Its presence is what decides offline or live. |
| `MAIL_FROM` | The sender address. Defaults to `noreply@<host of SITE_URL>`, which is almost never a sender Brevo will accept. |

`MAIL_FROM_NAME` is optional and falls back to the site's name. `CONTACT_TO`
is only the last resort for a form that names no recipient and a Settings
screen that names none either — set the recipient on the form instead.

**The sender has to be verified in Brevo**, as an address or a whole domain.
An unverified one is the usual reason a key is in place and nothing arrives.

**Both variables go where the service reads its environment**, not in
`start.sh` — the same rule `THEME_DIR` follows. Under launchd that is the
`EnvironmentVariables` dict in
`~/Library/LaunchAgents/local.<folder>.node.plist`; under systemd,
`Environment=` lines or an `EnvironmentFile=`. The process only reads them at
launch, so the service has to be restarted, and the start-up banner says
which mode it came up in — `Mail: offline (written to data/outbox/)` means
the variable never reached it.

### Do this before, not after: sign-in depends on it

A site set to **one-time code** sign-in prints the code on the login page
while there is no key, and emails it once there is one — `requestCode()`
returns the code to the page only when `config.brevoApiKey` is empty. So the
moment a key is added, getting into the CMS depends on mail working, and a
sender that is not verified yet locks out anyone without a live session.

Two ways round it, and the first is better:

- **Set Settings → sign-in to password** before adding the key. The CMS then
  never depends on mail; forms still use it.
- Or add the key while signed in, and confirm a real message arrives before
  signing out. Sessions last 30 days, so there is room to fix a sender.

### When something does not arrive

A form submission that cannot be delivered is still **kept**: the message is
recorded with `delivered: false` and is in the CMS under Messages. Nothing is
lost while a sender is being sorted out, and the visitor is not shown an
error.

The reason is on stderr — `  [form] delivery failed: …` with Brevo's status
code and response — which under launchd is `data/logs/<label>.err.log`.

## First run on a server

The start-up banner prints a `/cms/setup?token=…` address until the first
administrator exists. On a remote machine that token is the only way to
reach the setup screen, so read it from the service's log (`journalctl`,
`data/logs/`) and open it before telling anyone the address.

## Security, as tested

Probed against a copy with the login bypass on, from the machine itself and
from its LAN address:

| Check | Result |
| --- | --- |
| Login bypass from the LAN, including forged `X-Forwarded-For` or `X-Real-IP: 127.0.0.1` | Refused (303 to sign-in) |
| A local request carrying forwarding headers, with no proxy named | Refused, treated as relayed |
| A one-time code shown on screen | Only to the machine itself |
| First-run screen from the LAN without its token | Refused (403) |
| Forged `X-Forwarded-Proto: https` from the LAN | No HSTS, no `Secure` cookie |
| An upload declaring more than 260 MB | 413 in JSON, before the body is read |
| Path traversal on `/media`, `/assets` and a theme folder | 403 or 404 |
