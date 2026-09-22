# Smartare Mat server: Express, no nginx

As of 21 September 2026. Written for the sysadmin.

## Summary

Since 21 September the server is one Node process running Express on `0.0.0.0:8080`, with no nginx in front. nginx stays installed on the machine; this project just no longer uses it. Colleagues reach the site at the same address as before.

Images are now made by `sharp` instead of `cwebp` and `gif2webp`, and every image has one small JPG fallback. The whole stack is three npm packages, pinned in `package-lock.json`: express 5.2.1, compression 1.8.2 and sharp 0.35.4.

## Where nginx's jobs went

nginx did no server-side caching here: there was never a `proxy_cache`, only browser cache headers. Everything it did now lives in the app, and `test/server.test.js` checks each job.

| Job | With nginx | Now |
| --- | --- | --- |
| Browser caching | `expires` headers | Same headers from `express.static`: `/assets` 1 h, `/media` 7 days, `/fonts` 1 year immutable |
| Compression | gzip, level 5 | gzip, or brotli when asked, from 512 bytes (`compression`) |
| Static files | Served off disk, with byte ranges for video | `express.static`, with byte ranges (206), which iOS Safari needs to play video |
| Hardened uploads | No-script CSP and `nosniff` on `/media` and `/fonts` | Same headers (`inert()` in `src/app.js`) |
| Oversized uploads | 413 in JSON above 280 MB | 413 in JSON above 260 MB, on the declared length, before the body is read |
| Slow uploads | Buffered, 300 s between reads | 30 minutes per request, 5 minutes of silence allowed (`src/server.js`) |
| Visitor IP and protocol | `X-Real-IP` and `X-Forwarded-Proto`, set by nginx | Ignored unless `TRUST_PROXY` names a proxy |
| Page while Node restarts | A 503 page | None; launchd restarts Node within 10 s |
| Access log | `nginx/logs/access.log` | `LOG_REQUESTS=1`; old logs kept in `data/logs/nginx-until-2026-09-21/` |

Route handlers kept their shape; Express does the matching, and the hand-written router is gone.

## Images: sharp and one JPG fallback

`sharp` now makes every derived image, so a server needs no system image tools, and the `webp` package can be left off. Settings are unchanged: WebP quality 65, method 6, sharp_yuv, and a Mitchell resize that keeps output within 0.3% of what cwebp made.

- **Fallback:** one 800 px JPG per image at quality 50 (mozjpeg), about 24 KB. A transparent image gets a PNG instead.
- **Markup:** pages use `<picture>`, with the WebP set as `<source>` and the JPG as `<img>`. `og:image` and an uploaded favicon point at the JPG.
- **Backfill:** `node scripts/image-backfill.mjs` makes missing fallbacks. `--all` re-encodes from the kept originals, and `--fallbacks` remakes only the JPGs.
- **Database:** two new columns on `media`, `fallback_filename` and `fallback_bytes`. They are in `schema.sql` and were added to this machine's database by hand.

## Open for production

Nothing terminates HTTPS now, and that is the main decision left. Secure cookies and HSTS switch on by themselves once a request arrives over TLS.

| Decision | Options | Setting |
| --- | --- | --- |
| Where TLS ends | A proxy or load balancer in front, or Node with its own certificate | Proxy: set `TRUST_PROXY` and `HOST=127.0.0.1` |
| Which proxy to trust | `loopback` for one on the same machine, its IP for one elsewhere | `TRUST_PROXY` (off by default; `true` is read as `loopback`) |
| Public address | The real domain | `SITE_URL`, and Site URL in CMS Settings |
| Where it listens | Every interface today; loopback behind a proxy | `HOST`, `PORT` (default `0.0.0.0`, `8080`) |

A hop count in `TRUST_PROXY` is only safe if nothing can reach Node except through the proxy. Also needed before going live: `BREVO_API_KEY` for real mail, and backups of `data/cms.db` and `www/media/`.

## Running it

The server needs Node 22.5 or newer (it runs on 26.7) and `npm ci`, and nothing else.

- **Install:** `./start.sh` and `./scripts/autostart.sh install` run `npm ci` themselves when `node_modules` is missing or older than the lockfile.
- **This Mac:** one launchd user agent, `local.smartaremat.node`, managed with `./scripts/autostart.sh` (install, status, restart, uninstall). Logs go to `data/logs/`.
- **Reloading the agent:** `autostart.sh` now waits for launchd to finish unloading the old job before loading the new one. Without that wait, a reload failed with "Input/output error" and left the site down for about 30 s on 21 September.
- **Firewall:** macOS's firewall is on and allows the Homebrew `node` binary by path. After a node upgrade macOS asks once, and the office cannot connect until someone clicks Allow.
- **Settings:** `PORT`, `HOST`, `TRUST_PROXY` and `SITE_URL`, plus `WEBP_QUALITY`, `FALLBACK_WIDTH` and `FALLBACK_QUALITY` for images. The full table is in the README.

## Security, as tested

With Node facing the network directly, forged headers from the LAN change nothing. Probed on 21 September against a copy with the login bypass on, from this machine and from its LAN address.

| Check | Result |
| --- | --- |
| Login bypass from the LAN, including forged `X-Forwarded-For` or `X-Real-IP: 127.0.0.1` | Refused (303 to sign-in) |
| Local request carrying forwarding headers, with no proxy named | Refused, treated as relayed |
| One-time code shown on screen | Only to this machine |
| Forged `X-Forwarded-Proto: https` from the LAN | No HSTS, no Secure cookie |
| Upload declaring more than 260 MB | 413 in JSON, before the body is read |
| Path traversal on `/media` and `/assets` | 403 or 404 |

All 165 unit tests and 132 end-to-end checks pass. `npm audit` reported 0 vulnerabilities at install.
