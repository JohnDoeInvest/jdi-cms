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
was clearly worth reusing — and **that site is now a deployment of this repo**
(23 September 2026), which is what the lift was for. It runs this code from a
clone, its brand in a theme folder beside it, its content in its own
`data/` and `www/media/`. There is no second copy of the CMS any more and
nothing to carry between them: a fix made here reaches that site with
`git pull`.

That brand is a repository of its own — `macsmoser/smartaremat-theme`, two
files and a README — because a theme is per-site where this is shared, and a
designer should be able to work in one without touching the other. The line
is drawn around the **look**, not around front end and back end:
`blocks.css` and `src/views/render.js` draw the public page and the editor's
canvas alike, so a repo boundary through them would reintroduce exactly the
drift this repo exists to prevent.

The reconciliation is written up in NOTES under "The first real theme". Worth
knowing if a second site ever follows: what a site keeps is its database, its
uploads and a theme repo; everything else is this repository.


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

The list this repo was lifted with is done, and so is the job it was all for.
Branding cut, password sign-in with a first-run admin, English throughout, a
neutral default theme with `THEME_DIR`, an installer README with the AGPL,
the site dictionary (`src/lib/words.js`), and smartaremat.se moved onto this
code with its brand as a theme.

What is left is ordinary work, and it lives in **NOTES.md → "Next up"**:
forms before packaging, a Video object, solid icons, inline buttons. Nothing
there blocks anything else.

One standing job with no ticket: **the deployment is now a user of this repo**,
so a change here can break a running site. `npm test` and `npm run test:e2e`
are what stand between the two; the e2e suite runs green against an empty
database, so a fresh clone is a fair test.


## Not in this repo

The database (`data/cms.db`) and uploads (`www/media/`) are an installation's
content, not source, and are ignored. So is `node_modules`. A fresh clone makes
its own database on first start.
