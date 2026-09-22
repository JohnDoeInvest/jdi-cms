PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY,
  full_name    TEXT    NOT NULL DEFAULT '',
  email        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  phone        TEXT    NOT NULL DEFAULT '',
  role         TEXT    NOT NULL DEFAULT 'visitor',   -- visitor | editor | admin
  image_id     INTEGER REFERENCES media(id) ON DELETE SET NULL,
  country      TEXT    NOT NULL DEFAULT 'SE',
  address      TEXT    NOT NULL DEFAULT '',
  zip          TEXT    NOT NULL DEFAULT '',
  city         TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login   TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_tokens (
  id         INTEGER PRIMARY KEY,
  identifier TEXT    NOT NULL,          -- normalised e-mail or +46 phone
  channel    TEXT    NOT NULL,          -- email | sms
  code       TEXT    NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  consumed   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_tokens_ident ON login_tokens(identifier);

-- ---------------------------------------------------------------- media
CREATE TABLE IF NOT EXISTS media (
  id            INTEGER PRIMARY KEY,
  filename      TEXT    NOT NULL,        -- stored name inside www/media
  original_name TEXT    NOT NULL,
  mime          TEXT    NOT NULL,
  bytes         INTEGER NOT NULL DEFAULT 0,
  width         INTEGER,
  height        INTEGER,
  alt           TEXT    NOT NULL DEFAULT '',
  caption       TEXT    NOT NULL DEFAULT '',
  -- The untouched upload, kept beside the WebP so quality can be retuned or
  -- new widths added later without re-uploading. Empty when nothing was
  -- converted (SVG, video, PDF) and `filename` is itself the original.
  source_filename TEXT  NOT NULL DEFAULT '',
  source_bytes  INTEGER NOT NULL DEFAULT 0,
  -- JSON [{filename,width,height,bytes}], narrowest first, for srcset.
  variants      TEXT    NOT NULL DEFAULT '',
  -- One small JPG (a PNG when transparent) for browsers that cannot show the
  -- WebP. Empty when there is none, and the page then draws a plain <img>.
  fallback_filename TEXT NOT NULL DEFAULT '',
  fallback_bytes INTEGER NOT NULL DEFAULT 0,
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------- categories
-- ---------------------------------------------------------------- fonts
-- The typefaces the site draws with.
--
-- Uploaded, never fetched. Nothing in this product asks a font CDN for
-- anything, so no visitor's address leaves the building to render a page -
-- which is the whole reason a self-hosted install exists. A fresh install
-- ships one family (Inter) so it has something to draw with; everything else
-- arrives as files somebody put here on purpose.
--
-- `faces` is JSON [{weight,style,filename,format,bytes}] rather than a table
-- of its own: nothing ever queries across faces, a family is read whole or
-- not at all. `weight` is a string because a variable font's face covers a
-- range - "100 900" is as valid a font-weight as "400".
CREATE TABLE IF NOT EXISTS fonts (
  id          INTEGER PRIMARY KEY,
  slug        TEXT    NOT NULL UNIQUE,          -- what a theme stores
  name        TEXT    NOT NULL,
  faces       TEXT    NOT NULL DEFAULT '[]',
  -- What follows the family in the CSS stack when a glyph is missing.
  fallback    TEXT    NOT NULL DEFAULT 'sans',  -- sans | serif | mono
  -- Shipped with the install rather than uploaded. Only decides what the
  -- screen says; a builtin is removable like any other once it is not the
  -- last one left.
  builtin     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  slug       TEXT    NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------- articles
CREATE TABLE IF NOT EXISTS articles (
  id           INTEGER PRIMARY KEY,
  title        TEXT    NOT NULL DEFAULT '',
  slug         TEXT    NOT NULL UNIQUE,
  -- The page an article appears under. An article is content rather than a
  -- place, but it still needs one address - and a URL whose every segment is
  -- somewhere you can actually go beats one naming the feed it is listed in.
  parent_id    INTEGER REFERENCES pages(id) ON DELETE SET NULL,
  -- Composed from the parent and the slug, then frozen at publish exactly as
  -- the slug is. Stored rather than derived so routing is one lookup and a
  -- clash with a page's address is something that can be checked for.
  permalink    TEXT    NOT NULL UNIQUE,
  lead         TEXT    NOT NULL DEFAULT '',
  -- An article is written on the same canvas a page is. Slices and objects,
  -- not a blob of HTML: an <img> inside a contenteditable region has no
  -- reliable selected state and its caption is a separate node, so deleting
  -- the picture left the caption behind. Two copies, exactly as a page has -
  -- the editor autosaves the draft and publishing is what moves it across.
  content       TEXT   NOT NULL DEFAULT '[]',
  draft_content TEXT   NOT NULL DEFAULT '[]',
  -- The same for everything that is not blocks: see the note on pages.
  draft_meta    TEXT   NOT NULL DEFAULT '{}',
  image_id     INTEGER REFERENCES media(id) ON DELETE SET NULL,
  status       TEXT    NOT NULL DEFAULT 'draft',  -- draft | published
  author_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  views        INTEGER NOT NULL DEFAULT 0,
  cta_label    TEXT    NOT NULL DEFAULT '',
  cta_url      TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  published_at TEXT
);
-- What an article is *about*, and there can be more than one: a piece on
-- hiring for the new line is about Produktion and Jobb & karriär both, and
-- filing it under one leaves it missing from the other page. The lowest
-- `position` is the primary subject - what a card shows and a breadcrumb
-- names. There is deliberately no separate "tags" taxonomy: two of them means
-- answering "is this a category or a tag?" on every article, forever.
--
-- Note what is *not* here: a category meaning "news". Every article is news;
-- the news page is the unfiltered feed, not a filter.
CREATE TABLE IF NOT EXISTS article_categories (
  article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (article_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_article_categories_cat ON article_categories(category_id);

-- --------------------------------------------------------------- slices
-- A slice is a reusable arrangement of objects, built in the Slice Designer.
CREATE TABLE IF NOT EXISTS slices (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  definition TEXT    NOT NULL DEFAULT '[]',  -- JSON array of objects
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------ page templates
CREATE TABLE IF NOT EXISTS templates (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  slug       TEXT    NOT NULL UNIQUE,
  page_type  TEXT    NOT NULL DEFAULT 'default', -- the frame a new page gets
  definition TEXT    NOT NULL DEFAULT '[]',      -- JSON array of blocks: a saved page
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------- pages
CREATE TABLE IF NOT EXISTS pages (
  id               INTEGER PRIMARY KEY,
  title            TEXT    NOT NULL DEFAULT '',
  -- Where a page sits, and what it is called there. An article has had both
  -- since it was written; a page had neither, and its whole address was one
  -- free-text box - so a trail was whatever somebody typed, `/varumarken/x`
  -- could exist while `/varumarken` did not, and renaming a parent stranded
  -- its children with no warning. The pair is the containment: with no box to
  -- type a path into, an unreachable path cannot be written.
  parent_id        INTEGER REFERENCES pages(id) ON DELETE SET NULL,
  slug             TEXT    NOT NULL DEFAULT '',  -- one segment, '' for the landing page
  -- Composed from the parent and the slug, then frozen at publish exactly as
  -- an article's is. Stored rather than derived so routing stays one lookup
  -- and a clash with an article's address is something that can be checked.
  permalink        TEXT    NOT NULL UNIQUE,      -- '/' for the landing page
  page_type        TEXT    NOT NULL DEFAULT 'default', -- default | landing | blank
  submenu_id       INTEGER REFERENCES menus(id) ON DELETE SET NULL,
  meta_title       TEXT    NOT NULL DEFAULT '',
  meta_description TEXT    NOT NULL DEFAULT '',
  og_image_id      INTEGER REFERENCES media(id) ON DELETE SET NULL,
  use_first_image  INTEGER NOT NULL DEFAULT 1,
  content          TEXT    NOT NULL DEFAULT '[]', -- published blocks: what the public sees
  draft_content    TEXT    NOT NULL DEFAULT '[]', -- the working copy the editor writes
  -- Everything that is not blocks and not live-by-nature, pending publication.
  -- The draft/published split used to cover `content` alone, so a title typed
  -- into a live page was on the public site before the keystroke finished -
  -- and Publish had nothing left to do. One JSON column rather than a twin
  -- per field, so a setting added later is drafted without a migration.
  -- Empty means nothing is pending; a value equal to the live one is pruned
  -- on the way in, so "edited" cannot be true of a change nobody made.
  draft_meta       TEXT    NOT NULL DEFAULT '{}',
  -- Empty means public. Anything else is the shared password the page asks
  -- for; kept readable so an editor can pass it on, which is the whole point
  -- of a page password (see src/lib/gate.js).
  password         TEXT    NOT NULL DEFAULT '',
  status           TEXT    NOT NULL DEFAULT 'draft',
  views            INTEGER NOT NULL DEFAULT 0,
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  published_at     TEXT
);

-- ------------------------------------------------------------ schedules
-- A publish that happens later: one per page or article at most.
--
-- It carries its own copy of what goes out, taken when Schedule is pressed,
-- because the editor keeps autosaving the draft afterwards. Publishing
-- whatever the draft happens to be at the appointed minute would put a
-- half-finished rewrite live without anyone pressing anything - the thing
-- the draft/published split exists to prevent. So a document can have three
-- copies: what is live, what is scheduled, and what is being written.
--
-- A table of its own rather than columns on pages and articles: it is
-- created by this file on start, so an existing database needs nothing done
-- to it, and a schedule is gone with its document by the cascade.
CREATE TABLE IF NOT EXISTS schedules (
  id          INTEGER PRIMARY KEY,
  page_id     INTEGER UNIQUE REFERENCES pages(id) ON DELETE CASCADE,
  article_id  INTEGER UNIQUE REFERENCES articles(id) ON DELETE CASCADE,
  -- UTC, in the same 'YYYY-MM-DD HH:MM:SS' shape as every other timestamp
  -- here, so "is it due" is a string comparison.
  publish_at  TEXT    NOT NULL,
  content     TEXT    NOT NULL DEFAULT '[]',  -- the blocks that go out
  -- The document's settings as they were when it was scheduled - every one
  -- that waits for Publish, not only the changed ones, because a document
  -- that is not live writes those straight to its row and they keep moving.
  meta        TEXT    NOT NULL DEFAULT '{}',
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK ((page_id IS NULL) + (article_id IS NULL) = 1)
);
CREATE INDEX IF NOT EXISTS idx_schedules_due ON schedules(publish_at);

-- ---------------------------------------------------------------- menus
CREATE TABLE IF NOT EXISTS menus (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  is_main    INTEGER NOT NULL DEFAULT 0,
  draft      TEXT    NOT NULL DEFAULT '[]',   -- JSON tree, autosaved
  published  TEXT,                            -- JSON tree, live site reads this
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------- settings
-- ---------------------------------------------------------------- forms
-- A form exists once and pages point at it.
--
-- It used to be page content: the fields lived inside a Form object in a
-- page's blocks, so the same contact form on three pages was three forms that
-- drifted apart. What a form owns settles it - a recipient, a subject line
-- and the messages people send through it belong to one thing, not to a
-- paragraph that happens to be on a page. Two copies of "the contact form"
-- with two different recipients is a bug waiting for somebody to notice.
--
-- No draft/published pair, unlike menus. A menu is composed over sittings and
-- is dangerous half-finished; a form is a short list with a destination, is
-- edited on one small screen, and is closer to Settings - which also saves
-- when you press save.
--
-- `content` is blocks, exactly as a page stores them, because a form is
-- written on the same canvas with the palette cut down to what belongs in
-- one. The alternative was a bespoke list of rows with its own label and
-- placeholder inputs - a second, weaker editor beside a good one, and a
-- second answer to "how do I put a heading above these fields".
CREATE TABLE IF NOT EXISTS forms (
  id              INTEGER PRIMARY KEY,
  name            TEXT    NOT NULL,
  content         TEXT    NOT NULL DEFAULT '[]',
  recipient       TEXT    NOT NULL DEFAULT '',
  subject         TEXT    NOT NULL DEFAULT '',
  success_message TEXT    NOT NULL DEFAULT '',
  submit_label    TEXT    NOT NULL DEFAULT '',
  -- The submit button, in the same words a Button object uses.
  colour          TEXT    NOT NULL DEFAULT '',
  outline         INTEGER NOT NULL DEFAULT 0,
  button_size     TEXT    NOT NULL DEFAULT 'medium',
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ------------------------------------------------------------- messages
-- Contact-form submissions, kept so nothing is lost if mail delivery fails.
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY,
  subject    TEXT NOT NULL,
  from_email TEXT NOT NULL,
  body       TEXT NOT NULL,
  page       TEXT NOT NULL DEFAULT '',
  -- Which form it arrived through. Null for anything sent before forms had
  -- an existence of their own.
  form_id    INTEGER REFERENCES forms(id) ON DELETE SET NULL,
  delivered  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
