import crypto from 'node:crypto';
import { sanitizeHtml } from './html.js';
import { slugify } from './util.js';
import { isCountry } from './phone.js';

/**
 * Slice -> object -> content. That is the whole hierarchy.
 *
 * A page is a stack of slices and nothing else. A slice owns the layout: how
 * many columns it has, how they are split, how wide it draws. Objects are the
 * content inside a column and never lay anything out themselves - which is why
 * there is no columns object here, only `form`, whose single slot groups the
 * fields belonging to one form.
 */

/**
 * The object registry.
 *
 * `fields` lists which props an object carries; `content` marks the one prop
 * edited directly on the canvas, everything else belongs in the properties
 * panel. `columns` makes an object a container, `slots` a single-slot one.
 */
export const OBJECTS = {
  heading:  { label: 'Heading',      icon: 'heading',   content: 'text',
              // `level` before `headingSize`: the size falls back to whatever
              // the level used to imply, so no existing heading changes.
              fields: ['text', 'level', 'headingSize', 'align', 'ink', 'anchor'] },
  text:     { label: 'Text',         icon: 'paragraph', content: 'html',
              fields: ['html', 'textSize', 'align', 'ink'] },
  image:    { label: 'Image',        icon: 'image',     content: 'media',
              fields: ['media', 'caption', 'href', 'alt', 'size', 'radius', 'align'] },
  button:   { label: 'Button',       icon: 'button',    content: 'label',
              fields: ['label', 'href', 'colour', 'outline', 'buttonSize', 'align'] },
  link:     { label: 'Link',         icon: 'link',      content: 'label',
              fields: ['label', 'href', 'align'] },
  quote:    { label: 'Quote',        icon: 'quote',     content: 'text',
              fields: ['text', 'source', 'align', 'ink'] },
  table:    { label: 'Table',        icon: 'table',
              // rows and cols come before cells: the grid is sized against
              // them, and so are the two colour lists.
              fields: ['rows', 'cols', 'headerRow', 'cells', 'surface', 'stripes',
                'rowSurfaces', 'colSurfaces', 'borders',
                'borderStyle', 'borderWidth', 'borderColor', 'cellPadding'] },
  divider:  { label: 'Divider',      icon: 'divider',   fields: ['borderStyle'] },
  spacer:   { label: 'Spacer',       icon: 'spacer',    fields: ['height'] },
  /* A form is not written on a page any more - it exists once, on its own
     screen, and a page says which one it wants. What a form owns settles it:
     a recipient, a subject line and the messages people send belong to one
     thing, not to a paragraph that happens to be on a page. */
  form:     { label: 'Form',         icon: 'form',      fields: ['formId'] },
  articles: { label: 'Article feed', icon: 'articles',
              // `limit` is a batch size now, not a ceiling: `more` says what
              // happens when there are more than it shows. `order` comes
              // before `more`, because a random feed never loads more.
              fields: ['categories', 'limit', 'layout', 'order', 'more', 'filter'] },
  breadcrumbs: { label: 'Breadcrumbs', icon: 'breadcrumbs', fields: ['align'] },
  code:     { label: 'Code',         icon: 'code',      content: 'code',
              fields: ['code', 'language', 'filename'] },
  embed:    { label: 'Embed',        icon: 'embed',
              fields: ['url', 'caption'] },

  /* Form fields. Only meaningful inside a form container.
     Named after the elements they make, because a name that describes a *use*
     tells the author the wrong thing: "Text field" read as the box for long
     text and "Message" as the box for messages, when one is an input and the
     other is a textarea whatever you put in it. Email field keeps its name -
     it is the one entry that is more than the element it renders, since the
     reply address and the format check hang off it. */
  fieldText:     { label: 'Text input',  icon: 'formField', formField: true, content: 'label',
                   fields: ['label', 'name', 'placeholder', 'required', 'width'] },
  fieldEmail:    { label: 'Email field', icon: 'mail', formField: true, content: 'label',
                   fields: ['label', 'name', 'placeholder', 'required', 'width'] },
  /* Like Email field, this one is more than the element it renders: a select
     of country prefixes beside the input, and a number stored as E.164 rather
     than as whatever was typed. `prefix` is the country it starts on. */
  fieldPhone:    { label: 'Phone number', icon: 'phone', formField: true, content: 'label',
                   fields: ['label', 'name', 'placeholder', 'required', 'width', 'prefix'] },
  fieldTextarea: { label: 'Textarea',    icon: 'paragraph', formField: true, content: 'label',
                   fields: ['label', 'name', 'placeholder', 'required', 'rows'] },
  fieldSelect:   { label: 'Select',      icon: 'chevronDown', formField: true, content: 'label',
                   fields: ['label', 'name', 'options', 'required', 'width'] },
  fieldRadio:    { label: 'Radio buttons', icon: 'radio', formField: true, content: 'label',
                   // A select hides its options behind a click; a set of
                   // radios shows them. Same data, different question - which
                   // is why both are offered rather than one standing in.
                   fields: ['label', 'name', 'options', 'required'] },
  fieldCheckbox: { label: 'Checkbox',    icon: 'check', formField: true, content: 'label',
                   fields: ['label', 'name', 'required'] },
};

