# slice-cms

A CMS and the site it serves, in one Node app: Express on `node:sqlite`, four
npm packages (express, compression, sharp, dotenv — see House rules). A page
is a stack of **slices**; a slice owns the layout (1–4 columns, split, gap,
width, background band) and **objects** are the content inside a column. The
editor is a WYSIWYG canvas that draws content through `www/assets/blocks.css`
— the same stylesheet the public site uses — so the editor and the site
cannot drift apart.

Run it with `./start.sh` (Node 22.5+; it runs `npm ci` itself when needed) -
a fresh database prints a `/cms/setup` address for making the first admin, and
`AUTH_DISABLED=1` skips sign-in from this machine - and test it with
`npm test`. `NOTES.md` is the long-form record of why things are
the way they are; read the relevant section before changing a design decision.

## Where this came from

Lifted out of smartaremat.se on 22 September 2026, at the point where the CMS
was clearly worth reusing — and **that site is now a deployment of this repo**
(23 September 2026), which is what the lift was for. It runs this code from a
clone, its brand in a theme folder beside it, its content in its own `data/`
and `www/media/`. There is no second copy of the CMS any more and nothing to
carry between them: a fix made here reaches that site with `git pull`.

**The repo moved to `JohnDoeInvest/jdi-cms` on 25 September**, when it stopped
being one person's and became the company's. Henrik Olsson runs the servers and
is the only other person working in it — four people in the company, one of
them on deployment.

**There are two lines of this code now, and they are meant to drift**
(2026-09-30). This repo is the company's. `macsmoser/slice-cms` is a private
line developed in a different direction, on a different machine, with no
obligation in either direction — it is **not** an orphan to be archived, which
is what this file said until that date. Nothing here needs to know about it;
the point of the separation is that neither side carries the other. The
reasoning, and the one-remote-per-clone rule that keeps a stray push from
mixing them, is in NOTES under "Two lines of this repo, meant to drift".

**The development checkout is `~/Dev/jdi-cms`** — named after the line rather
than the product, so the path itself says which repo a push reaches. The site's
own folder is the opposite case and **must never be renamed**: `start.sh`
derives the launchd label from `basename "$PWD"`, so renaming `~/Dev/smartaremat`
leaves an autostart agent aimed at a path that is gone.

The brand is a repository of its own — a `tokens.css` and a README — because
a theme is per-site where this is shared, and a designer should be able to
work in one without touching the other. The line is drawn around the **look**,
not around front end and back end: `blocks.css` and `src/views/render.js` draw
the public page and the editor's canvas alike, so a repo boundary through them
would reintroduce exactly the drift this repo exists to prevent.

It is still `macsmoser/smartaremat-theme`, in a personal account, while the
CMS has moved to the company's. Nothing is broken by that — the theme is
cloned into the site as `theme/` and travels inside every backup — but nobody
else can clone it, which the three-step deploy assumes. Worth moving.

The reconciliation is written up in NOTES under "The first real theme". Worth
knowing if a second site ever follows: what a site keeps is its database, its
uploads and a theme repo; everything else is this repository.

## House rules

- **Ask before adding an npm package.** Four is the whole dependency list,
  and it was three until 25 September. Node's own library covers more than
  people expect (`node:sqlite`, `node:crypto` for hashing).
  - **The fourth is `dotenv`**, added by Henrik for production: the company
    keeps configuration in `.env` files and this reads them. Imported in
    `src/server.js` rather than passed as a `--env-file` flag, which is the
    right call — a flag has to be remembered in `start.sh`, the launchd
    plist, a systemd unit and `npm start`, which is the trap `THEME_DIR` had.
    An import travels with the code.
  - **Not yet raised with him:** Node has `process.loadEnvFile()` built in
    since 20.12 — an *API* rather than a flag, so one line in `config.js`
    gets the identical can't-be-forgotten property with no dependency.
    Tested against a realistic file: it strips quotes, handles comments and
    `#` inside quoted values, and base `dotenv` does not expand variables
    either, so there is no functional gap. It is a marginal win on a
    colleague's decision in a shared repo — raise it as "did you know", and
    "we use dotenv across our repos" is a sufficient answer.
  - `.env` and `.env.*` are git-ignored (`.env.example` is not), added
    before the first one existed rather than after somebody pushed a Brevo
    key.
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
- **Everything lands on `main`.** No feature branches. Decided by Henrik on
  2026-10-01, after a short-lived two-branch experiment: two people develop
  this, he carries several other projects, and branches here are a headache
  he does not need. Commit to `main`, push, and let CI report.
  - What replaces review-before-merge is **CI on every push** plus the fact
    that **deployment is still a deliberate `git pull` and restart** on the
    server. Nothing reaches a visitor because something was committed.
  - So the bar for a push to `main` is higher, not lower: run `npm test` and
    `npm run test:e2e` *before* pushing, not after. Red CI on `main` is a
    broken shared trunk rather than a red pull request nobody has merged.
- **Nothing a reader would notice goes live as it is typed.** Pages and
  articles keep draft and live copies; `publish()` is the only thing that
  writes what the public sees.

## What to do next

The list this repo was lifted with is done, and so is the job it was all for:
branding cut, password sign-in, English throughout, the site dictionary, a
neutral default theme, backups, and smartaremat.se moved onto this code with
its brand as a theme.

**What is next is not more of that.** Two threads, both described on
2026-09-25 and written up in NOTES under "What is coming":

1. **stackys.com off Prismic** — Swedish only, so none of the multi-language
   hairball applies; the shop's future is still in discussion. The first
   thing to establish is whether the Prismic content API is reachable,
   because it decides whether the migration is a script or a person retyping
   forty recipes.
2. **Custom slices, per site** — three kinds of recipe and a quick-quote
   calculator, droppable onto any page, *without* every other site carrying
   palette clutter for them. The cheap half (a per-site palette) is an
   afternoon and useful on its own; the module **seam** matters more than a
   module **system**.

Ordinary work still lives in **NOTES.md → "Next up"**: forms before
packaging, a Video object, solid icons, inline buttons. Nothing there blocks
anything.

Two standing jobs with no ticket:

- **This repo has users now.** A change here reaches a running site on the
  next `git pull`. `npm test` and `npm run test:e2e` are what stand between
  the two, and the e2e suite runs green against an empty database, so a fresh
  clone is a fair test. Run them in a *deployment* too: a test that reads its
  expectations off the environment passes on a developer's copy and fails on
  the site, which has happened once already.
  - **Both now run on GitHub as well**, on every push and pull request -
    `.github/workflows/tests.yml`, unit tests on Node 22 and 26 and the e2e
    suite against a fresh installation it builds itself. That is a second
    machine that is nobody's, which is the half of "run it in a deployment"
    that can be automated. It only ever reports; nothing deploys from it.
- **One loose end from the move**: the theme repo is still in a personal
  account. That mattered mildly when it was the only thing there; since
  30 September that account also holds the private line, so the company's
  brand sitting beside it is the confusion the separation exists to remove.
  (The second loose end used to be archiving `macsmoser/slice-cms`. That is
  off — see "two lines of this code" above.)

## Not in this repo

The database (`data/cms.db`) and uploads (`www/media/`) are an installation's
content, not source, and are ignored. So is `node_modules`. A fresh clone makes
its own database on first start.
