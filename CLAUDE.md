# slice-cms

A CMS and the site it serves, in one Node app: Express on `node:sqlite`, three
npm packages (express, compression, sharp). A page is a stack of **slices**; a
slice owns the layout (1–4 columns, split, gap, width, background band) and
**objects** are the content inside a column. The editor is a WYSIWYG canvas
that draws content through `www/assets/blocks.css` — the same stylesheet the
public site uses — so the editor and the site cannot drift apart.

Run it with `./start.sh` (Node 22.5+; it runs `npm ci` itself when needed) -
a fresh database prints a `/cms/setup` address for making the first admin, and
`AUTH_DISABLED=1` skips sign-in from this machine - and test it with
`npm test`. `NOTES.md` is the long-form record of why things are
the way they are; read the relevant section before changing a design decision.

## Where this came from

Lifted out of smartaremat.se on 22 September 2026, at the point where the CMS
was clearly worth reusing. **That site still runs its own copy of this code**,
so the two drift from today: a fix made there is not here unless somebody
carries it over. The plan that ends this is to make that site a deployment of
this repo with its own theme — item 1 below.

## House rules

- **Ask before adding an npm package.** Three is the whole dependency list.
  Node's own library covers more than people expect (`node:sqlite`,
  `node:crypto` for hashing).
- **The CMS interface is English.** Its strings sit inline beside their
  neighbours; there is no dictionary for them and there is not going to be.
- **The site's own words follow `site_language`.** "Read more", "Send",
  "Page not found", the site's aria-labels and the locale its dates are
  written in all come from `src/lib/words.js`, reached as `ctx.words`. A word
  added there is added in every language there. What an *author* writes is in
  whatever language they write it in, and always beats the dictionary.
- **Stored content stays semantic.** Page JSON is `{kind, props, style}` —
  intent, never CSS. Presentation lives in `blocks.css`.
- **Two token sets, deliberately separate.** `cms-tokens.css` (`--ui-*`) is the
  editor's; `tokens.css` belongs to the site being edited. A new CMS rule takes
  `--ui-*` names and must be checked in light *and* dark.
- **A default the panel can set is a stored number**, not a stylesheet rule, or
  the editor shows 0 for spacing the page actually has.
- **Nothing a reader would notice goes live as it is typed.** Pages and
  articles keep draft and live copies; `publish()` is the only thing that
  writes what the public sees.

## What to do next

The five-point list this repo was lifted with is done: branding cut, password
sign-in with a first-run admin, English throughout, a neutral default theme
with `THEME_DIR` for a site's own, and an installer README with the AGPL. So
is the site dictionary (`src/lib/words.js`, 2026-09-23), which was the thing
blocking the first item below. What is left:

1. **Switch smartaremat.se onto this repo.** The theme is built and checked;
   only the cutover is left. The brand lives in
   `/Users/macs/Dev/smartaremat-theme` (`tokens.css` and `favicon.svg`, no
   `site.css` - see NOTES, "The first real theme"), verified on 2026-09-23 by
   rendering that site's own database through this code on a spare port: 22 of
   23 pages byte-identical to the running site.

   The site runs from `/Users/macs/Dev/smartaremat` under a launchd agent,
   `local.smartaremat.node`, on :8080. The cutover keeps all of that - same
   folder, same agent, same port, same `data/cms.db`, `www/media` and
   `www/fonts`. What changes is `src/`, `www/assets/`, `scripts/`, `test/`
   and the root files.

   What has to happen, and what to watch:
   - **`THEME_DIR` must reach the server**, which means the
     `EnvironmentVariables` dict in
     `~/Library/LaunchAgents/local.smartaremat.node.plist`, not only
     `start.sh`. Without it the site comes up in the neutral default theme -
     white bar, grey palette - the most visible way this can go wrong and the
     easiest to miss in a log.
   - **`?kategori=` becomes `?category=`**, with no alias. Chip links already
     given out or indexed stop filtering: they land on the unfiltered feed
     rather than a 404. The one URL the move costs.
   - **Sign-in stays on one-time codes**, because those users have no
     password: `keepCodeForOldInstalls()` sees to it, and the column
     migration adds `users.password_hash` by itself. With no `BREVO_API_KEY`
     the code prints on the page for a request from that machine.
   - **The CMS interface becomes English.** The site's own words stay
     Swedish - `site_language` is already `sv` there.
   - `logo_dark_media` goes unused: this repo's CMS draws its own mark, and
     Settings holds one logo. Nothing to do; the row stays in the table.
   - Its menus are named `Huvudmeny`/`Extramenu`; the site finds the secondary
     menu by name (`EXTRA_MENU` in `src/db/seed.js`) and falls back to the
     first non-main menu, so both are reached either way.

   Rolling back is `git reset --hard` in that folder, which is a clean
   checkout of its own history - worth keeping true by not committing there
   during the cutover.

## Not in this repo

The database (`data/cms.db`) and uploads (`www/media/`) are an installation's
content, not source, and are ignored. So is `node_modules`. A fresh clone makes
its own database on first start.