export const OBJECT_ORDER = [
  'heading', 'text', 'image', 'button', 'link', 'quote', 'table',
  'divider', 'spacer', 'code', 'embed', 'breadcrumbs', 'form', 'articles',
];

/**
 * What an article is written with: the same canvas a page is, less the three
 * objects that are about a *page's* place in the site rather than about
 * anything you would write.
 *
 * Deliberately not a short list of its own. A comparison piece wants a table;
 * a two-up wants columns; and both are already built. Restricting an article
 * to Text and Image would have meant a second, weaker editor beside a good
 * one - and then two ways to put a picture into a CMS, which is how an author
 * ends up guessing which tool they are supposed to reach for.
 */
const NOT_IN_ARTICLES = new Set([
  'breadcrumbs',  // an article's trail comes from the page it lives under
  'articles',     // a feed inside one of its own entries
  'form',         // a form belongs on a page that exists to collect something
]);

export const ARTICLE_OBJECT_ORDER = OBJECT_ORDER.filter((kind) => !NOT_IN_ARTICLES.has(kind));

/** Whether an object may be placed in an article body. */
export const allowedInArticle = (kind) => !NOT_IN_ARTICLES.has(kind) && !isFormField(kind);

/** Field objects. Only meaningful on the form screen. */
export const FORM_FIELD_ORDER = ['fieldText', 'fieldEmail', 'fieldPhone', 'fieldTextarea',
  'fieldSelect', 'fieldRadio', 'fieldCheckbox'];

/**
 * What a form is written with.
 *
 * The same canvas a page is, cut down to the fields plus the few things that
 * belong around them: a heading over the fields, a line of explanation, a
 * rule, some air. Not a bespoke list of rows with its own label and
 * placeholder inputs - that would be a second, weaker editor beside a good
 * one, and a second answer to "how do I put a heading above these fields".
 */
export const FORM_OBJECT_ORDER = [
  ...FORM_FIELD_ORDER, 'heading', 'text', 'divider', 'spacer',
];
const FORM_ALLOWED = new Set(FORM_OBJECT_ORDER);

/** Whether an object may be placed in a form. */
export const allowedInForm = (kind) => FORM_ALLOWED.has(kind);

export const isFormField = (kind) => !!OBJECTS[kind]?.formField;
export const hasSlot = (kind) => !!OBJECTS[kind]?.slots;
/** The prop edited in place on the canvas, if any. */
export const contentProp = (kind) => OBJECTS[kind]?.content || null;

export const isContainer = (kind) => !!(OBJECTS[kind]?.columns || OBJECTS[kind]?.slots);
export const columnCount = (kind) => OBJECTS[kind]?.columns || OBJECTS[kind]?.slots || 0;
export const objectLabel = (kind) => OBJECTS[kind]?.label || kind;

export const newId = () => crypto.randomBytes(6).toString('hex');

const SIDES = ['top', 'right', 'bottom', 'left'];
const ALIGNMENTS = new Set(['left', 'center', 'right']);
/**
 * How big a heading draws, separately from which tag it is.
 *
 * They used to be one thing: `level` picked the tag *and* the size, which
 * capped the biggest heading available at whatever an h2 measures - about a
 * third of what a real hero needs. A page's outline and its typography are
 * different decisions, so they are two fields.
 */
export const HEADING_SIZES = ['small', 'medium', 'large', 'xlarge', 'display'];

/** What each level used to measure, so nothing already written changes. */
const SIZE_FOR_LEVEL = { h1: 'xlarge', h2: 'large', h3: 'medium', h4: 'small' };

export const BUTTON_SIZES = ['small', 'medium', 'large'];

