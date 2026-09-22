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
| Mail | Brevo, or offline to `data/outbox/` | `BREVO_API_KEY`, `MAIL_FROM` |

A hop count in `TRUST_PROXY` (`1`) is only safe when nothing can reach Node
except through that proxy — bind `HOST=127.0.0.1` — or a visitor can name
their own address.

Back up `data/cms.db`, `www/media/` and `www/fonts/`. They are the whole of an
installation's content; everything else is this repository.

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
