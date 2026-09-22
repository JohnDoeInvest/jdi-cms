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
this repo with its own theme — item 4 below.

## House rules

- **Ask before adding an npm package.** Three is the whole dependency list.
  Node's own library covers more than people expect (`node:sqlite`,
  `node:crypto` for hashing).
- **The CMS interface is English, and so are the site's own words** ("Read
  more", "Page not found"). What an author writes is in whatever language
  they write it in.
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
with `THEME_DIR` for a site's own, and an installer README with the AGPL.
What is left:

1. **Make smartaremat.se a deployment of this repo.** Its `tokens.css`,
   `site.css`, logo and favicon go in a theme folder of its own, served with
   `THEME_DIR`. Two things will not carry over by themselves: its public
   strings were Swedish and this repo's are English only now (a small
   dictionary would be the way back, if it wants them), and its menus are
   named `Huvudmeny`/`Extramenu` - the site finds the secondary menu by name
   (`EXTRA_MENU` in `src/db/seed.js`) but falls back to the first non-main
   menu, so it should still work. Its users have no passwords yet, so on
   first start it stays on one-time codes (`keepCodeForOldInstalls`).
2. **The e2e check "the feed offers its subject chips" fails on an empty
   database**, and did before the list above. It files a live article under a
   category, which is held as a draft, so no published article carries a
   category and the chip row has nothing to offer. Publishing after filing
   should fix it.

## Not in this repo

The database (`data/cms.db`) and uploads (`www/media/`) are an installation's
content, not source, and are ignored. So is `node_modules`. A fresh clone makes
its own database on first start.
