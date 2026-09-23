# Where things stand

A running note of what is done, what is deliberately not done, and what is
half-done. Kept short.

## Working

- Public site: pages, articles, menus, forms, media — all driven by the CMS.
- CMS: dashboard, pages + WYSIWYG editor, articles, media library, menus,
  categories, page templates, users, settings, and an Account screen for
  your own password. A fresh install makes its first admin at `/cms/setup`
  and seeds four empty pages (Home, About, News, Contact), a Main menu and a
  Secondary menu, and no categories.
- Tables are an object of their own: tabular data keeps its shape and scrolls,
  where a slice's columns are layout and stack on a phone. A cell holds objects
  like a column does - anything but another table or a form field.
- Slice -> object -> content is the whole hierarchy. A page is a stack of
  slices; a slice owns the layout (1-4 columns, split, gap, width); objects are
  content inside a column and lay nothing out. There is no columns object.
- Slices are built on a page and saved from the slice's own toolbar. No
  separate designer screen, and a single object cannot be saved - only a slice.
  Nothing is seeded into the library; it fills from real pages.
- **A slice can be hidden** (2026-09-22) - the eye in its tool row. It stays
  on the page, in place and editable, under a striped veil with a "Hidden"
  tag that never goes away, and it is off the site from the next publish.
  What it is for: an alternative version kept beside the section that is
  live, and campaigns and seasonal sections between runs. Variants had been
  parked in the slice library, which is the wrong home: the library holds
  building blocks for every page, and a variant parked there loses its place.
  - **An edit like any other, so Publish commits it.** Not a second publish
    system: hiding a slice on a live page makes it Live · edited, and swapping
    one version for another is a single publish, so visitors never see both
    or neither. Scheduling comes free - show the campaign slice, then Schedule.
  - **Left out, not covered up.** Everything public reads through
    `visibleBlocks()`: the page and its preview, `/form/submit` and
    `/api/feed` (a form or a feed in a hidden slice is not on the page), the
    link-preview image, the link picker's sections, an article's automatic
    excerpt. `display:none` would leave it in view-source - the reason the
    password gate draws a card instead of the page.
  - Copies keep it - Duplicate, a copied page, a template. **Save as slice
    drops it**: a slice placed from the library should arrive where it can be
    seen.
  - **A section name only clashes with what the site shows.** A variant
    hidden beside the section it copies shares its anchor without a warning;
    the hidden one still hears about the visible one it would clash with.
  - The canvas dims with a veil, not with opacity: opacity would fade the tool
    rows of everything inside the slice as well, and make it look locked.
- **A form exists once and pages point at it.** It used to be page content -
  the fields lived inside a Form object in a page's blocks - so the same
  contact form on three pages was three forms that drifted apart. What a form
  *owns* settles it: a recipient, a subject line and the messages people send
  belong to one thing, not to a paragraph that happens to be on a page. Two
  copies of "the contact form" with two different recipients is a bug waiting
  for somebody to notice. A page stores one number now; everything else is
  read from the form.
  - **It is written on the same canvas**, at *Forms*, with the palette cut to
    the six fields plus a heading, a line of text, a rule and some air. The
    elements to build a form were already in the page editor. A bespoke list
    of rows with its own label and placeholder inputs would have been a second, weaker editor beside a good one - and a
    second answer to "how do I put a heading above these fields", which is a
    Heading. Same argument that kept articles on the page canvas.
  - **But a form is a *set*, not a document.** The first cut stored blocks -
    the same stack of slices a page is - and that brought a whole level of
    layout with it: a background, a padding, a container width, offered on
    something that is a list of questions. It also made every placed form a
    full-width band, so one could never sit tightly in a card or a table cell.
    A form is a flat, ordered list of objects now, and the canvas draws it
    flat: the single slice holding it is plumbing, so it has no chrome, cannot
    be selected, is not in the path, and Slice is not in the palette.
  - **The only layout a form owns is half width on a field**, which already
    existed and never had any CSS behind it - `.b-field--half` was emitted and
    styled nowhere. `.b-form` is a two-column grid now and everything spans
    both unless it asks not to. That is exactly as much control as a form
    should have, and it makes the slice level redundant rather than missing.
  - A **Choice** field (radio buttons) beside Dropdown. Same data, different
    question: a dropdown hides its options behind a click, radios show them.
  - The screen had **no save button and no saved indicator** - it autosaved in
    silence, which reads as "this cannot be saved". Both are there now. The
    button is redundant and stays anyway: with no Publish beside it, a footer
    with nothing in it says the wrong thing.
  - **Add field sits under the canvas**, as it does on a page. The palette on
    the right is easy to miss entirely, and the button you reach for is the
    one at the end of what you were just reading. The dialogue offers exactly
    the palette: no empty slice, no saved slices, and form fields no longer
    filtered out of it - that filter was left over from when a field could
    only live inside a Form container.
  - **A heading, a rule and some air stay in the palette.** Document-ish is
    right here: a long form needs sections, and those elements are
    the same ones any other container will want later.
  - Fields in a panel belong in a `.stack`. Both settings panels put them
    straight into the `.panel`, so every label sat flush against the field
    above it - a caption that reads as belonging to the wrong thing.
  - **Reference, not copy.** A saved slice is copied when placed, so the two
    part company on purpose. A form is the opposite: change the recipient
    once and every page follows. That is what a menu does, and a form is the
    same kind of thing - a named object a page refers to.
  - **One save, no draft/publish.** A menu earns that pair because it is
    composed over sittings and is dangerous half-finished. A form is a short
    list with a destination, edited on one screen, and is closer to Settings.
  - **One rule for what a screen accepts, and it is the palette.** There used
    to be four copies of "form fields belong inside a form", from when a field
    could only live inside a Form container. The question is no longer what an
    object *is* but whether this editor offers it - `DATA.objectKinds` in the
    browser, `allowedInForm` on the server, one list either way.
  - Validation still reads the stored definition and never the posted shape,
    and now reads it from the form rather than from the page. A submission
    still names which of the page's form objects it came from, so a
    hand-edited request cannot point itself at a recipient of its choosing.
  - `messages.form_id` records which form a message arrived through. Added to
    an existing table, so it needed the by-hand `ALTER TABLE` that
    `CREATE TABLE IF NOT EXISTS` cannot do - exactly the case the schema note
    below describes.
- Settings holds everything site-specific: name, address, language, country,
  one logo (with none set, the site shows its name), favicon, how people sign
  in, form recipient, footer, social links.
- **The site's own words follow `site_language`; the CMS's do not.** The
  setting used to do one thing - write the page's `lang` attribute - while
  every word the site supplies for itself was an English string sitting in a
  template. A Swedish site said "Read more" under its cards and "Page not
  found" at a dead address, which is the one kind of wrong a reader is certain
  to notice. `src/lib/words.js` is the dictionary: English, Swedish beside it,
  reached through the context `buildContext` already builds, so a renderer
  asks for a word rather than holding one.
  - **Twenty-seven strings, and the line that decides membership** is whether
    it is the *site* speaking or the author. "Read more", Send, the thank-you,
    the password gate, the 404 - the site's. Anything an author typed is
    theirs and is drawn exactly as typed, which is why a form's own
    `submit_label` still beats the dictionary's Send.
  - **aria-labels are words.** Main menu, Section menu, Breadcrumbs, Home,
    Skip to content, Menu: what a screen reader says out loud. Leaving them
    English is the same mistake as printing them, made to fewer people, and
    they were not in the thirteen this job was scoped at.
  - **Dates come with the language.** Each set carries a `locale` - `en-GB`,
    `sv-SE` - and `formatDateLong` takes it, so an article dated
    "23 September 2026" in English is "23 september 2026" in Swedish. A tag
    that names its own region keeps it (`en-US` writes September 23, 2026);
    a short date stays ISO in every language, which is what it was for.
    `LOCALE` in `src/lib/util.js` is now explicitly the *CMS's* locale, and
    the CMS's lists and schedules still format by it.
  - **A language with no set of its own gets English furniture and an honest
    `lang`.** A German site is German in the attribute, in the content and in
    search results; only the couple of dozen words it never wrote are
    English. The alternative - refusing the setting, or drawing blanks - is
    worse at both ends. Matching is on the primary subtag, so `sv`, `sv-SE`
    and `sv-FI` are all Swedish.
  - **English sits underneath every other language**, so a word added and not
    yet translated draws in English rather than as nothing. A test walks every
    language and fails on anything that still reads in English, because that
    fallback is a safety net and not a way of working.
  - **What stayed English, deliberately:** the preview bar, the "this form has
    been deleted" note (both only ever drawn for an author), the `/api/feed`
    JSON errors (nobody reads them), and the empty-page notice - it says "Add
    slices and objects to it in the CMS", so translating it means translating
    *slice* and *object*, which is the CMS dictionary this is not.
  - Found on the way: the form validator still said `(giltig e-post)`, a
    Swedish string that survived every pass over this code because it only
    appears when somebody mistypes an address.
- Navigation is a single collapsible rail. No top bar.
- **A page has two copies.** `content` is what the public sees; `draft_content`
  is what the editor writes. They part company the moment a live page is
  edited and come back together on publish. Before the split there was one
  column, so saving a live page published it and there was no way to keep work
  in progress on a live page at all.
- The editor **autosaves the draft** (debounced ~1.5s) and shows "Saved 14:32".
  It is safe by construction: an autosave can only ever touch `draft_content`,
  and `publish()` is the one thing that writes `content`.
- **Three states, not two**: Draft, Live, and Live · edited. The last shows in
  the pages list too, or pending changes would only be findable by opening
  every page.
- **Discard changes** copies what is live back over the draft. It exists
  because autosave takes away walking-away-without-saving as the undo, and
  something has to replace it.
- The editor head carries two pills: **Saved 14:32** in green and the status
  in blue. "View" beside them opens `/cms/preview/:id`, which renders the
  *draft* through the site's own renderer behind the CMS guard — a draft is
  not public, and the session that may edit a page is the session that may see
  it, so no token is needed. It wears a quiet bar so it cannot be mistaken for
  the live page — literal colours, not theme tokens, because it has to stay
  legible whatever a site's palette does. The View link targets a *named*
  window, so clicking it again reuses the one preview tab, and it carries no
  `rel="noopener"` on purpose: "Back to the editor" uses `window.opener` to
  hand focus back and close itself, rather than leaving a second editor tab
  behind every time. It falls back to a plain link when there is no tab to
  return to. The rail's "View site" is still strictly what visitors get.
- **The canvas does not mime the edge-to-edge band.** A coloured slice fills
  exactly the box its selection outline draws, and its content sits inside
  with the theme's gutter. The canvas used to pull a Blank page's band out
  past the scroll pane to imitate the real thing — but it is not the width of
  a window and never will be, so the fill ran wider than the outline and the
  content landed between the two: three boundaries, three answers. Whether
  bands reach the window edge is what the page type field says.
- **The properties panel opens with the path to what is selected** — `Slice 1
  › Heading`, each step clickable. A slice is selected by clicking its own
  area (the padding around its columns, or the space under them) and nothing
  on the canvas says so; on a full slice that area is a thin ring, which made
  the slice's own settings genuinely hard to reach. The path makes every level
  reachable from whatever is selected, without aiming for it.
- **Anchors are a switch: "Mark as link target", on or off, at the top of the
  properties panel.** A slice or a heading that is
  linkable carries an `anchor`, which becomes its `id`; nothing else gets one.
  Off is the default because a real site has hundreds of headings and almost
  none are somewhere you would link to — un-anchored means no id in the markup
  and no entry in the menu picker. Switching it on seeds a name from the text
  and then *stores* it, which is the whole point: from that moment the name is
  its own thing. Deliberately *not* the object's system id, which `reIdBlocks`
  remints whenever a page is copied or planted from a template — a link to one
  would break silently. And deliberately not re-derived from the heading, so
  rewriting a heading cannot move a link that points at it. Editing the name
  itself does, which the panel says once one exists.
  - The section claims its name before its own contents do, since the section
    is what links point at. Duplicates are numbered as a last resort, and the
    editor warns instead — numbering is document-order, so reordering the page
    would otherwise move a link.
  - **Links are chosen, not typed.** One list — every page, and under each the
    sections of it marked as link targets — is built once in `linkOptions`
    (views/cms/parts.js) and used by the menu editor, the Link field on
    buttons, images and link objects, and the rich-text link popover. A text
    field beside the picker takes anything the list cannot cover. In the page
    editor this page's own anchors come from the canvas rather than the saved
    draft, so a section marked a moment ago is offered immediately.
  - The rich-text link was a `window.prompt`. It is a popover beside the words
    now, with the same picker and a Remove for an existing link. The selection
    is captured before the popover is drawn and restored on apply — clicking
    into it blurs the editor and destroys the live selection.
  - The menu picker lists every page and, indented under it, that page's
    anchors — named by what the section reads as, never by the anchor itself.
    The anchor is what the link stores and it never changes, which is exactly
    why nobody needs to look at it. The list is built once, in `linkOptions`,
    and used by both the rows
    rendered server-side and the rows the editor adds — they used to build
    their own, so a target offered by one was missing from the other.
  - Anchored elements get `scroll-margin-top`, or the sticky top bar covers
    whatever the link was for.
