# slice-cms

A CMS and the site it serves, in one Node app: Express on `node:sqlite`, three
npm packages (express, compression, sharp). A page is a stack of **slices**; a
slice owns the layout (1–4 columns, split, gap, width, background band) and
**objects** are the content inside a column. The editor is a WYSIWYG canvas
that draws content through `www/assets/blocks.css` — the same stylesheet the
public site uses — so the editor and the site cannot drift apart.

Run it with `./start.sh` (Node 22.5+; it runs `npm ci` itself when needed) and
test it with `npm test`. `NOTES.md` is the long-form record of why things are
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
- **The CMS interface is English.** The site it builds is language-independent.
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

The code still carries the site it was built for. In rough order:

1. **Cut the branding.** `src/db/seed.js` (page tree, site name, address),
   `src/views/cms/layout.js` and `src/views/auth.js` (logos),
   `src/config.js` (mail defaults), `src/lib/mail.js` (sender name, footer),
   `src/server.js` (startup banner), `package.json`, and the
   `www/assets/logo-smartaremat*.svg` files.
2. **Password sign-in, and a first-run admin.** Today's sign-in is a one-time
   code by email or SMS, which needs a Brevo key a fresh install will not have.
   The `users` table has no password column; `scrypt` from `node:crypto` needs
   no new package. Keep the one-time code as an option in Settings for sites
   that want it, and replace the seeded admin with a first-run screen.
3. **The language seam.** About fifteen Swedish strings on the public side
   (`src/views/render.js`, `src/routes/site.js`, `src/views/gate.js`), the
   `?kategori=` query parameter, and the `sv-SE` date defaults in
   `src/lib/util.js`. `src/i18n/en.js` is a 279-key dictionary from an earlier
   pass that nothing imports — the obvious place to start.
4. **A neutral default theme.** The brand lives in `www/assets/tokens.css` and
   `site.css`. The Theme screen already emits colours, fonts, type scale and
   measures as CSS variables from the database (`src/lib/theme.js`), so a fair
   amount of "the look" is data already. Making the remaining pair swappable is
   what turns this into "same CMS, different site".
5. **Before it goes public:** an English README for installers (the current
   `README.md` is Swedish and written for one site), a licence, and a pass over
   `NOTES.md`, which names the client and quotes design arguments verbatim.

## Not in this repo

The database (`data/cms.db`) and uploads (`www/media/`) are an installation's
content, not source, and are ignored. So is `node_modules`. A fresh clone makes
its own database on first start.