/**
 * How big a block of text draws.
 *
 * The same separation headings got: what a thing *is* and how big it draws are
 * different decisions. An intro paragraph under a hero is body copy - not a
 * heading, and not a lead pretending to be one - it is simply larger. Without
 * this the only way to get one was to make it an h2, which puts a rung in the
 * page's outline that nobody asked for.
 *
 * `body` is the default and carries no class, so nothing already written moves.
 */
export const TEXT_SIZES = ['small', 'body', 'large', 'xlarge'];

/** What a feed does when there are more articles than it shows at once. */
export const FEED_MORE = ['none', 'button', 'scroll'];

/** Which articles a feed shows first: the latest, or a fresh pick per page load. */
export const FEED_ORDER = ['newest', 'random'];

/**
 * How wide an image is allowed to draw. Named rather than a pixel value: the
 * content stays free of presentation, and blocks.css decides what each name
 * measures - including what it should collapse to on a phone.
 */
const IMAGE_SIZES = new Set(['small', 'medium', 'large', 'full']);

/**
 * What the old three-value `variant` meant, in theme colours. Read once, on
 * the way in, so a page written before buttons had a palette keeps its look
 * without anything having to be rewritten in the database.
 */
const LEGACY_VARIANT_COLOUR = { accent: 'accent', ghost: '', default: '' };

/**
 * Column splits, keyed by how many columns the slice has. Same reasoning as
 * image size: the page stores the intent ("wider on the left"), never a
 * grid-template-columns string.
 */
export const COLUMN_RATIOS = {
  1: ['full'],
  2: ['50-50', '67-33', '33-67', '75-25', '25-75'],
  3: ['equal', 'wide-left', 'wide-center', 'wide-right'],
  4: ['equal'],
};
const DEFAULT_RATIO = { 1: 'full', 2: '50-50', 3: 'equal', 4: 'equal' };

export const MAX_COLUMNS = 4;

/**
 * How wide a slice draws inside the content column. Proportions rather than
 * measurements, so "half the page" needs no arithmetic and no guess about what
 * survives on a phone - blocks.css collapses every one of them to full width
 * on a narrow screen.
 */
export const SLICE_WIDTHS = ['full', 'three-quarters', 'half', 'measure'];

/**
 * How wide a slice's content draws inside its band.
 *
 * A different axis from `width`: this is the box, `width` is a proportion of
 * it. On a page whose template caps the body already, the frame wins and this
 * only ever narrows; on a Blank page there is no cap and this is the whole
 * decision. The measurements live in the theme, so a slice stores "wide" and
 * the theme screen decides what wide is.
 */
export const SLICE_CONTAINERS = ['narrow', 'body', 'wide', 'full'];

/**
 * A slice's background is a theme colour's id, never a colour.
 *
 * Deliberately not validated against the palette: this module would have to
 * read settings to do that, and a colour deleted from the theme would then
 * silently rewrite pages that used it. An unknown id simply matches no
 * `.b-surface--*` rule and the band draws plain - recoverable by putting the
 * colour back, which a rewrite would not be.
 */
/**
 * A name to link to, as a URL fragment.
 *
 * Deliberately something the author writes, not the object's own id. Every
 * object has an id already, but `reIdBlocks` mints fresh ones whenever a page
 * is copied or planted from a template - so a link to one would break the
 * moment the page it points into was duplicated, silently. A written name
 * survives that, and reads as something in the address bar.
 *
 * Empty means no anchor and no `id` in the markup: an anchor is a promise
 * that a URL keeps working, and that is worth making on purpose.
 */
export const anchorSlug = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const slug = slugify(raw, '').slice(0, 60);
  // slugify falls back to a placeholder for input that yields nothing.
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? slug : '';
};

const THEME_COLOR = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const themeColor = (value) => {
  const id = String(value ?? '').toLowerCase().slice(0, 24);
  return THEME_COLOR.test(id) ? id : '';
};

/** Space between columns. */
export const SLICE_GAPS = ['none', 'small', 'medium', 'large'];

const V_ALIGNMENTS = new Set(['top', 'middle', 'bottom']);

/**
 * Tables hold tabular data, which is a different thing from a slice's columns:
 * columns are a layout that stacks on a phone, a table's rows and cells mean
 * nothing apart from each other. Borders and padding are named intents like
 * everywhere else; there is deliberately no per-cell styling.
 */
const TABLE_BORDERS = new Set(['all', 'rows', 'columns', 'none']);
const CELL_PADDING = new Set(['small', 'medium', 'large']);
/* Line appearance, shared by tables and dividers. Names, not values: what
   `medium` measures and what `soft` looks like is blocks.css's business. */