- **A heading's size is separate from its level.** They used to be one field,
  so the largest heading available was whatever an h2 measures — about 30px,
  a third of what a hero needs. `level` is now the tag (h1–h4, the page's
  outline) and `headingSize` is how big it draws (small → display, up to
  80px). Existing headings take the size their level used to imply, so nothing
  already written moved.
- **A button takes a theme colour like everything else**, with `outline`
  turning that colour into the edge instead of the fill, and three sizes. It
  used to carry a private three-value palette (default / accent / ghost)
  beside the real one, so "accent" meant two different things depending on
  where you looked. The old values are read on the way in and keep their
  appearance exactly. Outlined is transparent, not white, so it works on a
  coloured band as readily as on the page.
- **Alignment is three buttons and a colour is its own swatch.** Both used to
  be dropdowns, which made the two commonest settings in the panel cost two
  clicks and a read — and a colour named "Stone" in a list asks you to remember
  what Stone looks like. "None" is drawn as an empty square struck through in
  red, because an absent colour still has to be something you can aim at.
  Buttons and selects write through one `applyProp`, so the two kinds of
  control cannot drift in what they do.
- The **Blocks palette works from the keyboard**: click or arrow to a kind,
  Enter places it. It lands after the selected object, or at the end of the
  selected column or slice, or in a new slice when nothing is selected.
  **Slice sits at the top of that list**, above a divider — a level up from
  everything below it, but a page is built slice-first, so it goes where the
  hand already is.
- `hasDraftChanges` compares the two copies *normalised*, never raw: the
  editor re-serialises on every save and older content predates newer props,
  so a raw comparison would leave every page reading as edited forever.
- The server runs under launchd (`scripts/autostart.sh`), so **server-side
  edits need a restart** — CSS and other static assets do not.
- Uploaded raster images are converted to WebP at several widths and served
  with `srcset`, with one small JPG beside them for whatever cannot show WebP;
  originals are kept so quality can be retuned later
  (`node scripts/image-backfill.mjs --all`).