const BORDER_STYLES = new Set(['solid', 'dashed', 'dotted']);
const BORDER_WIDTHS = new Set(['thin', 'medium', 'thick']);
const BORDER_COLORS = new Set(['soft', 'medium', 'strong', 'accent']);

/**
 * A colour per row, and a colour per column, as theme colour ids.
 *
 * Exactly one entry per row or column, the same rule `cells` follows: a
 * colour left behind on a row that has been deleted is a value nobody can
 * see, reach or clear. An empty string is the ordinary case - it means the
 * row takes whatever the table, the stripe or the band underneath gives it.
 */
const surfaceList = (raw, length) => {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length }, (_, i) => themeColor(list[i]));
};

/**
 * How round a card's or an image's corners are.
 *
 * A name, not a measurement, like every other appearance the model stores -
 * and one scale for both, so "Rounded" measures the same wherever it is
 * chosen. A card defaults to `medium`, which is what the demo site's cards
 * measured. An image defaults to `large`, which is what every image had
 * before it could be changed, so nothing already placed moves. `none` is for
 * artwork whose own rules forbid rounding it - a logo, most often.
 */
export const RADII = ['none', 'small', 'medium', 'large'];
export const MAX_TABLE_ROWS = 20;
export const MAX_TABLE_COLS = 8;

const spacing = (raw) => {
  const out = {};
  for (const side of SIDES) {
    const n = Number.parseInt(raw?.[side], 10);
    if (Number.isFinite(n) && n !== 0) out[side] = Math.max(-200, Math.min(400, n));
  }
  return out;
};

const clean = (value, max = 500) => String(value ?? '').slice(0, max);

const intIn = (value, min, max, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

function normalizeProps(kind, raw = {}) {
  const p = {};
  const fields = OBJECTS[kind]?.fields || [];
  for (const field of fields) {
    switch (field) {
      case 'text':    p.text = clean(raw.text, 2000); break;
      case 'source':  p.source = clean(raw.source, 300); break;
      case 'html':    p.html = sanitizeHtml(clean(raw.html, 60000)); break;
      case 'caption': p.caption = clean(raw.caption, 500); break;
      case 'alt':     p.alt = clean(raw.alt, 300); break;
      case 'label':   p.label = clean(raw.label, 200); break;
      case 'heading': p.heading = clean(raw.heading, 300); break;
      case 'href':    p.href = clean(raw.href, 1000); break;
      /* Code is shown, never run: it is escaped on the way out like any other
         text, so the only thing to decide here is how much of it to keep. */
      case 'code':     p.code = clean(raw.code, 20000); break;
      /* A language is one word. Stripping disallowed characters and keeping
         the rest turned "js!! rm -rf" into "jsrm-rf"; taking the first token
         first gives "js", which is what was meant. */
      case 'language':
        p.language = clean(raw.language, 30).trim().split(/\s+/)[0]
          .replace(/[^A-Za-z0-9+#.-]/g, '').slice(0, 20);
        break;
      case 'filename': p.filename = clean(raw.filename, 120); break;
      /* An embed stores the URL the author pasted, not the frame built from
         it. src/lib/embed.js decides whether it is one it can draw, so a
         provider added later fixes every page that already has the link. */
      case 'url':      p.url = clean(raw.url, 1000); break;
      case 'media': {
        const id = Number.parseInt(raw.media, 10);
        p.media = Number.isFinite(id) && id > 0 ? id : null;
        break;
      }
      /* Which form this is, and the only thing a page stores about it. Every
         other answer - the fields, the recipient, what the button says - is
         read from the form itself at render time, so one form on three pages
         is one form. */
      case 'formId': {
        const id = Number.parseInt(raw.formId, 10);
        p.formId = Number.isFinite(id) && id > 0 ? id : null;
        break;
      }
      case 'textSize':
        p.textSize = TEXT_SIZES.includes(raw.textSize) ? raw.textSize : 'body';
        break;
      case 'align':   p.align = ALIGNMENTS.has(raw.align) ? raw.align : 'left'; break;
      /* Text colour, as a theme colour id. Empty means "whatever the surface
         this sits on says", which is the right answer almost always. */
      case 'ink':     p.ink = themeColor(raw.ink); break;
      case 'anchor':  p.anchor = anchorSlug(raw.anchor); break;
      /* Two different numbers share the name `rows`: how many rows a table's
         grid has, and how tall a message box draws. Answered by the kind -
         one shared rule meant a floor that suited one of them and broke the
         other. */
      case 'rows':
        p.rows = kind === 'table'
          ? intIn(raw.rows, 1, MAX_TABLE_ROWS, 3)
          : intIn(raw.rows, 2, 20, 6);
        break;
      case 'cols':    p.cols = intIn(raw.cols, 1, MAX_TABLE_COLS, 3); break;
      case 'headerRow': p.headerRow = !!raw.headerRow && raw.headerRow !== 'false'; break;
      /* The table's own background, and the alternating one. Both are theme
         colour ids like every other colour on a page; an empty stripe colour
         is what "not striped" means, so there is no separate switch to keep
         in step with it. */
      case 'surface': p.surface = themeColor(raw.surface); break;
      case 'stripes': p.stripes = themeColor(raw.stripes); break;
      case 'rowSurfaces': p.rowSurfaces = surfaceList(raw.rowSurfaces, p.rows); break;
      case 'colSurfaces': p.colSurfaces = surfaceList(raw.colSurfaces, p.cols); break;
      case 'borders': p.borders = TABLE_BORDERS.has(raw.borders) ? raw.borders : 'all'; break;
      case 'borderStyle':
        p.borderStyle = BORDER_STYLES.has(raw.borderStyle) ? raw.borderStyle : 'solid';
        break;
      case 'borderWidth':
        p.borderWidth = BORDER_WIDTHS.has(raw.borderWidth) ? raw.borderWidth : 'thin';
        break;
      case 'borderColor':
        p.borderColor = BORDER_COLORS.has(raw.borderColor) ? raw.borderColor : 'soft';
        break;
      case 'cellPadding':
        p.cellPadding = CELL_PADDING.has(raw.cellPadding) ? raw.cellPadding : 'medium';
        break;
      case 'cells': {
        // Exactly rows x cols, no more: cells outside the table would be data
        // in the page that nobody can see, which is not what this model stores.
        const grid = Array.isArray(raw.cells) ? raw.cells : [];
        p.cells = Array.from({ length: p.rows }, (_, r) => {
          const row = Array.isArray(grid[r]) ? grid[r] : [];
          return Array.from({ length: p.cols }, (_, c) => normalizeCell(row[c]));
        });
        break;
      }
      case 'size':    p.size = IMAGE_SIZES.has(raw.size) ? raw.size : 'full'; break;
      // Only an image carries this as a prop; a card's lives on its column.
      case 'radius':  p.radius = RADII.includes(raw.radius) ? raw.radius : 'large'; break;
      /* A button takes a theme colour like everything else, and `outline`
         turns that colour into the edge instead of the fill. `variant` said
         default/accent/ghost, which was a private three-colour palette beside
         the real one. */
      case 'colour':  p.colour = themeColor(raw.colour ?? LEGACY_VARIANT_COLOUR[raw.variant]); break;
      case 'outline':
        p.outline = raw.outline === undefined
          ? raw.variant !== 'accent' && raw.variant !== undefined
          : (!!raw.outline && raw.outline !== 'false');
        break;
      case 'buttonSize':
        p.buttonSize = BUTTON_SIZES.includes(raw.buttonSize) ? raw.buttonSize : 'medium';
        break;
      case 'headingSize':
        p.headingSize = HEADING_SIZES.includes(raw.headingSize)
          ? raw.headingSize
          : (SIZE_FOR_LEVEL[p.level] || 'large');
        break;
      case 'level':
        // h1 is offered because a Landing or Blank page has no page title to
        // carry one, and a page with no h1 has no top to its outline.
        p.level = ['h1', 'h2', 'h3', 'h4'].includes(raw.level) ? raw.level : 'h2';
        break;
      case 'height': {
        const n = Number.parseInt(raw.height, 10);
        p.height = Number.isFinite(n) ? Math.max(4, Math.min(240, n)) : 32;
        break;
      }
      case 'recipient':      p.recipient = clean(raw.recipient, 200); break;
      case 'subject':        p.subject = clean(raw.subject, 200); break;
      case 'successMessage': p.successMessage = clean(raw.successMessage, 500); break;
      case 'submitLabel':    p.submitLabel = clean(raw.submitLabel, 100); break;
      /* What the field is called in the submitted data - the input's `name` -
         and a name has to be plain. It used to *delete* everything else, so a
         Swedish label typed here came out mangled with nothing said: "Ärende"
         became "rende". Slugified instead, so it comes out "arende" - a
         recognisable answer rather than a mystery. Empty is the ordinary case:
         it means "follow the label", and renderField derives it there, so a
         label corrected later corrects the name with it. */
      case 'name':
        p.name = raw.name === undefined || String(raw.name).trim() === ''
          ? ''
          : slugify(clean(raw.name, 60), '');
        break;
      /* Which country a phone field's select starts on. An id, never a dial
         code: two countries share +7 and two share +1, so the code cannot say
         which flag to draw - and the same rule a colour follows, where the
         page stores the id and the theme decides what it looks like. */
      case 'prefix':         p.prefix = isCountry(raw.prefix) ? String(raw.prefix).toUpperCase() : ''; break;
      case 'placeholder':    p.placeholder = clean(raw.placeholder, 200); break;
      case 'required':       p.required = !!raw.required && raw.required !== 'false'; break;
      case 'width':          p.width = raw.width === 'half' ? 'half' : 'full'; break;
      case 'rows': {
        const n = Number.parseInt(raw.rows, 10);
        p.rows = Number.isFinite(n) ? Math.max(2, Math.min(20, n)) : 6;
        break;
      }
      case 'options':
        p.options = String(raw.options ?? '').split('\n')
          .map((line) => line.trim()).filter(Boolean).slice(0, 60).join('\n');
        break;
      /* Which subjects the feed draws from, and empty means every one -
         which is what a news page is. `category` held a single id; a feed
         pointed at "Produktion or Forskning" could not be said at all. */
      case 'categories': {
        const list = Array.isArray(raw.categories) ? raw.categories
          : (raw.category != null && raw.category !== '' ? [raw.category] : []);
        const seen = new Set();
        p.categories = list
          .map((value) => Number.parseInt(value, 10))
          .filter((n) => Number.isFinite(n) && n > 0 && !seen.has(n) && (seen.add(n), true))
          .slice(0, 12);
        break;
      }
      case 'limit': {
        const n = Number.parseInt(raw.limit, 10);
        p.limit = Number.isFinite(n) ? Math.max(1, Math.min(24, n)) : 3;
        break;
      }
      case 'layout':
        p.layout = ['grid', 'feature', 'feature-reverse', 'list'].includes(raw.layout) ? raw.layout : 'grid';
        break;
      /* Random is a new pick on every page load: a portrait on the front
         page that is not the same one every visit. `newest` is the default,
         so nothing already placed changes. */
      case 'order':
        p.order = FEED_ORDER.includes(raw.order) ? raw.order : 'newest';
        break;
      /* What happens past the first batch. Deliberately not an "All" on the
         count: "all" of 300 articles is 300 cards nobody scrolls to, while
         `scroll` with a batch of 12 *is* all of them, delivered a screen at
         a time. `none` is the default, so nothing already placed changes.
         A random feed is a pick, not a list, and never loads more: the next
         batch would be a new shuffle, and repeat what the first one showed. */
      case 'more':
        p.more = p.order !== 'random' && FEED_MORE.includes(raw.more) ? raw.more : 'none';
        break;
      /* Whether visitors may narrow the feed by subject. Only worth it on a
         page that lists a lot - which is why it is off unless asked for. */
      case 'filter':
        p.filter = !!raw.filter && raw.filter !== 'false';
        break;
    }
  }
  return p;
}

/**
 * Older content used separate `header`/`subheader` objects and a `list` object
 * that the rich-text editor now covers. Upgrade those on read so stored pages
 * keep working without a migration step.
 */
const LEGACY = {
  header:    (raw) => ({ kind: 'heading', props: { ...raw.props, level: 'h2' } }),
  subheader: (raw) => ({ kind: 'heading', props: { ...raw.props, level: 'h3' } }),
  body:      (raw) => ({ kind: 'text', props: { ...raw.props } }),
  list:      (raw) => ({ kind: 'text', props: { ...raw.props, html: wrapAsList(raw.props?.html) } }),
};

/** A legacy list held loose lines; make it a real <ul> unless it already is. */
function wrapAsList(html) {
  const value = String(html ?? '');
  if (!value.trim()) return '';
  if (/<(ul|ol)\b/i.test(value)) return value;
  const items = value
    .replace(/<\/p>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .split('\n').map((line) => line.trim()).filter(Boolean);
  return items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '';
}

/**
 * A table cell holds objects, like a column does - an image or a button is as
 * legitimate in a cell as a line of text. A table is the one thing it cannot
 * hold: nesting one grid in another is how a layout tool turns into a
 * spreadsheet, and form fields belong to a form.
 */
export function normalizeCell(raw) {
  // Cells used to be plain strings. Keep that text rather than drop it.
  if (typeof raw === 'string') {
    return raw.trim() ? normalizeObjects([{ kind: 'text', props: { html: `<p>${escapeText(raw)}</p>` } }]) : [];
  }
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.objects) ? raw.objects : []);
  return normalizeObjects(list)
    .filter((o) => o.kind !== 'table' && !OBJECTS[o.kind]?.formField)
    .slice(0, 8);
}

const escapeText = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Normalise one object from untrusted input. Returns null for unknown kinds. */
export function normalizeObject(raw, depth = 0) {
  if (!raw || typeof raw !== 'object') return null;
  let source = raw;
  const legacy = LEGACY[String(raw.kind || '')];
  if (legacy) source = { ...raw, ...legacy(raw) };

  const kind = String(source.kind || '');
  if (!OBJECTS[kind]) return null;

  const obj = {
    id: /^[a-z0-9]{4,32}$/i.test(source.id || '') ? source.id : newId(),
    kind,
    props: normalizeProps(kind, source.props || {}),
    style: {
      margin: spacing(source.style?.margin),
      padding: spacing(source.style?.padding),
    },
  };

  if (isContainer(kind)) {
    const count = columnCount(kind);
    const cols = Array.isArray(source.columns) ? source.columns : [];
    // Containers nest exactly one level.
    obj.columns = Array.from({ length: count }, (_, i) =>
      depth >= 1 ? [] : normalizeObjects(cols[i], depth + 1));
  }
  return obj;
}

export function normalizeObjects(list, depth = 0) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => normalizeObject(item, depth)).filter(Boolean).slice(0, 200);
}