- **Express, and no nginx in front** (2026-09-21, the sysadmin's call). nginx
  did no caching here at all - there was never a `proxy_cache` - but it did
  five other jobs, and each has a home in `src/app.js` now: gzip (brotli
  where asked) through `compression`; files straight off disk through
  `express.static`, which answers the byte ranges iOS Safari needs before it
  will play a video; `nosniff` and a no-script CSP on `/media/` and
  `/fonts/`; an upload past the ceiling refused on its declared length
  before a byte of it is read; and slow uploads, which Node now reads itself
  (`requestTimeout` half an hour, five minutes of silence allowed - what
  nginx allowed between reads). Handlers kept their `(req, res, { params,
  url, ctx })` shape; Express does the matching, and the hand-written
  `Router` is gone. `test/server.test.js` asks each of the five of the app.
  - **Node faces the network**, on `0.0.0.0:8080`, so the office kept its
    address. That moved the trust question: `X-Forwarded-*` used to be safe
    to believe because only nginx could reach Node. Now nothing is believed
    unless a proxy is named in `TRUST_PROXY`, and a loopback socket carrying
    forwarding headers with none named counts as relayed, not local - so
    putting a proxy in front and forgetting the variable keeps the login
    bypass shut rather than opening it to everyone behind the proxy. Probed
    from the LAN with forged `X-Forwarded-For` and `X-Real-IP`: 303 each time.
  - Gone with nginx: the "Node is not answering" page during a restart
    (launchd has it back within ten seconds), and the access log -
    `LOG_REQUESTS=1` writes one to the agent's log instead.
  - **Where TLS ends is open.** Nothing terminates HTTPS now. A proxy or load
    balancer in front (then set `TRUST_PROXY`) or Node with a certificate is
    the sysadmin's decision; `Secure` cookies and HSTS already switch
    themselves on off the request either way.
- **One set of image tools: sharp** (2026-09-21). It replaced `cwebp` and
  `gif2webp`, so the server needs no image software beyond `npm ci`. Same
  libwebp underneath: at full size the files are byte for byte what cwebp
  made. sharp's default resize (Lanczos 3) is sharper than cwebp's and made
  the photographs 8% heavier at the same quality; Mitchell is the filter
  closest to cwebp's and lands the whole library 0.3% *under* it, so the
  q65 calibration carried over untouched. sharp also turns EXIF-rotated
  pixels upright, so nothing depends on a browser reading the tag.
  - **One fallback per image, not a ladder**, since the clients that need it
    are few. 800px at q50 through mozjpeg: a 24 KB median, and
    the whole library's fallbacks came to 564 KB, less than its 800px WebPs
    weigh. A transparent image gets a palette PNG instead, or a logo would
    sit on a white box. Pages draw `<picture>` - the WebP set as `<source>`,
    the JPG as `<img>` - so a current browser never fetches the JPG.
    `og:image` and an uploaded favicon use it outright: a link-preview
    scraper is the likeliest client that cannot read WebP, LinkedIn's first.
    `picture { display: contents }` keeps the wrapper out of layout;
    measured box for box against the old markup, at desktop width and 375px.
  - An upload that arrives as WebP or AVIF is served as it came and only
    gets the fallback. An animated GIF becomes an animated WebP, and its
    fallback is the first frame.
  - `sharp.cache(false)`: libvips caches decoded files *by name*, so a file
    replaced on disk reads back as the old picture. It turned up while
    measuring, as nonsense scores, until the reads went through buffers.
- **A centred column keeps full-width blocks full width** (2026-09-21, from
  a card of partner logos). Centring moves a column's boxes, and moving a box
  shrinks it to its content - right for a button or a line of text, wrong
  for an empty image (a sliver), a divider (gone), an embed (300px), or a
  form, table or code block. An image is now `width: 100%` up to its size
  cap; the other full-width kinds stretch. The canvas wraps every object in
  an `.obj`, so a blocks.css rule aimed at `.b-slice__col > .b-x` never
  reaches it: cms.css repeats it for `.canvas .slice-col > .obj[data-kind]`.
- **A truncating row can shrink.** A `.spread` in a grid form sized its
  column to its full natural width, so a long filename in the media
  Properties panel pushed the whole panel into a sideways scroll (146px for
  a screenshot's name) instead of ending in "…". `min-width: 0` on `.spread`
  fixed every panel at once.
- **Theme** is a screen of its own: the palette, the two faces, the type scale
  and the four measures. A colour is a *surface* — it carries the text colour
  that reads on it, so choosing a dark background gives light text and there is
  no way to pick an unreadable pair. Every colour is emitted twice, as
  `.b-surface--<id>` and `.b-ink--<id>`, which is what slices and tables will
  use. Renaming a colour keeps its id, so pages referring to it still work.
  "Pick from an image" quantises a file in the browser and takes the eight most
  prominent colours; nothing is uploaded.
- **The default theme is plain, and a site can bring its own** (2026-09-22).
  Neutral greys and one blue accent (#357abb), a white top bar and a white
  footer - they show the same logo, so they have to agree on a ground it
  reads on. site.css names no colour for the site's furniture: the page, bar,
  sub menu and footer draw from tokens named for the place (`--page-bg`,
  `--placeholder-bg`, `--bar-*`, `--submenu-*`, `--footer-*`), and the mark
  beside things is `--highlight`, so a theme that wants a dark bar changes a
  value, not a rule. The Theme screen's palette ids stayed as they were, so
  slices naming them keep their colour: `sand` shows as Stone and `brand` as
  Tint. `THEME_DIR` names a folder whose files are served in place of those
  in `www/assets`, everything else falling through; `tokens.css` and
  `site.css` are the pair a theme is made of. That is what lets another site
  be a deployment of this repo rather than a copy of it.
- **The public site is English**, strings inline in the views. Dates are
  en-GB in words ("22 September 2026") and ISO in figures. The subject filter
  is `?category=`, with no alias for the Swedish name it had before.
- **A slice is a band and an inner box.** The band runs the full width of
  whatever contains it and carries the background; the inner box caps how wide
  the content draws (`container`: narrow / body / wide / edge-to-edge, measured
  by the theme). `width` is unchanged and still a proportion *of that*. Adding
  a slice inherits the band above it, so an alternating page is one click per
  slice; the column layout is deliberately not inherited.
- **Text colour** is a theme colour id on heading, text and quote, and is
  almost never needed: a surface redefines `--ink`, `--graphite`, `--grey-*`
  and `--line` locally by mixing its ink toward its background, so a caption
  stays a caption on a black band. Setting `color` alone was not enough —
  blocks.css's own colours beat inheritance, which is how a dark band ended up
  with black text on it.
- **Page type and page template are different things**, and were conflated
  until they were separated.
  - **Page type** is the frame, and a property of the page: Standard (title,
    breadcrumbs, capped), Landing (no title, capped), Blank (no title, no cap
    — slices reach the window edge). It used to be reached through a named
    template row, which meant two templates could differ in nothing but their
    name and offer two identical choices in the editor.
  - **A page template** is a saved page: its type and every slice on it,
    content included. Saved from the editor, planted by "Start from a
    template" when creating a page. Nothing is seeded — the library fills from
    real pages, exactly like slices.
  - **Duplicate** in the Pages list is the one-off: a draft copy of one page.
  Every copy re-mints every id, slices, form fields and table cells included.
- Opening an **empty page** puts one empty slice on the canvas *and selects
  it*, so the thing the first block goes into is visibly the thing you are
  working in. `selectedId` is set directly rather than passed through
  `select()`, which would swap the panel to Properties when the palette is
  what is wanted next. Not marked dirty: opening a page must not change it.
- **Hints in the properties panel are folded behind a question mark.** Every
  field's explanation used to sit open under it, which on a panel of eight
  fields is more prose than settings and pushes the rest off a 13" screen.
  A click, never a hover — a panel that whispers as the pointer crosses it is
  worse than one that says nothing until asked. `pField()` builds every field,
  so a hint is one argument and the dot appears on its own.
- **A page can ask for a password.** A switch and a field in a small section
  at the foot of the editor, above the publish buttons - it is a property of
  the page, not of anything on the canvas, and it is reached rarely enough not
  to earn a place among the settings opened on every visit. It saves through
  the same autosave as everything else there.
  - The password is stored **readable, not hashed**, on purpose: it is a
    shared secret for content, not a credential. An editor who cannot read it
    back cannot pass it on, which is the only thing a page password is for. It
    grants no session and no account, nothing else in the system accepts it,
    and the CMS that shows it is already behind a real login.
  - A locked page renders the gate **instead of** its content, never over it -
    an overlay would ship the whole page to view-source. The card carries
    literal colours rather than theme tokens, like the preview bar, because it
    has to stay legible whatever a site's palette does. `noindex`, and a
    locked view is not counted as a page view.
  - The check lives in `renderPage`, the one place every public rendering of a
    page passes through: a plain view, a form submit that comes back to the
    page it was posted from.
  - Unlocking sets one cookie per page holding an **HMAC of the page id and
    the password**. Nothing is stored server-side, a cookie is good for one
    page only, and changing the password shuts out everyone already let in -
    which is what changing a password is expected to mean.
  - **Editors are asked too.** A gate that anyone signed in walks straight
    through is a gate nobody can check works - and with the login bypass on
    while building, that would be everybody. `/cms/preview/:id` is the
    editor's way to see the page; it is behind the CMS guard already.
  - The gate posts to the page's **own address**, so no reserved path can
    collide with a permalink. A wrong password answers 403; 401 would have to
    carry a `WWW-Authenticate` header it has no business sending.
- **Every page-level field autosaves.** `[data-page-field]` elements are
  collected into the save payload and schedule a save on change. Page type and
  sub menu were read on the *next* save only, so changing one and walking away
  lost it.
- **An article has subjects, and can have several.** `article_categories`,
  many per article, lowest `position` first. The old single `category_id` is
  migrated into it and dropped.
  - **"News" was never a subject.** It said what an article *is*, where every
    other category says what it is *about* - and every article is news. So
    filing a piece under "News" to make it appear on the news page was the
    whole problem. The updates page is the **unfiltered feed**, not a filter:
    an article about a new product is filed under Products and appears there
    because that page shows everything. A fresh install seeds no categories
    at all, for the same reason: it does not know its subjects yet.
  - **One taxonomy, not two.** Category + tags is WordPress's model and means
    answering "is this a category or a tag?" on every article, forever. An
    article about hiring for a new product is about Products *and* Careers,
    and saying so once is enough.
  - The **primary** subject is simply the first, and is what a card shows and
    a breadcrumb names. It is read as "lowest position", not "position = 0",
    so deleting the primary from the palette promotes the next one instead of
    leaving an article with subjects and no name to show.
  - The form is a **Category select plus an "Also about" checkbox group** -
    not a multi-select, which hides what is chosen behind a scroll and gives
    no clue that more than one is allowed. The select is the primary, so
    "which is primary" needs no drag-ordering and no column of its own.
  - Related articles match on **any shared subject**, so the heading is "More
    to read" rather than naming one of them and then listing the others.
- **A feed's count is a batch size, and `more` says what happens past it.**
  Deliberately *not* an "All" on the count: "all" of 300 articles is 300 cards
  nobody scrolls to, while `scroll` with a batch of 12 *is* all of them, a
  screen at a time. `none` stays the default, so nothing already placed moved.
  - The first batch is **in the page itself** - complete before any script
    runs, and a crawler sees articles. The rest come from `/api/feed`, which
    re-reads the feed's props **from the stored page** and takes only the
    offset from the browser. Same rule `/form/submit` follows: a hand-edited
    request cannot ask a feed for anything the page does not already show,
    and a feed on a password-protected page is as locked as the page is.
  - The server renders the cards, so there is one description of what an
    article looks like rather than a second copy in the browser.
  - **An IntersectionObserver reports changes.** A batch that does not fill
    the screen leaves the sentinel exactly where it was - still in view, so no
    change, so no second batch and a feed stuck on page one. Re-observing
    after each batch asks it afresh.
  - The control is drawn **only while there is more**: a "Show more" that
    loads nothing is worse than no button. One row past the batch is fetched,
    so "is there another page" costs no second query.
  - **Random is a pick, not a list** (2026-09-22, for a front-page card of
    staff portraits). `order` is `newest` or `random`; random is a fresh
    `ORDER BY RANDOM()` on every page load, at any count. It never loads
    more: the normaliser holds its `more` at none and the panel drops the
    field, because the next batch would be a new shuffle and repeat what the
    first showed. One card only was the first thought; the count stays
    free, since it is paging that breaks, and three random portraits out of
    twenty is as sensible as one.
  - **Subject chips** are an option on the feed (`filter`). A chip narrows a
    feed within its own subjects and can never widen it - a hand-typed
    `?category=` on a feed listing Products and Research cannot make it
    show Investors. `.chip` had been in the old news index's markup since it
    was written with no rule anywhere styling it, so it drew as a row of plain
    links; it has styles now.
- **An article lives under a page, and that is its address.**
  `parent_id` names the page; `permalink` is that page's address plus the
  slug, composed on save and **frozen at publish** - the same rule the slug
  already followed, because a link that has been given out has to keep working
  however the piece is later re-titled or re-filed.
  - **`/news` was doing two jobs**: a destination in the menu *and* the
    namespace every article lived in. The same conflation as "News the
    category", one level up. Both hardcoded routes are gone - there is no
    news index and no `/news/:slug` - so the updates page is an ordinary
    page with a feed on it, renameable and movable like any other, and no
    article address moves when it is.
  - Pages and articles share **one address space**, checked by
    `permalinkTaken()` from both sides. The catch-all looks up a page, then an
    article, then gives up: two lookups and no parsing, which is exactly why
    an article stores a whole permalink instead of deriving one at request
    time from a parent that may since have moved.
  - The article inherits its parent's **trail and sub menu**, so a piece under
    Careers reads Home > Careers > Title and keeps the reader in
    the section they came from. A URL whose every segment is somewhere you can
    actually go is the whole reason this beats putting the *subject* in the
    path - a subject slug is not a page, so chopping the last segment would
    land on a 404.
  - Renaming a parent page leaves published articles at the address they were
    published under. Their own links keep working; only walking up the path
    does not. That is the right way round.
  - Where a *new* article goes is `article_parent` in Settings, a page rather
    than a string. Absent and empty mean different things in the form: an
    empty select is "no page, sit at the root", a form that never carried the
    field takes the default.
- **A page is a place, an article is an event.** The rule, when it is unclear
  which a piece of content should be: *if it will ever appear in a list of
  other things like it, it is an article; if it is a place in the menu, it is
  a page.* A page is arranged - hero, columns, images, CTAs - and carries no
  date; an article is written, dated, authored, and one of many. A page can
  already do everything an article can except be listed by date with its
  siblings, so services copy is a page and stays one. There is deliberately no
  object that renders an article's full body onto a page: one text, one
  address, or search engines and readers both have to guess which is real.
- **An image frame adds nothing of its own.** `.b-image__frame` rounds and
  clips and that is all - a transparent PNG has to come out transparent, and
  what shows through is whatever the slice behind it is. It used to carry the
  sand tint, so a logo on an unpainted slice arrived on a cream card nobody
  had asked for. The tint survives on `:empty` only, as
  `--placeholder-bg`: an image object whose
  picture was never chosen, or whose file has since left the library, has to
  be visible enough to notice, where a zero-height gap would swallow the
  mistake silently. The editor canvas never used it - it has its own dashed
  placeholder - and `.b-embed__frame` keeps its tint, because an iframe always
  fills its frame and the colour only ever shows while one loads.
  - The same rule now covers the card wells (`.card__media`,
    `.article-feature__media`, `.hero__media`): filled adds nothing, empty
    keeps its shape. A tint behind a picture is never the author's choice, and
    a transparent logo on a card was landing on cream for the same reason a
    transparent logo in an article was.
- **The article page is white, and page furniture is not.** An article is read
  rather than browsed, so `body.is-article` drops the page's paper tint.
  Its pulled quote takes the accent rather than the `--highlight` the Quote
  *object* uses - the object sits on designed pages beside the logo, the
  article rule sits in prose. In the default theme the two are the same blue;
  a theme with a second colour is where they part.
- **Slices stack flush; the gap above the footer is the footer's.** Every
  slice used to carry `margin-bottom: var(--s-8)`, which nobody had asked for
  and which drew a 56px stripe of the page's own paper between two white
  bands - straight through what should read as one continuous surface. A band
  is a band: space around content is the slice's own padding, inside the band,
  where the author can set it. A surfaced slice already gets `padding-block`.
  - The rule meant to prevent exactly this - `.b-slice[surface] +
    .b-slice[surface] { margin-top: 0 }` - had never worked, because the gap
    was a `margin-bottom` on the first slice, not a `margin-top` on the
    second. It has gone with the margin it was aimed at.
  - The 60px now sits on `.footer`'s `margin-top` rather than `.main`'s
    padding, so the distance belongs to the footer rather than to the last
    thing on the page. `margin-top` rather than the `auto` it replaced:
    `.main` is `flex: 1 0 auto` and already absorbs the free space, and
    flexbox counts the footer's margin when working out how much that is - so
    a short page still ends with the footer at the bottom of the window and no
    stray scrollbar. Verified at 1280x1600 against a page shorter than the
    viewport.
  - The one case to watch: only a *surfaced* slice carries internal padding,
    so two unpainted slices in a row now touch. No page does that today.
- **The gap between slices is a stored number, not a stylesheet rule.**
  `newSlice()` seeds `margin.bottom: 50` on every slice it creates, and every
  path that makes one goes through it. That is the whole point: the number
  shows in the spacing fields, draws on the canvas, and can be typed down to 0
  for a page whose bands should run together. The blanket rule it replaces
  gave every page a gap whose editor insisted was 0 - which is the shape of
  bug worth watching for generally, presentation the author cannot see or
  reach. Existing slices were left alone; only new ones are seeded.
  - A last slice's margin now adds to the footer's own 60px. Deliberately not
    suppressed by a `:last-child` rule: that would be the same invisible
    override again, and both numbers are visible where they are set.
- **"Add a block" offers an empty slice, and the canvas has room below the
  last one.** The dialogue listed saved slices and objects but not the one
  thing a page is made of - so the button at the foot of a long page, reached
  precisely when the canvas has run out of room to drop into, could add
  anything except a slice. The canvas also ended flush with its last block,
  and the insertion point is worked out from the pointer's Y, so there was
  nowhere to hover to append one. It carries trailing padding now.
  - The dialogue builds from `DATA.objectKinds`, which the server ships and
    the right-hand palette is rendered from - so it cannot offer an object the
    palette refuses and `stripDisallowed` would silently drop on save. It was
    doing exactly that for an article's breadcrumbs, feed and form.
- **A bare `<figure>` carries the browser's own `1em 40px`.** That was what
  held an article's lead image off both edges of its column and made it
  look centred and cramped. Any figure this codebase adds needs its margin set.
- **The bar said Bold when you pressed H2.** A heading *is* bold, so the
  browser answers yes to `queryCommandState('bold')` with the caret inside
  one - and since the heading button itself lit up for nothing, pressing H2
  read as "turns on Bold and changes nothing else". It did neither: the block
  commands report for themselves now, and Bold is only ever about bold. The
  bar also refreshes on `selectionchange` (coalesced to a frame, since that
  fires on every keystroke), so moving the caret into a heading no longer
  leaves it describing the paragraph it left.
  - The H2 itself was working the whole time: 24px/700 against 17px/400, on
    the canvas and on the site. It is smaller than a Heading *object*, which
    is a different thing - a heading inside a paragraph of prose, not a
    heading placed on a page.
- **Captions were 12px under 17px body copy**, which is a footnote to a
  footnote. `--fs-base` now, everywhere a caption appears - article, image
  object, embed - so the three cannot drift apart again.
- **An article's reading column can be centred**, from the theme's layout
  section. The whole column moves - subjects, headline, standfirst, byline and
  body, capped to the theme's own Narrow measure - because centring the
  paragraphs and leaving the standfirst pinned left is worse than either
  choice on its own. The words inside stay left-aligned; it is the column that
  moves. Pictures stay wide and are re-centred with it, or a figure pinned
  left inside a centred column hangs off one side only.
  - It lives in the theme rather than in Settings because it is a look, and
    it is a *switch* among four measures - which is why `normalizeLayout`
    now checks for a range before parsing a number. Parsing a boolean as one
    would have made "off" mean the narrowest width allowed.
- **The image buttons are the article editor's alone.** A page already has an
  Image object with size, alignment, caption and link; a second, weaker way to
  put a picture on a page is the duplication this codebase keeps refusing.
- **An article is written on the page canvas.** Same slices, same objects,
  same properties panel, same autosave - less `breadcrumbs`, `articles` and
  `form`, which are about a *page's* place in the site rather than about
  anything you would write. `ARTICLE_OBJECT_ORDER` is what the palette
  offers and `allowedInArticle()` is what the server enforces, because the
  palette is in the browser and what the browser sends never decides.
  - **Images in rich text were the wrong answer, and were removed.** An
    `<img>` inside a contenteditable region has no reliable *selected* state,
    so it cannot simply be clicked; and `<figure>`/`<figcaption>` are separate
    nodes, so deleting the picture left its caption sitting in the prose.
    Neither is fixable from outside the browser - it is why every editor of
    this kind went block-based. The sanitiser is text-only again.
  - Restricting an article to Text and Image was the other tempting answer and
    is also wrong: a comparison piece wants a table and a two-up wants
    columns, both already built. A second, weaker editor beside a good one
    would have meant two ways to place a picture, and an author guessing which
    tool they are meant to reach for.
  - **The editor is its own screen.** Long-form text in a sidebar is a column
    three inches wide. Creating asks for a title and nothing else - everything
    else is decided while writing, and a form up front only stands between the
    idea and the first sentence.
  - An article carries **two block lists** now, exactly as a page does. The
    editor is the same canvas and autosaves the same way, and an autosave that
    could reach what the public reads would make writing on a live article
    impossible. `publish()` is the one thing that writes `content`.
  - The excerpt falls back to the opening of the first text object. It used to
    be sliced off the front of one blob of HTML; the body is objects now, so
    the first words have to be *found*.
- **`sameBlocks` compares meaning, not identity.** It drops ids before
  comparing, because `normalizeBlocks` mints one for any block that arrives
  without - so a list stored without ids compared unequal to *itself*, and the
  document read as "Live · edited" forever with nothing to publish. Content
  written by hand rather than by the editor is exactly where this bites.
- **An article is locked by the page it lives under.** A password on
  Production is a statement about that section, and a piece filed there is
  part of it - so the gate reaches the articles, or the section is protected
  everywhere except where the writing is.
- **A block of text sizes itself**, four steps: Small, Body, Large, Very
  large. The same separation headings got - what a thing *is* and how big it
  draws are different decisions. An intro under a hero is body copy that
  happens to be larger, and the only way to get one used to be making it an
  h2, which puts a rung in the page's outline nobody asked for. `body` is the
  default and emits no class, so nothing already written moved. The reading
  measure narrows as the type grows, or Very large would run to half the
  characters per line body copy does.
- **Spacing is patched in place, never re-rendered.** `render()` rebuilds the
  properties panel along with the canvas, which replaces the very input being
  typed into - so a *slice's* margin accepted exactly one digit and the second
  keystroke landed on `<body>`. Typing 50 got you 5. All three levels already
  carry their spacing as a style attribute, so `spacingNode()` finds the right
  node for each and patches it. An object was already doing this; the slice
  and the column fell through to the redraw.
- **Publishing no longer reloads the page.** Which buttons belong in the
  action bar is still the server's answer - it hands back the bar it would
  have rendered, in `editorActions()`, used by both the route and the API so
  the two cannot drift. Reloading to find out threw the writer back to the top
  of a long document every time they published. Discard redraws in place for
  the same reason. The bar's buttons are bound by delegation, because a
  handler attached to the old buttons goes down with them when it is replaced.
- **Upload limits are per kind, and a refusal says why.** An image goes
  through the WebP pipeline and is capped at 2000px on the way in, so past a
  few megabytes it is bytes nobody will be served; a minute of 1080p video is
  tens of megabytes before anything unreasonable has happened. 25 MB for
  images and PDF, 200 MB for video, 260 MB for a whole request - one upload
  may carry several files, and none can be looked at until all of it has
  arrived. All three are env-configurable (`UPLOAD_MAX_MB`,
  `UPLOAD_MAX_VIDEO_MB`, `UPLOAD_MAX_REQUEST_MB`).
  - A file over the line used to be skipped **in silence** - `continue`, no
    record - so a video two megabytes too big simply never appeared. Every
    refusal now carries its name and reason: to the picker as JSON, to the
    library through the query string.
  - The truly enormous is refused on its declared length before the app
    spends memory buffering it, and answered 413 in JSON rather than an
    HTML page, which a `fetch` cannot read. nginx did this until September
    2026; `refuseOversized` in `src/app.js` does now. Anything asking for
    JSON gets JSON from the app's error handler too.
  - **The request limit is the memory ceiling.** `readBody` buffers a request
    rather than streaming it to disk, so a 200 MB upload costs 200 MB of RAM
    while it lands. Fine for one editor on one machine; streaming to disk is
    the fix the day it is not.
- **A card is a column, not an object.** A column gains a `surface`, an
  `border` switch with the line vocabulary tables already share, and a
  `radius` - and a column carrying either a background or an outline draws as
  a card.
  - **Not a Card object**, which was the obvious other answer. Objects are
    content and lay nothing out; a card is a box and a box is layout, which is
    the slice's business. And the decisive part: `.b-slice__inner` is a grid,
    so its columns already stretch to the tallest of them - three cards across
    come out the same height with no work at all, where a card *object* would
    have needed machinery to hold that and lost it the moment the text lengths
    differed. Measured before deciding: 161px / 161px / 161px on wildly
    uneven content.
  - It gives a distinction worth teaching: **a slice's surface is a band and
    runs edge to edge; a column's surface is a card and sits inside the
    content width.** Same palette, two scales - and `.b-surface--*` already
    carries its own ink, so a dark card gets its light text for nothing.
  - **Corners and padding default to what the demo site used**, 16px and 24px,
    since that is the look this was built for. The padding is *seeded onto the
    column* when a card is switched on, not applied from the stylesheet -
    so the spacing fields tell the truth about it and it can be typed back to
    0. Applying it invisibly is exactly what made a slice's margin a gap the
    editor swore was zero.
  - The limitation, accepted knowingly: **one card per column.** Two stacked
    inside a single column is not expressible - that is two one-column slices.
    A Card object stays on the table for the day something genuinely needs to
    sit mid-prose or several to a column.
  - A column's props are written through `coerce` now, like an object's. They
    were assigned raw, so the Outline checkbox would have stored the string
    "on" whether it was ticked or not.
- **Nothing spaces anything from a stylesheet any more.** A coloured band's
  56px, a card's 24px and a slice's 50px are all *stored numbers*, seeded when
  the thing that needs them is switched on, and all three show in the spacing
  fields. The same bug surfaced three times before the rule was drawn: a
  margin, then a card's padding, then a band's. If the panel can set it, the
  panel must be what the page uses.
  - The exception, agreed deliberately: the **horizontal gutter** on a
    full-bleed band. It is on `.b-slice__inner`, a different element from the
    one the padding fields write to, and it is what keeps text off the window
    glass. That is the page's own inset, not the author's spacing - and
    letting it be zeroed would only ever produce a mistake.
  - Stored padding no longer shrinks on a phone. The `@media` rule that gave a
    coloured band back some room went with the rule it was correcting; a
    stored number is a stored number, exactly as object spacing has always
    been.
  - Every existing page and article was reset to this baseline once, by hand
    (`scratchpad/reset-spacing.mjs`, kept only as a record) - slice margins to
    50, band padding to 56, card padding to 24, object spacing to nothing.
    Not a migration: a one-off on a database that lives on one laptop.
- **Defaults are visible, and that is the whole point.** A normal user never
  touches these numbers, but they are *there* for
  someone who knows what they are doing. Hiding them in a stylesheet serves
  neither - the base user gains nothing and the tweaker is stuck.
  - The **type scale** is the same argument, one screen further out. The nine
    sizes an object's Size menu offers are stored numbers now (`--h-small` …
    `--t-xlarge`), behind an *Advanced type sizes* fold on the theme screen -
    folded because nobody building a site needs them, present because Extra
    large sitting a hair above Large is exactly the kind of thing only the
    person laying out the page can see. The defaults were re-cut at the same
    time: Extra large went 38 → 48, which put it between Large and Display
    rather than beside Large, and small text 15 → 13, which is the difference
    between a caption and body copy set slightly small - and the difference
    between a caps tag reading as a tag or as a shout.
  - `--fs-*` stays the site's own furniture scale - page titles, captions,
    form controls, the CMS's own chrome - and is deliberately not offered.
    Two scales because they answer to different people: one is the brand of
    the thing being edited, the other is the product.
  - **What a phone takes off each step is not stored.** It is four ratios in
    blocks.css, because a display heading has to lose half its size and a 30px
    section heading has to lose almost none. One number in the theme could
    only have been wrong for one end or the other - and a fluid `vw` term
    would have quietly overruled whatever number the panel said, which is the
    same lie as spacing from a stylesheet.
- **Code, Embed and Breadcrumbs** are objects.
  - *Code* is shown, never run, and never highlighted — a parser per language
    would be a dependency, and the label plus a monospace face carries most of
    the meaning.
  - *Embed* takes a **URL, not markup**. `src/lib/embed.js` recognises the host,
    pulls the id out and builds the iframe from a shape it controls; anything
    it cannot frame becomes a plain link, and anything that is not a
    destination at all (`javascript:`, `data:`) is dropped. Pasting raw HTML
    would be the one hole in an otherwise strictly sanitised content model.
    Adding a provider is one entry, and the host list is shipped to the editor
    so the canvas can label a card without a second copy of it.
  - *Breadcrumbs* draws `ctx.trail`, which is what lets a Landing or Blank page
    place a trail its frame does not give it. `.breadcrumbs` moved from
    site.css to blocks.css for this: the canvas loads blocks.css and not
    site.css, and both have to draw it the same.
- **Nothing is fetched from anywhere.** Every page used to carry a preconnect
  to fonts.googleapis.com and fonts.gstatic.com and a stylesheet link to
  Google's css2 endpoint - the public site, every CMS screen, and the sign-in
  page an unauthenticated stranger can reach. Each of those handed a third
  party the visitor's address, browser and the URL they were reading, on every
  view. A server standing in your own building that still phones a CDN to draw
  a paragraph is not self-hosted, and in the EU it is the pattern a German
  court found unlawful without consent in 2022.
  - Typefaces are **uploaded, not chosen from a catalogue.** The curated list
    of fourteen Google families is gone: it was a promise the product could
    not keep on its own terms. *Theme → Typefaces* takes woff2, woff, ttf and
    otf; `themeCss` emits the `@font-face` rules inline beside the palette,
    for the same reason the palette is inline - it changes the moment
    something is uploaded.
  - **The last family installed cannot be removed.** A site with no typeface
    draws in whatever the browser keeps for last resort, which is not a state
    anybody chooses. Upload the replacement first and the old one lets go -
    which is what makes the shipped Inter removable rather than special.
  - **A file is taken for what it contains.** The uploader's name contributes
    a slug and nothing else; the magic bytes decide the extension. A `.woff2`
    that is really a script cannot land in the web root as one, and
    `location /fonts/` carries the same `script-src 'none'` and `nosniff` that
    uploaded media does.
  - **A face says which characters it holds**, and two subsets of one weight
    are two faces rather than one replacing the other. Families are
    distributed split - `inter-latin-400-normal.woff2` beside
    `inter-latin-ext-400-normal.woff2` - and without a `unicode-range` those
    are the same declaration written twice, so half an uploaded family goes
    quietly dead. Saying it also means nothing is fetched until a page needs
    it: Inter ships as latin (48 KB) and latin-ext (85 KB), and an English page
    asks for the first only. The ranges are a closed list, because the string
    goes straight into a stylesheet.
  - **A variable font is declared as its range**, `100 900` rather than `400`.
    Inter ships as one 48 KB variable file covering every weight; calling it
    400 would have the browser synthesise a fake bold from a file holding a
    real one. Weight and style are guessed from the filename - Google writes
    `Inter-SemiBold.ttf`, Fontsource writes `inter-latin-600-normal.woff2`,
    where `normal` is the *style*, which is why a bare number is read first -
    and both are a select away from corrected.
  - **One family ships, not fourteen.** Redistributing a font in a public repo
    makes whoever runs the site the distributor: Inter is OFL 1.1 and
    travels with its licence, and one licence is one thing to get right. A
    company installing this arrives with its own brand face anyway, and a
    picker listing fourteen names with files behind one of them is thirteen
    promises the install cannot keep.

- **A table takes its colour from the palette, and none by default.** It used
  to force `background: var(--white)` from the stylesheet, which on any
  coloured band drew a white slab under text the band had already turned
  white: a table on Ink was invisible. Nothing in the database had one yet,
  which is why the default could simply be made right rather than migrated.
  - Four colours, all theme colour ids: the **table's own** background, a
    **stripe** for every second body row, one per **row**, and one per
    **column**. `.b-surface--*` is the same class a band and a card use, so
    the ink, the greys and the line colour come with the background - a dark
    row inside a light table gets light text and a lighter border for free.
  - **An empty stripe colour is what "not striped" means.** No separate
    switch: a second control that has to be kept in step with the colour is
    two ways to say one thing, and the "none" swatch is already the way back
    from every other colour choice.
  - **Row beats column, and both beat the stripe.** Not an arbitrary pick -
    CSS paints a table's column layer underneath its row layer, so this is
    the browser's own order. The winner is resolved per cell in `render.js`
    and emitted as one class; letting a `<tr>` background and a `<td>`
    background fight it out would leave the answer to whichever rule this file
    happened to write last. `<col>` is unusable for the column colours for a
    sharper reason: it paints a background but is no ancestor of the cells, so
    its ink would never reach the text sitting on it.
  - **The map in the panel** is the answer to "which row?". A palette and
    twenty rows cannot both fit in a 300px panel, so the table's shape is
    drawn small, clicking a number aims the swatch grid below it, and every
    square is filled with the colour that cell will actually draw. It is a
    preview as much as a target - the stripe and the precedence are visible
    rather than something to work out.
  - The section redraws **in place** when the row count changes, because the
    number input sits just above it and a full panel re-render would replace
    the field being typed into. Same bug as the slice margin that accepted one
    digit; the map now follows a table growing to 12 rows without the second
    keystroke landing on `<body>`.
  - The target is clamped when the section draws, not when rows change, so
    shrinking a table can never leave the picker aimed at a row that is gone.

## Next up

- **Forms, before this is packaged.** The screen works and is in use, but two
  things were noticed and not settled:
  - A form can hold a Heading, Text, Divider and Spacer as well as fields.
    Kept deliberately - a long form needs sections, and those are the elements
    any other container will want later - but it is the same document-shaped
    question that the slice level failed, so it is worth a second look with a
    real long form in front of you.
  - Nothing stops a form being placed twice on one page. Harmless today (both
    post to the same place and the page finds the right object by id), but
    untested and probably not what anybody means to do.

- **A Video object.** Everything is self-hosted here - there will be no
  YouTube or Vimeo embed to fall back on - so a video needs an object of its
  own. It is not starting from nothing: pick a video file with the *Image*
  object today and both the site and the canvas already draw a `<video>`
  element, because `mediaFigure` branches on `kindOf(mime)`. What is missing
  is everything that makes a video a video rather than a picture that moves:
  - a **poster** frame, so the first paint is not a black rectangle. The
    media library has no way to attach one image to another file yet, which
    is the one piece of model work this needs.
  - **autoplay / loop / muted** as properties. A silent looping background
    clip and a piece of footage with sound are different things and cannot
    share one set of defaults - and autoplay without `muted` is refused by
    every browser, so the two have to be settled together.
  - **`preload`** as a choice rather than a constant. `metadata` is right for
    a clip below the fold and wrong for the one thing above it.
  - Sizes come free: `size` and the `.b-image--*` caps already apply.

  **One object or two, and what to call it.** The model wants one: the props
  are a superset, not a different set - a video is a picture with playback on
  top - and `mediaFigure` already branches on the file's kind rather than on
  the object's. Two objects would be two descriptions of caption, alt, size,
  alignment and link. But the palette is not the model: it is a menu of
  *intents*, and someone who wants a video looks for the word "video". Notion,
  Ghost and Gutenberg all split the palette for exactly that reason while
  keeping one media library behind it.

  So: **one object, two ways in.** Rename the kind to `media` (the `LEGACY`
  map upgrades `image` on read, as it already does for four other kinds), let
  the palette carry both Image and Video entries that create it, and let the
  panel show the playback settings only once the chosen file is a video. The
  canvas chrome and the panel then name the object after what it actually
  holds, which is the part "Image" holding a film gets wrong today.

  Deliberately parked until there is a real file to test against - guessing at
  poster behaviour without one is how you build the wrong thing twice.
- **Solid icons.** Solid reads more clearly than outlined. A self-contained
  pass over `src/views/icons.js`, which is one map of path data.
- **Inline objects, and buttons in particular.** Two buttons side by side at
  the foot of a page is a normal thing to want, and today it is a 1 x 2 table
  with its borders set to None - which works, and is plainly a workaround.
  Everything in a column is a block, so anything placed after a button starts
  a new line whether that was meant or not.

  The shape it probably wants: not a global change to how objects stack, but a
  property on the button - *sits beside the one before it* - so a run of them
  flows and everything else keeps behaving. `.b-button` is already a flex
  container that only ever holds one thing, which is most of the mechanism.
  It is a corner case, worth pushing forward until there is a page that
  actually needs it rather than one that merely could.
- **Noticed and left alone** (September 2026), both older than the work that
  turned them up:
  - The canvas draws a page on white, while the site draws pages on
    `--page-bg` (the paper grey, #f5f5f5, in the default theme) and only
    articles on white. A slice with
    no background reads a shade different in the editor from the site.
  - Below 1080px the rail becomes a strip whose icons sit in one row about
    600px wide, so the whole CMS scrolls sideways on a phone.
- **Noticed on 2026-09-21 and left alone:**
  - An AVIF upload has no stored width or height: `imageSize` cannot read
    AVIF headers. sharp can, at upload - a small fix when it matters.
  - Cards ask for 340px images (`SIZES.card`) but draw 472px wide on a
    desktop, so their pictures are a little soft on a 2x screen.
  - In a narrow column a block's name tag sits behind its own tool row.
- **Undecided:** link previews use the 800px q50 fallback. Whether they
  deserve a larger JPG of their own is still open.
- **Up to whoever deploys it:** where TLS ends, and with it `TRUST_PROXY`
  and `HOST`. `docs/deploying.md` lays out the options.

## Security, as it actually stands

Audited properly rather than assumed, by reading the surface and probing the
running stack. Ordered by what would actually be reached first.

- **`AUTH_DISABLED` defaults to on, and nginx listens on every interface.**
  This is the whole assessment in one line: `config.authDisabled` is
  `bool(process.env.AUTH_DISABLED, true)`, so every request to /cms is signed
  in as `devUser` with no cookie and no login, and `listen 8080;` binds to
  `*`. Anyone on the same Wi-Fi is a full admin - confirmed by opening
  `http://<lan-ip>:8080/cms/users` from outside localhost and getting a 200.
  On one laptop that is a convenience; in a public repo it is a fresh install
  that ships wide open.
  - **Half fixed.** The bypass is now honoured only for a request from this
    machine: `req.ip` has to be loopback - the socket itself, unless a proxy
    is named in `TRUST_PROXY` - and a loopback socket that carries
    forwarding headers with no proxy named counts as relayed, not local.
    From the LAN the CMS redirects to the login screen, with or without a
    forged `X-Real-IP` or `X-Forwarded-For` (probed again when nginx went,
    2026-09-21). Nothing about working on localhost changed.
  - **Fixed.** The default is off. Local work asks for it explicitly:
    `AUTH_DISABLED=1 ./start.sh`. It signs in as `DEV_USER` when that is
    set and as the first admin otherwise, so it names nobody by default.
  - The one-time code works with no mail server, which is what made the
    default safe to flip before passwords existed: with no `BREVO_API_KEY`
    the mail is written to `data/outbox/` and the code is shown on the
    verification screen. That is also a complete bypass - type an admin's
    address, read the code, sign in - so the code is shown **only to a
    request from this machine**. From anywhere else a mail-less install has
    no code on screen, and the operator reads it off disk.
- **Fixed: security headers on every HTML response**, in `html()` because
  that is the one door they all leave by. `script-src 'self'` with no
  `unsafe-inline` and no nonce, which is only possible because nothing here
  has an executable inline script - the one `<script>` without a src is a JSON
  island typed `application/json`. That single fact is what makes the policy
  worth having. Styles stay `unsafe-inline`: the theme is an inline `<style>`
  and the editor writes a hundred-odd `style=` attributes, and an inline style
  is a far smaller thing to give away. `frame-src` is generated from the embed
  provider list, so adding a provider is still one edit. HSTS only when the
  site URL is https, or it would pin a developer's browser to a host with no
  certificate.
- **Fixed: cookies are `Secure` once the site URL is https.** Conditional
  rather than unconditional: set always, every plain-HTTP install fails closed
  in the most confusing way there is - nobody can log in and nothing says
  why.
- **Fixed: a code can be asked for once a minute per identifier.** Asking
  again inside the window hands back the code already issued rather than
  refusing - no second mail, no second row, and "Send again" does the helpful
  thing instead of scolding someone who never got the first one. It also
  restores the five-attempt cap, which a free fresh token had quietly undone.
- **Fixed: media is checked by its magic bytes**, like a font. The declared
  type still has to be on the allowlist; the bytes then have to agree before
  anything is written into the web root under that name. Both doors ask -
  upload and replace. SVG is the one that cannot be matched on a fixed header,
  being XML, so it is matched on finding an `<svg` root near the start.
- **Fixed: a fresh install owns no account it did not make.** It used to seed
  its admin at `DEV_USER`, which defaulted to a real person's address - right
  for the one site this was built for, wrong for a public repo, where every
  install would come up owning an account whose mailbox belonged to someone
  else. Of the three ways out (refuse to boot without `DEV_USER`, seed no
  admin and ask on first run, default to an obvious placeholder), the second
  was taken. Nothing seeds an admin now; until one exists the CMS sends
  everyone to `/cms/setup`, which makes the first. It opens without asking
  for a request from this machine, like the bypass, and from anywhere else
  wants a token printed in the start-up banner and nowhere else - so a
  server started on a network is not claimed by whoever finds it first.
- **Fixed: sign-in no longer needs a mail service.** Users have a password
  (`scrypt` from `node:crypto`, stored as `scrypt$N$r$p$salt$hash` so the
  cost can rise later without stranding anyone; `src/lib/password.js`). How
  people sign in is a Settings choice - password, password or a one-time
  code, or the code alone - and a fresh install uses the password. An
  existing install whose people have no passwords is kept on the code at
  start, so upgrading locks nobody out, and Settings refuses passwords-only
  from an admin who has none. Wrong guesses are counted in memory, five per
  address and twenty per machine in fifteen minutes; memory is enough,
  because a restart is not something an attacker gets to ask for and scrypt
  already makes each guess slow. Everyone sets their own password on the
  Account screen (`/cms/account`), which signs out their other sessions;
  admins set anyone's under Users.

Not fixed, because it is about how this ships rather than how it runs:

- **There is no TLS yet**, but the two protections that depend on it now
  switch themselves on. They used to read `SITE_URL`, which comes apart from
  reality in exactly the case that matters: put a certificate on a proxy and
  forget the environment variable, and the site works, the padlock is there,
  and session cookies quietly go out without `Secure`. Nothing breaks, so
  nobody notices until somebody tests for it. `overTls(req)` reads
  `req.secure`, which believes `X-Forwarded-Proto` only from a proxy named
  in `TRUST_PROXY`; `SITE_URL` stays the fallback for a front door nobody
  named. Until September 2026 the header was trusted outright, which was
  safe only because Node listened on 127.0.0.1 behind nginx. With Node on
  the network, a forged header from the LAN turns nothing on (probed).

What held up, tested rather than assumed:

- **Three npm dependencies, all mainstream** (since 2026-09-21): express,
  compression, sharp - 74 packages installed, `npm audit` clean on the day.
  This used to read "zero, which is worth more than most of this list"; the
  trade was made on purpose, for a conventional stack the sysadmin can run.
  `package-lock.json` pins the tree and `npm ci` installs exactly it.
- **Every SQL statement is prepared.** The `UPDATE ... SET ${fields}` shapes
  build column names from a server-side allowlist, never from input.
- **The sanitiser held** against event handlers, `javascript:` and `data:`
  hrefs, `<script>`/`<style>`/`<iframe>`/`<svg onload>`, comment smuggling,
  case tricks and attribute-quote escapes. Unknown tags unwrap and their text
  is escaped. `safeHref` refuses anything that is not http(s), mailto, tel or
  a local path.
- **Traversal is blocked** on `/media/`, `/assets/` and `/fonts/`, encoded or
  not.
- **The one-time code flow is sound**: `crypto.randomInt` codes,
  `timingSafeEqual` comparison, a per-token attempt cap, no user enumeration
  in the response, and the code is only ever echoed back when no mail key is
  configured.
- **So is the password**: an unknown address costs the same scrypt and gets
  the same answer as a wrong password, so the form cannot be used to find out
  who has an account.
- **Sessions**: 32 random bytes, `HttpOnly`, `SameSite=Lax`, `Secure` behind
  TLS. There are no CSRF tokens, and `Lax` is what stands in for them - no state changes on GET, so
  a cross-site POST arrives without the cookie. Worth revisiting if a
  state-changing GET is ever added.
- **Node faces the network itself** (0.0.0.0:8080 since 2026-09-21). Each
  job nginx did was moved into the app and is tested there.
- **Errors leak nothing.** A 500 is a sentence and a log line, never a stack.
- **A stored CSS injection through a typeface's name** was found and fixed the
  same day - see the commit. Admin-only to reach, so it defaced nothing an
  admin could not already deface, but it was real.
- **The e2e suite signs in for real** rather than leaning on the bypass, which
  is what it used to do. The one flow nothing else exercised is the one
  standing between the internet and everything below it, so it is worth the
  three extra checks.
- **The front end has no accounts at all.** The sign-in chip in the top bar is
  gone: everything on the site is public, a page that should not be gets a
  password in the editor, and the way into the CMS is the CMS's own address.
  A sign-in affordance there only advertised a door no visitor has business
  at, and the `user` cell went out of the topbar grid with it.

## Deliberately not built

- **Multi-language content.** Called a hairball, parked. The front-end language
  switch was removed rather than left as dead scaffolding. Parked again after
  a proper look, and for a better reason than "it is a lot of work".
  - **The argument that settles it.** A translation is not
    what a second market needs. A landing page aimed at a Norwegian has to
    sell differently to one aimed at a Swede - different order, different
    emphasis, sometimes a different offer. It is easy to think a locale is a
    text swap; it is not, and a tool built on that assumption quietly makes
    the wrong thing easy. Where two markets really differ that much, a second
    instance is the honest answer, and this is already cheap to stand up
    twice.
  - That cuts against the design below, deliberately. The design was drawn for
    the case where the layout genuinely is shared - documentation, a product
    catalogue, a support site - which is real but narrower than "a company
    with two markets". Kept as a record of the shape, not as a recommendation.
  - **If it is ever built: the language belongs on the leaf, not on the
    page.** Page-per-locale is what Prismic does and it is flaky for a
    structural reason - copying a page into a locale copies the *layout* along
    with the words, so the two drift and you maintain N designs that were
    meant to be one. Putting the axis on the translatable props instead -
    `text: { sv: "…", en: "…" }` - means one tree, so the layout cannot drift.
    Which is exactly the property a marketing site turns out not to want.
  - **The editor gets a language switch, not a tab per page.** Flip it and the
    canvas redraws with that language's words and nothing else changed. That
    is the intuitive thing to reach for, done at the level where it is cheap.
  - The mechanical part is small: `OBJECTS` already lists each kind's
    `fields`, so a `translatable` set beside it, a locale argument through
    `normalizeProps` and `renderObject`, and a fallback to the default
    language when a string is missing.
  - **The hairball is not the content model.** It is permalinks per locale,
    menus per locale, categories and the article feed per locale, how a
    request resolves to a language (a path prefix is the only one that does
    not cause more problems than it solves), `hreflang` and canonicals, and
    deciding what an untranslated page does - fall back, or 404. That is where
    the weeks go, and none of it is made easier by choosing page-per-locale.
  - One deliberate escape hatch: a slice that belongs only to some locales,
    for the cases where the layout genuinely differs rather than the words.
- **A language picker in the CMS, or a dictionary for the CMS's own words.**
  The CMS interface is English and its strings sit inline in the views. A
  dictionary for it (`src/i18n/en.js`, with `t()` in `src/lib/i18n.js`) was
  written once and deleted on 2026-09-22: nothing had imported it since the
  article form moved onto the canvas, and with one language a one-option
  selector would be noise. That has not changed, and the *site's* dictionary
  added on 2026-09-23 is not the first half of it - it exists because the site
  has a language setting and the CMS does not. A unit test checks that no
  screen under `src/routes/cms/` or `src/views/cms/` imports it.
- **A code editor for page types.** The goal is right and worth building one
  day: making a *new* page type from the CMS rather than only choosing among
  the three. Pasting server-side source into a `<textarea>` is not the way to
  do it, for a reason the code itself settles — **there is no code in a page
  type.** All three frames differ by exactly four things:

  | | Header (H1 + lead) | Breadcrumbs | Capped in `.body-col` | Body class |
  |---|---|---|---|---|
  | Standard | yes | yes | yes | `is-subpage` |
  | Landing  | no  | no  | yes | `is-landing` |
  | Blank    | no  | no  | no  | `is-landing` |

  No branching, no computation. So the feature is a small form over those
  switches, stored as data the way a slice stores `container: "wide"` — which
  is the same rule the whole content model already follows. A sidebar frame,
  the one case the switches would not cover, is a slice with a 25/75 split;
  the page type only ever decides the frame, never the layout.

  Running pasted code would be remote code execution by design (an admin
  session becomes a shell), a syntax error would white-screen every page
  rather than one, and it would live in neither git nor the database — the
  weekly backup would catch the file, but with no history and nothing to diff.
  Everything else here is in one or the other.

## Half-done

- **Redundant field labels.** Several forms label a field *and* repeat it in
  the placeholder. Worth a pass, but not mechanical: some labels earn their
  place and some do not.
- **Object properties.** The block set is right; several blocks could carry
  more settings. Waiting on a focused list from use.
- **AVIF.** Closer than it was: the `<picture>` element exists now (for the
  fallback) and sharp encodes AVIF, so it would be a second `<source>` and a
  second set of files. Worth doing only if WebP proves not to be enough.

## Conventions worth keeping

- The CMS shares no CSS with the site. `--ui-*` in cms-tokens.css is the
  editor's own set; tokens.css belongs to the site being edited. Both load in
  the editor - the canvas needs site tokens to look like the site - and the
  names never collide. New CMS rules use `--ui-*`, always - and every one of
  those has a dark value too, so a colour change is checked in both
  appearances before it is called done.
- Few npm dependencies, each earning its place: express, compression, sharp.
  Ask before adding another. sharp is loaded at start and never required:
  if it cannot load, uploads are stored as they arrive and the library says so.
- Stored page content is semantic JSON. `props` carries intent, never
  appearance. Presentation lives in `www/assets/blocks.css`.
- The canvas shows content; settings live in the properties panel.
- **One highlight, not three.** A 1px dashed hairline means both "under the
  pointer" and "selected"; nothing fills, and typing adds no ring of its own.
  The accent marks *state*, never an action — buttons are black on white, white
  with a black outline, or red for destructive. So a blue edge always means
  "this is what you are working on", never "press me".
- **`schema.sql` is the only description of the database.** There is no
  migration code and nothing is deployed, so a column that changes shape is
  changed there and the local database is brought into line by hand or by
  `npm run reset`. Migration blocks existed while the shape was moving and
  were removed once every one of them was a no-op - they were carrying an
  upgrade path from a database that only ever existed on one laptop.
  The moment this is deployed anywhere, that stops being true and the
  guarded-block pattern (each step checking the shape it is about to change,
  so running it twice is a no-op) comes back.
- **A mousedown that selects a box must refuse its default.** The browser's
  response to a click near editable text is to find the nearest caret position
  and focus whatever holds it — so clicking a slice's empty area selected the
  slice and was then undone a millisecond later when the neighbouring heading
  refocused itself and its `focus` handler re-selected it. `preventDefault()`
  plus an explicit `blur()` fixes it, but only away from the slice's own
  controls: a drag handle needs that default to start a drag.
- `locate()` reports a slice as `{ isBlock: true, obj: block }` so generic
  code can treat one like an object. Anything branching on `found.obj` must
  therefore check `isBlock` **first**, or a selected slice takes the object
  path — which spliced a bare object into the blocks array and left the canvas
  a block it could not draw.
- A new object property needs four edits: the value list in `src/lib/objects.js`,
  a class in `blocks.css`, the panel field in `cms-editor.js`, **and** the prop
  name in that file's `VISUAL_PROPS` — without the last one it saves but the
  canvas stops matching the site until reload.
- Nothing site-specific hardcoded — it goes in Settings with a generic default.
- **Colour is never stored on a page.** A block stores a theme colour's id;
  what that id looks like is decided once, on the theme screen. The moment a
  hex value reaches page JSON, restyling a site becomes an edit of every page.
  Same rule as image `size` and table `borderColor` — and the reason
  `--font-scale` multiplies the type scale *inside* tokens.css rather than
  being re-emitted by the theme: each number is stated once.
- **A copy names what it changes, never what it keeps.** The editor's
  `copyColumns` listed the four column props it knew about, so when a column
  learned to be a card the six props that made one were dropped on the floor -
  duplicate a slice of cards and you got bare columns back. It clones the
  column whole now and rebuilds only the objects, because only they carry ids.
  `instantiateSlice` on the server had it right all along (`{ ...col }`), which
  is the shape to copy.
- **Bind what you just drew, not the whole canvas.** `bindCanvas` re-bound
  every node each time it ran, and `refreshObject` runs it after repainting a
  single object - so everything that survived the repaint collected a second
  copy of every handler, and a third after the next one. Six tweaks in the
  properties panel turned one click on Duplicate into seven slices, one drop
  into seven objects and Save as slice into seven library entries. It takes a
  root now: the canvas on a full render, the replaced node after a repaint.
  Nothing is ever bound twice because nothing is ever visited twice.
- **A prop name is not a type.** `rows` means how many rows a table has *and*
  how tall a message box draws, and one shared clamp had to pick a floor: it
  picked the message box's 2, so no table could ever have one row - which is
  what a pair of buttons side by side wants to be. Both `coerce` in the editor
  and `normalizeProps` on the server answer by the object's kind now. Worth
  checking the next time two kinds reach for the same word.

- **`SCHEMA` in settings.js is an allowlist, so a new setting has to be added
  to it.** A key that is not there reads back `null` and writes nowhere: the
  theme screen's type sizes saved to a redirect, a success banner and no
  error at all until the key was declared. There is a test that every
  `theme_*` key `saveTheme` writes has a home there.

- **A page has one save.** The Meta fold used to be a form of its own with a
  Save meta button beside Publish, so publishing a page did not save the
  description written into it a moment earlier, and saving the description
  navigated away from the editor. The fields carry `data-page-field` now and
  ride the same autosave as the page type and the password. If a page-level
  setting needs saving, that attribute is the whole job.
- **The description is meta and nothing else.** It also drew on the page as a
  lead paragraph, from a design that predates the block editor and had no
  other way to put an intro under a title - so one field answered to two
  masters and writing for search engines wrote on the page. An intro is a Text
  object at a larger size, which the author can see while writing it.
- **A control that scripts set has to say so.** The media picker wrote
  `input.value` directly, which fires nothing, so the page editor never heard
  that a share image had been chosen. Anything assigning a value in script
  dispatches `change` after it.
- **The panel has to offer the thing people came to type.** A form field's
  label is a content prop, so by rule it lived only on the canvas - but a form
  is a stack of small controls and the label is a caption inside one, not a
  line of prose you would think to click. With it missing from the panel, the
  first field there was "Field name", and that is what the label got typed
  into: it deleted every non-ASCII character silently, so "Ärende" was stored
  as "rende" and the label stayed at its English default. Two places to type
  one thing beats one place nobody finds.
  - The key is derived from the label now and empty by default, so nobody has
    to think about it. Typed into, it slugs rather than guts - "Ärende" comes
    out "arende", which is an answer rather than a mystery.
- **A test that needs a fixture must make it.** The e2e feed check looked for
  subject chips, which only draw for a category carrying a published article -
  and the run never gave its own article one. It passed for a year on a
  developer's populated database and failed the day the articles table was
  empty. Filing its own article under its own subject was half the fix and
  looked like all of it: the article is live by then, so the filing waited in
  the draft, and a chip row counts *published* articles. Settled on
  2026-09-23 by publishing in the same save - the ids land in the draft and
  publish applies them - and by checking the live article page carries the
  subject, which is the half the editor's own screen cannot tell you: a
  subject pending in a draft looks exactly like one that went out.
- **An assertion against a stale address proves nothing.** Found beside the
  above: the suite's "article removed" check fetched the address the article
  was *born* at, which had 404'd since an earlier check deliberately moved the
  piece to the site root - so it passed whether or not anything was deleted.
  It asks the address the article actually answers on now. Worth the look
  wherever a test reuses a value the run has since changed.

- **A disabled control is a hole in the canvas.** The field previews on the
  form canvas are real `<input disabled>` elements, and a disabled control
  fires no mouse events at all - it swallows the click rather than letting it
  through - so most of a field's own height selected nothing and only its
  label worked. Nothing there is meant to be typed in, so
  `pointer-events: none` hands the click to the object that owns it. Any
  preview drawn from a real control needs the same.
- **Blocks handed to the canvas must come from `normalizeBlocks`.** The form
  screen wrapped its flat list of fields in a slice built by hand, and that
  wrapper had no id - so `data-block` and `data-owner` were empty strings, a
  drop looked up a slice that did not exist, and dragging a field in from the
  palette did nothing at all, silently. Add field kept working because it
  pushes into the array rather than addressing a slice by id, which is why it
  went unnoticed. `wrapInSlice` is the one-slice version and gives it an id.
  There is a unit test on the wrapper and an e2e check on the screen.
- **If a row lights up, the row is the target.** The list rows highlighted
  under the pointer and carried a link on the title alone, so a click three
  pixels lower did nothing - the row invited it and then swallowed it. One
  delegated handler in `cms.js` reads the destination off the row's own
  `a.cell-link`, which is why no route had to change and why a row cannot end
  up pointing somewhere its title does not. Controls, and a click that
  finished a text selection, are left alone. The media grid had this all
  along; the tables were the odd ones out.

- **A palette entry names the element, not a use for it.** "Text field" read
  as the box for long text and "Message" as the box for messages, so the two
  most-reached-for entries were the two that misled: one is an input and the
  other is a textarea whatever you put in them. They are Text input, Textarea,
  Select, Radio buttons and Checkbox now - the classic element names, which
  are what people already know. **Email field keeps its name**, because it is
  the one entry that is more than the element it renders: the first filled
  email field becomes the message's `Reply-To` and the stored sender, and it
  is the only field with a server-side format check. Merging it into Text
  input would either lose the reply address or need a "this one is the email"
  switch on every text field, which is the same distinction further from where
  you are looking.
- **The field name follows the label, and says so by showing it.** It used to
  sit last in the panel under "Key in the e-mail", which was both misplaced
  and untrue: the e-mail is written from the *label*, and the name reaches the
  reader only for a field with no label at all - so the one line describing it
  sent people looking for an effect they would never see. It is called Field
  name, it sits directly under Label, and it fills in as the label is typed,
  from either place the label can be typed. Still **stored empty while it
  follows** rather than stamped with a copy, so a label corrected later
  corrects the name with it; typing here takes it over, clearing it hands it
  back. The editor folds characters with a copy of `slugify` rather than an
  approximation of it - the panel shows this value now, so a label the two
  folded differently would be the panel lying about what the site posts.
  - A consequence worth knowing: two fields with the same label derive the
    same name, and the second silently wins. Setting a name on one is the fix,
    and nothing warns about it yet.
- **A phone field is a select and an input answering together.** A number
  written 070-123 45 67 is unreachable from anywhere but the country it was
  written in, and the visitor is the only one who knows which country that is.
  So the field offers a country prefix beside the number and stores what the
  two make: E.164, `+46701234567`, joined on the server so the e-mail, the
  message list and anything reading them later all see one string.
  - **The select is a default, not a ruling.** A number typed with `+` or
    `00` has said which country it means more precisely than a dropdown can,
    so it keeps its own and the select is ignored. That is also the escape
    hatch for a country not on the list.
  - **No guessing about a bare number that starts with the dial code's
    digits.** 46 opens a Kalmar area code as well as Sweden, and being clever
    there mangles a real number in silence. Write the plus if you mean it.
  - **The check is on length, not per country.** E.164's fifteen digits and a
    floor of seven, which catches an empty box, a typo and a paste of the
    wrong thing. Knowing that +46 701 is short *for Sweden* means shipping a
    rule per country and keeping it current, which is the dependency this
    project does not take.
  - **The flag is derived from the country code**, not stored beside it - a
    regional indicator pair is the ISO code shifted into its own block - so
    the two cannot disagree. Windows and most Linux ship no flag font and
    render the pair as its two letters, which is why the option says the
    country's *name*: "SE Sweden (+46)" is a fallback, "SE SE (+46)" would
    read as a bug. The names are English, like every other string the public
    site renders.
  - **In the row, the number has the floor and the select gives way.** A
    select sizes itself to the country it is showing, and "Bosnia and
    Herzegovina (+387)" in a half-width column left about forty pixels to type
    a phone number into. The number claims 9em first. The cost is that a long
    name clips before its prefix does, on a narrow screen.
  - **Israel is deliberately not in the list.** That is the maintainer's
    decision, not a gap, and not something to add back as a fix. There is a
    test asserting its absence so that adding it back has to be a decision
    rather than a tidy-up. A number there can still be typed in full, since
    an explicit `+` or `00` overrides the select.
  - Which country a new field starts on is `site_country` in Settings, not a
    constant in the editor - same rule as everything else site-specific. The
    same setting decides how a bare number is read at sign-in and on the Users
    screen, which used to assume Sweden. A fresh install starts on GB.
- **A slice is not an object, and the drop handlers had to be told.** A
  column holds objects; a slice holds columns. The column-level and cell-level
  drops were written for objects only - a branch for a palette object, a
  branch for moving an existing one - so a saved slice aimed anywhere over
  existing content fell through both and returned. Silently, and on a page
  with content nearly everything you aim at *is* a slice or a column, so the
  only places one landed were the gaps between blocks.
  - The palette's own **Slice** was worse than doing nothing: it passed the
    object check, and `blankObject('slice')` spliced a bare `kind: 'slice'`
    into the column. The canvas drew it as an empty box and the server threw
    it away on the next save, so it looked like it had worked and then
    vanished.
  - Both mean the one thing they can mean now - *beside* the slice that
    column belongs to - routed up to canvas level with the pointer deciding
    which side. The lesson generalises: `dragPayload.source` has four shapes
    and a handler that reads only two of them fails quietly rather than
    loudly. Anything new that can be dragged wants checking against all four.
- **A template can be applied to a page that already exists.** "Start from a
  template" only ever worked on a page that did not exist yet, which is the
  wrong half of the job: a site gets laid out as blank pages first, so the
  menus have something to point at, and populated one at a time afterwards.
  There was nowhere to say "make this one look like that". *Apply a template*
  sits in the editor's link row and replaces every slice, taking the
  template's page type with it. It refuses to merge - a template is a whole
  page, and a half-applied one is neither.
  - The template arrives **re-idded by the server**, through the same
    `reIdBlocks` the create path uses. The page and the template must never
    share an id, and a second copy of that logic in the browser is a second
    thing to get wrong. It comes with its media, like a saved slice does, so
    the canvas draws the images rather than empty frames.
  - The Templates screen also had **no way to use a template** - Edit and
    Delete, and a paragraph describing an action it did not offer. A `+` per
    row and a button in the panel hand off to the create panel with the
    template already chosen, rather than making a page there: a page needs a
    name and an address, and one place should ask for them.
- **"Nothing is written until you save or publish" was never true.** Both
  destructive dialogues in the page editor said it. `markDirty` schedules an
  autosave a few seconds later that writes the blocks into `draft_content`, so
  walking away *keeps* the change. What is actually safe is the live page,
  which only Publish moves - and on a live page Discard changes puts the draft
  back to it. A page that has never been published has no live copy to go back
  to, and there it is final. Worth checking any other copy that claims
  something is unsaved.
  - The first fix was to make those dialogues explain all of that, which was
    worse: **a warning is not a manual.** It named a button that is not in the
    dialogue - and on a page that has never been published is not on the
    screen at all - at the moment somebody is deciding whether to cancel.
    Both say one line now - "This action will replace
    all slices and content on this page", and its Clear all slices twin - and
    the same line whatever is on the page. It describes what the action does,
    not what this particular page has to lose, and it replaces the page
    either way. Same reason the button stays red on an empty page: the colour
    marks the kind of action, and softening it because there happens to be
    nothing there would be reading the contents rather than the verb.
    The page type a template brings
    with it rides in the option - "Head+Cards Basic (5 slices/type Blank)" -
    because it is a property of the thing being chosen, and the row that
    saves is a row of prose in a dialogue meant to be read in one glance. It
    clips at about seventy characters, which is a long template name; the
    fallback is to put it back under the select as a labelled value.
  - The state the prose was trying to explain is **already in the buttons**:
    `editorActions` gives a published page Discard changes, Unpublish and
    Publish changes, and a draft only Publish. So there is nothing to discard
    back to and no button offering it. That is the right place for it - the
    affordance carries the state, not a paragraph.
- **A dialogue that ends in a field had its buttons flush against it.** The
  note, the subject chip and the warning each carry their own bottom margin;
  a plain `.field` does not. Only the two dialogues that ask a question were
  affected, which is why it went unseen for so long.
- **A page's address is a parent and a slug, never a typed path.** The
  breadcrumb is built by walking the permalink and looking up a page at each
  accumulated path, so the whole trail rested on whatever somebody had typed
  into one free-text box: `/brands/x` could exist while `/brands` did
  not, and the crumb then fell back to the raw slug with a link to a 404.
  Renaming a parent stranded its children with nothing said. What settled the
  shape of the answer was an objection: a parent field alone contains nothing
  while the permalink box sits next to it.
  - **Articles had already solved this**, which is what made it obviously
    right: `articles.parent_id` is a real foreign key, the address is composed
    from parent and slug, and the article screen has *no permalink field at
    all*. An article - "content rather than a place", says the schema - had a
    parent. A page, which *is* a place, had string matching.
  - Pages have `parent_id` and `slug` now, with **Appears under** and **Slug**
    in place of the permalink box. With nowhere to type a path, a path whose
    middle is nowhere cannot be written.
  - **Frozen at publish**, as an article's is. That freeze does double duty
    here: a parent that cannot move cannot strand its children. The hint says
    how to move one anyway - unpublish first - because a state that is only a
    wall sends somebody looking for a workaround.
  - **Two levels below the root**, so `/brands/brand1/mediapack` is the
    longest address there is. The test is on what the *child* would become:
    a parent already at the cap is dropped, and the page lands at the root.
    Got this wrong by one first, and the e2e check that should have caught it
    asserted `status === 200` - which is no assertion at all. Assert the
    address, not the status code.
  - **Deleting a parent re-homes what sat under it**, through the delete
    dialogue, defaulting to the site root. `ON DELETE SET NULL` alone would
    clear `parent_id` and leave the stored permalink pointing through a page
    that is gone - the exact orphaning this was built to stop. A *published*
    child cannot move, so it keeps its address and is reported instead.
  - `schema.sql` gained the columns and `scripts/migrate-page-parents.mjs`
    brought the live database into line, guarded so running it twice is a
    no-op. It was only simple because it ran while every page was still a
    single segment; it says so, and reports anything it could not resolve.
  - Two things this touched that were easy to miss: `create` needs `'/'` as an
    explicit special case or a fresh seed moves the landing page off `/` to
    a slug of its title, and `duplicate` composed from a string, so a copy of a
    nested page jumped to the root.
  - **Two routes save a page, and only one of them was taught.** The Pages
    panel posts a form to `/cms/pages/:id/meta`; the editor autosaves JSON to
    `/cms/api/pages/:id`. That second route still forwarded `permalink`, a
    field `update` had stopped reading - so an Appears under set in the editor
    was accepted, discarded, and reported as a broken breadcrumb. Breadcrumbs
    were never broken. Anything added to `metaPayload` needs adding to the
    canvas save too, and the e2e now moves a page through the JSON route.
  - **Server-rendered `disabled` needs a client counterpart** once the state
    it reflects can change without a reload. Unpublish left the address fields
    dimmed, still saying the address was fixed a moment after it had stopped
    being. `setAddressState` moves them when the status moves - same shape as
    `setDraftState`, which the Discard button already needed.
  - **A menu item names a page now, not a path.** `pageId` had been carried
    through the menu shape all along and `menuUsage` already checked it, but
    nothing ever wrote one - the seed set them and the browser editor dropped
    them on the first save, so a menu that had worked since install quietly
    became a list of strings. `normalizeMenuTree` resolves the address from
    the id, at the one funnel every menu read passes through, so `href` stays
    the single thing the six render sites read and `isActive` keeps comparing
    what it compared. A custom link has no id and is left as typed.
- **Two e2e lessons, both learned the expensive way.**
  - **`includes` on a name matches more than the thing named.** Every menu
    card lists every page title in its link picker, so a test page called
    `E2E-x menysida` made `chunk.includes('E2E-x meny')` true on *the first
    card on the screen* - the site's main menu. The test then saved over it,
    published it, and deleted it, three runs in a row, leaving the site with no main
    navigation. Both lookups match `data-menu-name value="…"` now and anchor
    the id to the start of the card.
  - **Cleanup deletes by name, never by a guessed id.** The list of ids to
    remove was built by the same lookups that were wrong, so a bad guess did
    not fail - it deleted somebody's real menu. Nothing is removed now unless
    its own name field starts with the run's tag.
- **`launchctl bootstrap` inherits the calling shell's environment**, and
  `bootout` can leave the process running as an orphan. Starting the agent
  from a shell that had just run `AUTH_DISABLED=1 node src/server.js` left the
  *live* server with sign-in switched off, and a restart did not clear it
  because the same orphan kept the port. `env -u AUTH_DISABLED launchctl
  bootstrap`, after checking the port is actually free, and confirm with
  `ps eww -p <pid>` rather than trusting the restart.
- **The lists sort by clicking a header, and the sort lives in the URL.** It
  survives a reload, can be shared, and composes with the search box - which
  reloads the page, so a sort held only in the browser would have fought it.
  `sortHeader` builds the link and the arrow; the column a query string may
  name is an allowlist in models.js, because `ORDER BY` cannot be
  parameterised and nothing from a URL should reach it. Ties break on id so a
  list cannot reshuffle between two identical requests.
  - Arriving at a column starts it in whatever reads as its natural order:
    A-Z for a name, newest first for a date. Nobody opens a list of pages
    wanting the oldest.
  - **And it is remembered, in a cookie per list.** The nav rail links to
    `/cms/pages` with no query string, so the choice was thrown away on every
    visit - and a sort is a way of working, not a one-off. Per list, because
    ordering pages by what was edited last says nothing about articles. A URL
    that names a sort still wins, so a link someone sends shows what the link
    says. A cookie rather than a column on `users`: it is a preference, not
    data, and the schema here has no migration path to spend on one.
  - The cookie's value is never validated on the way in. It does not need to
    be - the model's allowlist is what stands between a query string and
    `ORDER BY`, and a stale or hand-edited cookie falls back to the list's own
    order. There is a check for exactly that.
- **The Date column is Edited now, and shows `updated_at`.** It used to show
  `published_at || created_at`, which never moves when you work on a page - so
  the one question the list is opened to answer, "what was I last on", was the
  one it could not. The publish state is still in the Status pill, which is
  where it reads better anyway. Both the sort that was asked for and the
  fallback that was offered were about last-edited.
- **A near date is said in words.** Today gets a time of day, yesterday gets a
  name, anything older keeps its date. Every page edited today carrying the
  same string is exactly where a plain date stops distinguishing. Compared by
  calendar day rather than hours elapsed, so something saved at 23:50 is
  yesterday's work at 00:10 rather than "twenty minutes ago". Timestamps are
  stored UTC and rendered local, which is worth remembering when a test looks
  a day out - twice now it was the test that was wrong.
- **An article froze on `published_at`, which is never cleared.** So the page
  rule and the article rule looked the same and were not: a page unfreezes
  when it comes down, an article that had *ever* been live could never be
  moved again. Not a stale disabled attribute like the page one - it survived
  a reload, because it was true. The only way round was to delete the piece
  and write it again, which breaks the link anyway and loses the piece with
  it. Both freeze on `status === 'published'` now, in the route and in the
  model, and unpublishing is the honest way to break an address you have
  given out.
  - A consequence worth knowing: an article's slug is derived from its title
    on every save while it is unfrozen, so retitling one while it is down
    moves it. That was always true of a draft; it now also applies between an
    unpublish and the republish.
  - `setAddressState` is generic now. Each control carries `data-address-field`
    and its own two hints, so one function serves two screens that word the
    same state differently - a page sits *under* a page, an article *lives
    under* one.
- **An article has one save now too.** The details fold was a form of its own
  with Save details at the bottom of it, while Publish sat in the toolbar in
  plain sight - so the obvious button saved everything except what had just
  been typed, and Appears under silently did not take. A page lost exactly
  this, for exactly this reason, and the note about it was already here: the
  article screen was the half that never got the change. The fields carry
  `data-page-field` and ride the canvas autosave; `/cms/articles/:id/meta` is
  gone, because a second way to write the same fields is a second answer to
  one question.
  - `checkboxGroup` needed the collector taught that a set of boxes under one
    name is a list. It was reading the last one on the screen and answering
    true or false. `data-multi` marks the ones that mean a list, so a single
    checkbox stays a boolean.
- **An article's date can be set** (2026-09-22), under Published in its
  details. `published_at` used to be written once, on the first publish, and
  never again. The case is old news written in after the fact, which has to
  land in the feeds where it happened rather than on top of them.
  - **Pending like the title.** Cards print the date and feeds sort by it, so
    on a live article a new one waits in `draft_meta` for Publish. Publish
    takes the pending date, else the one the article has, else today -
    `COALESCE(pending, published_at, now)`, kept apart from the other columns
    because the same statement used to stamp today on it. A scheduled copy
    does the same with its own minute in place of today.
  - **A day, stored at midday** in the server's own time, where no time zone
    can tip it into the next one; today's is midday or now, whichever is
    earlier. **Never the future**: that is Schedule's job, and a live article
    dated next week would top every feed until then.
  - **Only a day that moved is written.** The field rides every autosave, and
    taking an unchanged day as a change would move an article that went out
    at 08:00 to midday - and reorder that day's feed.
  - **A refused date does not fail the save**, for the same reason: a 400 on
    every autosave would stop the writing. The reply says why and carries
    the date that was kept, and the field goes back to it.
  - Date and time fields were 2px taller than every other control in Chrome,
    which pads the inside of them - the Schedule dialog's too.
    `::-webkit-datetime-edit-fields-wrapper` loses the padding.
- **Autosave, not auto-publish.** The draft/published split covered `content`
  and nothing else, so everything that was not blocks went live as it was
  typed: a title on a live page reached the public `<h1>`, the `<title>` and
  the meta description before the keystroke finished, and Publish had nothing
  left to do about it. The scenario that matters: somebody puts a
  placeholder in a field on a live page and it is published under
  their name without their knowing.
  - `draft_meta`, one JSON column per table, holds what is pending. Publish
    applies it and empties it; Discard throws it away with the blocks;
    `hasDraftChanges` counts it, or "Live · edited" would lie and Publish
    would look like a no-op.
  - **Written straight through while the document is not live.** A page
    nobody can read has nothing public to protect, so the split would be
    ceremony - and every existing behaviour and test for drafts holds
    unchanged. Only a published row takes the other path.
  - **A value set back to what is live is dropped, not stored**, so a document
    cannot read as edited over a change nobody made.
  - **Never overlaid at hydration.** `articles.list()` draws the feeds on the
    public site as well as the list in the CMS, so merging pending values into
    the row would have leaked a half-typed title onto a feed - the exact bug
    this exists to stop, reintroduced by the fix for it. `draftView(row)` is
    the merged view and the CMS asks for it by name. There is a check that a
    feed does not carry one.
  - `password` still writes straight through. A lock on a live page has to
    take effect when it is put on, not at the next publish. The address is
    already frozen while live, which is the same protection by another route.
  - Subjects live in a join table, so there is no column to stash: the ids
    wait in `draft_meta` and Publish applies them through the same setter the
    draft path uses.
  - Nothing to backfill - empty means nothing pending, which was true of every
    existing row. `scripts/migrate-draft-meta.mjs`, guarded like the other.
- **Scheduled publishing, from the action bar.** Schedule sits beside Publish,
  because it is Publish at a later minute. A colleague asked for it.
  - **What goes out is a copy taken when Schedule is pressed**, kept in its
    own `schedules` row. The editor goes on autosaving afterwards, and
    publishing whatever the draft happens to be at 08:00 would put a
    half-finished rewrite live with nobody pressing anything - the bug the
    draft split exists to stop. So a document can have three copies: live,
    scheduled, and being written. Ghost's model, mapped onto ours: Ghost
    stops autosaving a scheduled post and asks for Update; here the draft
    keeps saving and scheduling again is the Update.
  - **Five states now**: Draft, Scheduled, Live, Live · edited,
    Live · scheduled. A schedule outranks edited in the pill, with a clock,
    and the lists put the day and time under it - a hover title is no use on
    a phone. The bar says "Goes live Monday at 08:00", and once the draft has
    moved on, "without the latest edits" with an Include them link that takes
    a fresh copy at the same minute.
  - **Discard goes back to the scheduled copy** while there is one - the
    version last committed to - rather than to what is live.
  - **Publish now and Unpublish both call a schedule off.** Publishing now
    is newer than the copy waiting, which would otherwise land on top of it
    at its minute. And "take this down" has to mean down: a page pulled
    because the event was cancelled must not come back by itself with the
    update somebody had queued. The toast says so in both cases.
  - **A scheduled address is frozen**, as a live one is. The link usually
    goes out before the page does - in the newsletter scheduled beside it.
    Removing the schedule frees it, and the hint says that.
  - Settings are copied whole, not as a diff: a document that is not live
    writes them straight to its row, so they keep moving after scheduling.
    When the copy goes out, anything the draft has moved on to lands in
    `draft_meta`, so the page reads Live · edited rather than losing the work
    or publishing it. `published_at` is the minute it was meant for;
    `updated_at` is left alone, since nobody edited it.
  - **The clock** is in server.js and ticks just after each minute turns, so
    08:00 goes out at 08:00. It runs on start, so anything due while the
    server was down goes out then, oldest first. No cron, no second process.
    An editor left open asks once its minute has passed and flips to Live by
    itself.
  - **A table, not columns**, so `schema.sql` creates it on start and an
    existing database needs nothing done. The cascade takes a schedule with
    its document.
  - Times are picked in the author's own zone and sent as an absolute
    moment, so the server never needs to know it. Displayed in the server's
    zone, like every other date here. That only differs for somebody
    outside the office's zone, and a site time zone setting is the fix if it
    ever matters.
  - Not built: scheduled *unpublishing* (a campaign that expires), and
    scheduled menus - a page going live at midnight still needs its menu
    item published by hand, and until then that link is a 404. Both follow
    the same shape if they are wanted.
- **Discard had to reload when it put a setting back.** The title, the
  description and the rest are plain fields nothing redraws, and every save
  sends what they hold - so after Discard the thrown-away title sat in its
  field and came back as pending with the next keystroke. The discard route
  says `settingsReset` now, and the editor reloads, keeping its scroll
  position and its toast in sessionStorage. Blocks-only discards still
  redraw. Predates scheduling; found beside it.
- **The articles list was never hydrated**, so it never once said
  Live · edited and showed the live title over a pending one - `draftView`
  had nothing to lay over. It is now, like the pages list. The feeds read the
  same list, which is safe: the hydrator adds fields and overlays nothing.
- **The editor redraws its pill and bar from the server** after every
  request (`editorState` in parts.js) instead of keeping its own copy of the
  rules - there are too many states now for two copies to agree. Requests
  are numbered so a late autosave cannot redraw a bar a Publish has already
  replaced.
- **A capped container needs `width: min(cap, 100% - gutter)`, not
  `max-width: cap`.** A max-width leaves a gutter only while the window is
  wider than the cap; below it the box is simply 100% and the text sits on the
  window glass. Invisible on a desktop and broken on every phone, which is
  where it was found. `.shell` and `.body-col` had always used the `min()`
  form - `.b-slice__inner` was the one written the other way, and the gutter
  it needed was applied only to slices carrying a background, which is why the
  comment above that rule describes a job it was not doing. `full` keeps no
  gutter of its own: edge to edge is the thing it is chosen for.
- **Two handlers on one toggle is the same as none.** The panel's formatting
  buttons were bound in `renderProperties` *and* in `bindProps`, which runs a
  line earlier. Every one of those commands toggles - `h2` is
  `toggleBlock('h2')`, `bold` is `execCommand('bold')` - so each click applied
  the command and immediately took it back off, and the panel looked inert
  beside an identical bar that worked. Worth suspecting whenever something
  reversible does nothing at all.
- **A preview has to show the whole draft, not the draft blocks.** It swapped
  in `draftBlocks` and read everything else from the live row, which was
  invisible while metadata went live as it was typed and became a lie the
  moment it stopped. A preview that disagrees with what Publish will do is
  worse than no preview. `draftView` on both preview routes.
- **An inset box-shadow follows the border-radius.** The active menu item was
  marked with `inset 0 -3px`, and the link's rounded corners curved both ends
  of it up - so the "line" read as a smudge under the word. A pseudo-element
  stays straight whatever the corner does. Worth remembering for any rule that
  draws an edge on something rounded.
- **Selection is marked in the accent, not the highlight.** Which page you
  are on is said in the colour the site says everything else interactive in,
  in both the main menu and the sub menu - the same meaning should not change
  colour with the bar it is in. Read from `--c-accent`, which the theme screen
  writes, so recolouring the accent moves the markers with it. The cost, when
  this was decided on a black top bar, was contrast: the accent was about
  4.6:1 against it where the old yellow mark was about 14:1. The default bar
  is white now and the accent (#357abb) sits at about 4.5:1 on it - still
  clear of the 3:1 a non-text indicator needs, with less room to spare than
  a theme might want.
- **An image chooses its corners.** Every image was rounded by a fixed rule
  in blocks.css, and some artwork is not allowed to be - a partner's logo was
  the case that raised it: its guidelines own its shape, and on an opaque
  file the rounding shows. `radius` on the Image object, on the scale a
  card already uses (Square, Slight, Rounded, Very rounded), so a name
  measures the same on both. A name rather than a pixel value, like every
  other appearance a page stores. The default is Very rounded, which is what
  every image already had, so it carries no class and nothing placed before
  moved. Only the Image object: an article's lead image, on its page and on
  its feed card, still rounds from site.css.
- **The canvas tinted a picture the site does not.** A filled image frame
  on the canvas was grey, left over from before the site stopped tinting
  what holds a picture - so a transparent logo sat in a rounded grey box in
  the editor and on nothing at all on the site, and its corners looked like
  a choice the page had made. Only an empty frame is tinted now.
- **The CMS has a dark mode.** Appearance sits at the foot of the rail by
  Pin menu and steps through Match system, Dark mode and Light mode; the
  choice is kept in the browser, like the pin. Match system is the default
  and follows the system when it changes.
  - **The greys are Photoshop's**, measured off a screen grab of its
    interface rather than eyeballed: workspace #191919,
    panels #323232, fields #292929 with #474747 borders, the selected row
    #4a4a4a, and text at #e7e7e7, #d6d6d6, #adadad and #808080. They sit
    where Photoshop puts them - panes at panel grey, the centre darker behind
    them, fields recessed - and the text keeps the contrast steps the light
    set has. The grab has no colour, so red, amber and green are lifted until
    they read as text on a dark panel; a red button keeps a deeper red so
    white still reads on it.
  - **One set of names, two sets of values.** Light is on `:root`, dark on
    `:root[data-appearance="dark"]`, so a rule says `--ui-ink` and never
    asks which mode it is in. Where one light colour did two jobs that dark
    has to tell apart, it got a role name that light mode maps straight back
    to the palette: `--ui-workspace`, `--ui-edge`, `--ui-sunken`,
    `--ui-selected`, `--ui-toast`, `--ui-danger-fill`, `--ui-preview` and a
    few more. Nothing drawn in light mode moved. A test checks that every
    token cms.css uses is defined, and that dark defines nothing light lacks.
  - **The canvas stays light.** It shows the page the way the site draws it,
    and the site has not gone dark - so in dark mode the canvas takes the
    light token set back (it is named in the light block's selector) and is
    a light sheet with room round it. The theme screen's type sample is
    treated the same way.
  - **Decided in the head.** A deferred script would paint white and then
    switch; an inline one is refused by the CSP. So cms-appearance.js is a
    small, blocking file ahead of the stylesheets, on the CMS and on the
    sign-in screen alike, and the rail's icon is chosen by CSS from the root
    so it is right before cms.js runs.
  - **The profile travels.** `docs/dark-mode-profile.md` holds the same
    colours without this codebase's names - role, hex, OKLCH and contrast -
    so they can be used elsewhere. Change a dark token here and that copy
    wants the same change.
  - The CMS's own mark (`src/views/brand.js`) is drawn inline in
    `currentColor`, so it follows light and dark with one drawing rather than
    two image files - a dark wordmark on a dark ground is what two files were
    working around. Pictures in the library and the pickers sit on
    Photoshop's medium grey (#535353) in dark mode, so black artwork on
    nothing is still visible.
  - Found beside it: the title column of a list never truncated, so the
    dashboard's tables were wider than their cards and the views column sat
    off the edge. Invisible on white, obvious on a dark card. That column's
    header was also still Swedish.
- New CMS wording is English and sits inline beside its neighbours; there is
  no dictionary to add it to (see Deliberately not built). A word the *site*
  says for itself is the other case and goes in `src/lib/words.js`, in every
  language there, or a Swedish page starts speaking English mid-sentence.

## Running it

    ./start.sh          # Node on :8080 by hand; installs the packages first time
    AUTH_DISABLED=1 ./start.sh        # ...without the login, from this machine only
    THEME_DIR=/srv/my-theme ./start.sh  # ...serving a theme's files over www/assets
    ./scripts/autostart.sh install    # keep it running across logins
    npm test            # 212 unit tests, the Express app's own among them
    npm run test:e2e    # 132 checks against a running stack, signing in for real
    SCHEDULE_WAIT=1 npm run test:e2e  # ...plus a minute's wait for the publishing clock
    npm run test:clean  # clear leftovers from an interrupted e2e run
    npm run reset       # wipe and re-seed (refuses while the server is up)
    node scripts/image-backfill.mjs   # convert what is missing, add missing fallbacks

A fresh database has no admin. The first visit to the CMS goes to
`/cms/setup`, which makes one: it opens as it is on this machine, and from
anywhere else wants the token the start-up banner prints. The e2e suite then
runs green against that empty database - checked on 2026-09-23 by making an
admin in a throwaway one and pointing the suite at a server on a spare port.
It used to fail one check there ("the feed offers its subject chips"), for
the reason under Conventions ("A test that needs a fixture must make it").

Root `assets/` is scratch: screen grabs, colour picks and backups dropped in
while something is being talked through, and `.gitignore` leaves it on disk
and out of git. The ignore file still makes exceptions for
`assets/site-structure.md` (the spec) and `assets/demowww/` (the original
demo site); neither came over with this repo.