const id4 = (value) => (/^[a-z0-9]{4,32}$/i.test(value || '') ? value : newId());

/** One column of a slice: its own box settings plus the objects inside it. */
/**
 * One column of a slice: its own box settings plus the objects inside it.
 *
 * A column is also where a *card* lives. A slice's surface is a band and runs
 * the full width; a column's surface is a card and sits inside the content
 * column - same palette, two scales. It goes here rather than in an object of
 * its own because a card is a box, and a box is layout, which is the slice's
 * business: objects are content and lay nothing out. It also means three
 * cards across are the same height for free, since the columns are grid items
 * and already stretch.
 *
 * `border` is a switch of its own rather than being implied by a width: a
 * card with a background and no outline is as ordinary as one with both.
 */
function normalizeColumn(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  // A bare array is a column that carries nothing but its objects.
  const objects = Array.isArray(raw) ? raw : source.objects;
  return {
    align: ALIGNMENTS.has(source.align) ? source.align : 'left',
    valign: V_ALIGNMENTS.has(source.valign) ? source.valign : 'top',
    surface: themeColor(source.surface),
    border: !!source.border && source.border !== 'false',
    borderStyle: BORDER_STYLES.has(source.borderStyle) ? source.borderStyle : 'solid',
    borderWidth: BORDER_WIDTHS.has(source.borderWidth) ? source.borderWidth : 'thin',
    borderColor: BORDER_COLORS.has(source.borderColor) ? source.borderColor : 'soft',
    radius: RADII.includes(source.radius) ? source.radius : 'medium',
    style: { padding: spacing(source.style?.padding) },
    objects: normalizeObjects(objects),
  };
}

/**
 * A page block is always a slice. Anything else arriving here - a loose object
 * from an older page, or a single object dropped onto an empty canvas - is
 * wrapped in a one-column slice, so the stored shape has exactly one form.
 */
export function normalizeBlock(raw) {
  if (!raw || typeof raw !== 'object') return null;

  if (raw.type !== 'slice') {
    const obj = normalizeObject(raw.object ?? raw);
    return obj ? wrapInSlice([obj]) : null;
  }

  const rawCols = Array.isArray(raw.columns) ? raw.columns
    // Older slices held a flat `objects` list, which is one column's worth.
    : [Array.isArray(raw.objects) ? raw.objects : []];
  const count = Math.max(1, Math.min(MAX_COLUMNS, rawCols.length));
  const columns = Array.from({ length: count }, (_, i) => normalizeColumn(rawCols[i]));

  const allowed = COLUMN_RATIOS[count] || ['full'];
  const p = raw.props || {};
  return {
    type: 'slice',
    id: id4(raw.id),
    sliceId: Number.parseInt(raw.sliceId, 10) || null,
    name: clean(raw.name, 120),
    props: {
      ratio: allowed.includes(p.ratio) ? p.ratio : DEFAULT_RATIO[count],
      gap: SLICE_GAPS.includes(p.gap) ? p.gap : 'medium',
      width: SLICE_WIDTHS.includes(p.width) ? p.width : 'full',
      container: SLICE_CONTAINERS.includes(p.container) ? p.container : 'body',
      surface: themeColor(p.surface),
      anchor: anchorSlug(p.anchor),
      // Kept on the page and off the site - see visibleBlocks.
      hidden: !!p.hidden && p.hidden !== 'false',
    },
    style: {
      margin: spacing(raw.style?.margin),
      padding: spacing(raw.style?.padding),
    },
    columns,
  };
}

/**
 * The slices a visitor gets: every one that is not hidden.
 *
 * Hiding keeps a slice on its page - in place, editable, and live again with
 * one click and a publish - which is what an alternative version, or a
 * campaign between runs, needs. Everything public reads through this: the
 * page, its preview, the forms and feeds it serves, its link-preview image,
 * the sections a link can point at. Left out rather than covered up, the way
 * the password gate works: a slice shipped with display:none would still be
 * there to read in view-source.
 */
export const visibleBlocks = (blocks) => (blocks || []).filter((block) => !block?.props?.hidden);

/** Build a one-column slice around some objects. */
export function wrapInSlice(objects, name = '') {
  return normalizeBlock({ type: 'slice', name, columns: [{ objects }] });
}

export function normalizeBlocks(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeBlock).filter(Boolean).slice(0, 200);
}

/** Every column of every slice, flattened - handy for walking a page. */
export function* walkColumns(blocks) {
  for (const block of blocks || []) {
    for (const col of block?.columns || []) yield col;
  }
}

/** Build a fresh, empty object of a kind - used when dropping from the library. */
export function blankObject(kind) {
  return normalizeObject({ kind, props: {}, style: {} });
}

/**
 * Instantiate a library slice as a page block. Every id is minted afresh, so
 * two copies of the same slice on one page never share an object id.
 */
export function instantiateSlice(slice) {
  const def = typeof slice.definition === 'string'
    ? JSON.parse(slice.definition || 'null') : slice.definition;
  const block = normalizeBlock({ ...(def || {}), type: 'slice' });
  return {
    ...block,
    id: newId(),
    sliceId: slice.id,
    name: slice.name,
    columns: block.columns.map((col) => ({ ...col, objects: col.objects.map(reId) })),
  };
}

/**
 * A slice as stored in the library: layout and content, no page identity.
 * Nor whether it is hidden - that is a fact about one page, and a slice
 * placed from the library should arrive where it can be seen.
 */
export function sliceDefinition(block) {
  const norm = normalizeBlock({ ...block, type: 'slice' });
  return { props: { ...norm.props, hidden: false }, style: norm.style, columns: norm.columns };
}

/**
 * Every block, with every id minted afresh.
 *
 * Copying a page or planting a template must not leave two pages sharing an
 * object id: the editor addresses blocks by id, so a duplicate makes "which
 * one did you mean" a real question the moment either page is edited.
 */
export function reIdBlocks(blocks) {
  return normalizeBlocks(blocks).map((block) => ({
    ...block,
    id: newId(),
    columns: block.columns.map((col) => ({ ...col, objects: col.objects.map(reId) })),
  }));
}

/**
 * One object with a fresh id, and everything nested inside it too - a form's
 * fields, and the objects living in a table's cells. Missing the cells left
 * copies sharing ids with their original, which the editor addresses blocks
 * by and so cannot tell apart.
 */
const reId = (obj) => ({
  ...obj,
  id: newId(),
  ...(obj.columns ? { columns: obj.columns.map((col) => col.map(reId)) } : {}),
  ...(obj.props?.cells
    ? { props: { ...obj.props, cells: obj.props.cells.map((row) => row.map((cell) => cell.map(reId))) } }
    : {}),
});

/** Walk every object in a block list, containers included. */
export function* walkObjects(blocks) {
  for (const col of walkColumns(blocks)) {
    for (const obj of col.objects || []) {
      if (!obj) continue;
      yield obj;
      // `form` still groups its fields in a slot of its own.
      for (const slot of obj.columns || []) for (const child of slot) yield child;
      // A table's cells hold objects too - an image in one still needs its
      // media resolved, and still counts as the page's first image.
      for (const row of obj.props?.cells || []) {
        for (const cell of row) for (const child of cell || []) yield child;
      }
    }
  }
}

/** First image media id on a page - powers "use first image" for OG tags. */
export function firstImageId(blocks) {
  for (const obj of walkObjects(blocks)) {
    if (obj.kind === 'image' && obj.props.media) return obj.props.media;
  }
  return null;
}
