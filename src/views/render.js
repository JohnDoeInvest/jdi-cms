import { esc, cls, attrs, joinHtml, safeHref } from '../lib/html.js';
import { isContainer, columnCount, isFormField, walkObjects } from '../lib/objects.js';
import { mediaUrl, kindOf, pictureHtml, SIZES } from '../lib/media.js';
import { icon } from './icons.js';
import { formatDate, stripTagsSafe } from './helpers.js';
import { slugify } from '../lib/util.js';
import { issue, HONEYPOT, TOKEN, EVIDENCE } from '../lib/formguard.js';
import { parseEmbed } from '../lib/embed.js';
import { countryOptions } from '../lib/phone.js';
import { breadcrumbs } from './layout.js';
import { siteWords } from '../lib/words.js';

/**
 * The site's own words, for a renderer handed a context without them.
 *
 * English is the same fallback `config.defaultLang` is, and it keeps every
 * function in this file callable with a bare context - which is how the tests
 * draw one object at a time, and how a renderer stays a pure function of what
 * it is given.
 */
const wordsIn = (ctx) => ctx?.words || siteWords();


/**
 * An anchor, kept unique within the page being rendered.
 *
 * Two objects can honestly carry the same name - two "Contact" headings on a
 * long page - and duplicate ids mean the browser silently jumps to the first
 * one forever. Numbering the later ones keeps every link landing somewhere,
 * which is the whole point of having anchors at all.
 */
function anchorAttr(anchor, ctx) {
  if (!anchor) return '';
  const seen = ctx.anchorsSeen || (ctx.anchorsSeen = new Set());
  let id = anchor;
  for (let n = 2; seen.has(id); n++) id = `${anchor}-${n}`;
  seen.add(id);
  return ` id="${esc(id)}"`;
}

/** Turn a normalised style object into an inline style attribute. */
function styleAttr(style = {}) {
  const bits = [];
  for (const [side, value] of Object.entries(style.margin || {})) bits.push(`margin-${side}:${value}px`);
  for (const [side, value] of Object.entries(style.padding || {})) bits.push(`padding-${side}:${value}px`);
  return bits.length ? ` style="${bits.join(';')}"` : '';
}

const alignClass = (align) => (align && align !== 'left' ? `align-${align}` : '');

/** 'full' is the default and carries no class. */
const sizeClass = (size) => (size && size !== 'full' ? ` b-image--${size}` : '');
/** 'large' is the corner every image had before it was a choice, so it carries no class. */
const radiusClass = (radius) => (radius && radius !== 'large' ? ` b-image--r-${radius}` : '');

/**
 * `sizes` for a capped image. Without this the browser would still pick a
 * variant for a full-width slot and download far more than the cap needs.
 */
const IMAGE_SIZES_ATTR = {
  small:  '180px',
  medium: '320px',
  large:  '(max-width: 760px) 100vw, 520px',
};

/**
 * What "Open in new tab" puts on the anchor - a button's, a link's, or the
 * one a linked image is wrapped in.
 *
 * `rel` is not optional beside `target="_blank"`: without `noopener` the page
 * that opens can reach back through `window.opener` and navigate the tab it
 * came from. `noreferrer` rides along because that is the pair the rich-text
 * sanitiser already adds to an author's own link (see src/lib/html.js), and a
 * link typed into a Text object should not behave differently from the same
 * link made as an object.
 */
const newTabAttrs = (p = {}) => (p.newTab ? ' target="_blank" rel="noopener noreferrer"' : '');

/**
 * One image, video or file, in the markup blocks.css actually styles.
 *
 * The class names have to match the editor canvas exactly (`b-image`,
 * `b-image__frame`) or the shared stylesheet misses the site entirely - which
 * is what silently cost images their sizing, their frame and their alignment.
 */
function mediaFigure(item, {
  caption, href, newTab, alt, className = 'b-image', attrs = '', sizes = SIZES.content,
}) {
  if (!item) {
    return `<figure class="${className}"${attrs}><div class="b-image__frame"></div></figure>`;
  }
  const url = mediaUrl(item.filename);
  const kind = kindOf(item.mime);
  let inner;
  if (kind === 'video') {
    inner = `<video controls preload="metadata" src="${esc(url)}"></video>`;
  } else if (kind === 'pdf') {
    inner = `<a class="block-file" href="${esc(url)}" target="_blank" rel="noopener">
      ${icon('pdf', 22)}<span>${esc(item.original_name)}</span></a>`;
  } else {
    inner = pictureHtml(item, {
      sizes, img: `alt="${esc(alt || item.alt || '')}" loading="lazy" decoding="async"`,
    });
  }
  const framed = `<div class="b-image__frame">${inner}</div>`;
  /* The object's own link goes round a picture and nothing else.
     A PDF draws its own file link and a video its own controls, and both are
     interactive content - which an anchor may not contain, so the browser
     "fixes" the nesting by closing the outer one early and the markup stops
     being what it says. It is also the wrong thing to want: a click on a PDF
     chip should open the PDF, and a click on a video should play it, not
     navigate somewhere a link field once said. The editor's panel says so
     rather than leaving the setting to be quietly ignored. */
  const linked = href && kind === 'image'
    ? `<a href="${esc(href)}"${newTabAttrs({ newTab })}>${framed}</a>`
    : framed;
  const text = caption ?? item.caption;
  return `<figure class="${className}"${attrs}>${linked}${
    text ? `<figcaption>${esc(text)}</figcaption>` : ''}</figure>`;
}

/**
 * Render one object. `ctx` carries the media map, categories and request info
 * so rendering never has to hit the database mid-template.
 */
export function renderObject(obj, ctx) {
  if (!obj) return '';
  const { props = {}, style } = obj;
  const s = styleAttr(style);
  const align = props.align && props.align !== 'left' ? ` b-align-${props.align}` : '';
  /* An explicit text colour, as a theme colour id. Left empty the object
     inherits from whatever surface it sits on, which is nearly always right. */
  const ink = props.ink ? ` b-ink--${props.ink}` : '';

  switch (obj.kind) {
    case 'heading': {
      if (!props.text) return '';
      // The tag says where this sits in the page's outline; the size says how
      // big it draws. Two decisions, so two classes.
      const tag = props.level || 'h2';
      const size = props.headingSize || 'large';
      return `<${tag} class="b-heading b-heading--${size}${align}${ink}"${
        anchorAttr(props.anchor, ctx)}${s}>${esc(props.text)}</${tag}>`;
    }

    case 'text': {
      // `body` is the default and carries no class, so a page written before
      // text had sizes emits exactly the markup it always did.
      const size = props.textSize && props.textSize !== 'body' ? ` b-text--${props.textSize}` : '';
      return props.html ? `<div class="b-text${size}${align}${ink}"${s}>${props.html}</div>` : '';
    }

    case 'image':
      return mediaFigure(ctx.media?.get(props.media), {
        className: `b-image${sizeClass(props.size)}${radiusClass(props.radius)}${align}`, attrs: s,
        caption: props.caption, href: props.href, newTab: props.newTab, alt: props.alt,
        // A capped figure is served a correspondingly smaller variant.
        sizes: IMAGE_SIZES_ATTR[props.size] || SIZES.content,
      });

    case 'table':
      return renderTable(props, ctx, s, align);

    case 'button':
      return props.label
        ? `<div class="b-button${align}"${s}><a class="${buttonClasses(props)}"
            href="${esc(props.href || '#')}"${newTabAttrs(props)}>${esc(props.label)}</a></div>`
        : '';

    case 'link':
      return props.label
        ? `<div class="b-link${align}"${s}><a class="b-link__el" href="${esc(props.href || '#')}"${
            newTabAttrs(props)}>${esc(props.label)}</a></div>`
        : '';

    case 'quote':
      return props.text
        ? `<blockquote class="b-quote${align}${ink}"${s}>${esc(props.text)}${
            props.source ? `<cite>${esc(props.source)}</cite>` : ''}</blockquote>`
        : '';

    case 'divider':
      return `<hr class="${cls('b-divider', lineClasses(props))}"${s}>`;

    case 'spacer':
      return `<span class="b-spacer" aria-hidden="true" style="height:${Number(props.height) || 32}px"></span>`;

    case 'form':
      return renderForm(obj, ctx, s);

    case 'articles':
      return renderArticleFeed(obj, ctx, s);

    case 'code':
      return renderCode(props, s, align);

    case 'embed':
      return renderEmbed(props, s, align);

    /* The trail the page frame draws for a Standard page, as an object - so a
       Landing or Blank page, which has no frame to hang one in, can still
       place it. `ctx.trail` is null on the landing page itself. */
    case 'breadcrumbs':
      return ctx.trail?.length
        ? `<div class="b-breadcrumbs${align}"${s}>${breadcrumbs(ctx.trail, wordsIn(ctx))}</div>`
        : '';

    default:
      return isFormField(obj.kind) ? renderField(obj, ctx) : '';
  }
}

/**
 * What a button looks like, wherever it is.
 *
 * A form's submit button used to carry `b-button__el--accent`, a class from
 * the three-value palette that went when buttons started taking theme
 * colours - so it named nothing, drew as the bare default, and there was no
 * way to colour it. Same function for both now, so the next thing a button
 * learns is learned once.
 */
const buttonClasses = (p = {}) => cls('b-button__el',
  p.colour && `b-button__el--c-${p.colour}`,
  p.outline && 'b-button__el--outline',
  p.buttonSize && p.buttonSize !== 'medium' && `b-button__el--${p.buttonSize}`);

/* ------------------------------------------------------------------ forms */

/** One field inside a form. `values` repopulates after a failed submit. */
export function renderField(obj, ctx = {}) {
  const p = obj.props || {};
  /* What this field is called in the submitted data. Left unset it follows
     the label, which is the thing the author actually wrote - and following
     rather than copying means a label corrected later corrects this too. The
     object id stays as the last resort for a field with no label either,
     because a form control still needs a name to post under.
     Note the *e-mail* is written from the label, not from this: the name
     reaches the reader only for a field that has no label at all. */
  const name = fieldKey(obj);
  const id = `ff-${obj.id}`;
  const values = ctx.flash?.formValues || {};
  const value = values[name] ?? '';
  const req = p.required ? ' required' : '';
  const star = p.required ? ' <span class="b-field__req" aria-hidden="true">*</span>' : '';
  const label = `<label for="${esc(id)}">${esc(p.label || '')}${star}</label>`;
  const half = p.width === 'half' ? ' b-field--half' : '';

  switch (obj.kind) {
    case 'fieldTextarea':
      return `<div class="b-field${half}">${label}
        <textarea id="${esc(id)}" name="${esc(name)}" rows="${Number(p.rows) || 6}"
          placeholder="${esc(p.placeholder || '')}"${req}>${esc(value)}</textarea></div>`;

    case 'fieldSelect': {
      const options = String(p.options || '').split('\n').map((o) => o.trim()).filter(Boolean);
      return `<div class="b-field${half}">${label}
        <select id="${esc(id)}" name="${esc(name)}"${req}>
          <option value="">${esc(p.placeholder || '—')}</option>
          ${options.map((o) => `<option${attrs({ value: o, selected: value === o })}>${esc(o)}</option>`).join('')}
        </select></div>`;
    }

    /* A set of radios rather than a select: same data, different question.
       Grouped in a fieldset so the label belongs to the whole group, which is
       what a screen reader needs to read the question before the answers. */
    case 'fieldRadio': {
      const options = String(p.options || '').split('\n').map((o) => o.trim()).filter(Boolean);
      return `<fieldset class="b-field b-field--group${half}">
        <legend>${esc(p.label || '')}${star}</legend>
        ${options.map((o, i) => `<label class="b-checkbox" for="${esc(id)}-${i}">
          <input type="radio" id="${esc(id)}-${i}" name="${esc(name)}"${
            attrs({ value: o, checked: value === o, required: !!p.required && i === 0 })}>
          <span>${esc(o)}</span></label>`).join('')}
      </fieldset>`;
    }

    case 'fieldCheckbox':
      return `<div class="b-field${half}"><label class="b-checkbox" for="${esc(id)}">
        <input type="checkbox" id="${esc(id)}" name="${esc(name)}" value="1"${value ? ' checked' : ''}${req}>
        <span>${esc(p.label || '')}${star}</span></label></div>`;

    case 'fieldEmail':
      return `<div class="b-field${half}">${label}
        <input type="email" id="${esc(id)}" name="${esc(name)}" autocomplete="email"
          placeholder="${esc(p.placeholder || '')}" value="${esc(value)}"${req}></div>`;

    /* Two controls under one label, and one answer out of them: the select
       says which country, the input says the rest, and the server joins them
       into E.164 before anything reads the value. The select carries its own
       label because a screen reader meets it before the visible one and
       "Phone" would name the pair rather than this half of it. */
    case 'fieldPhone': {
      const chosen = String(values[`${name}_prefix`] || p.prefix
        || ctx.settings?.site_country || '').toUpperCase();
      const options = countryOptions().map((c) => `<option${
        attrs({ value: c.value, selected: c.value === chosen })}>${esc(c.label)}</option>`).join('');
      return `<div class="b-field${half}">${label}
        <div class="b-phone">
          <select class="b-phone__code" name="${esc(name)}_prefix" aria-label="Country code">${options}</select>
          <input class="b-phone__number" type="tel" id="${esc(id)}" name="${esc(name)}"
            autocomplete="tel-national" inputmode="tel"
            placeholder="${esc(p.placeholder || '')}" value="${esc(value)}"${req}>
        </div></div>`;
    }

    default:
      return `<div class="b-field${half}">${label}
        <input type="text" id="${esc(id)}" name="${esc(name)}"
          placeholder="${esc(p.placeholder || '')}" value="${esc(value)}"${req}></div>`;
  }
}

/**
 * A form is a container of field objects. On success the whole form is
 * replaced by its confirmation message, so the page never looks unchanged.
 */
/**
 * A form on a page.
 *
 * The page says which form; everything else is read from the form itself, so
 * the same form on three pages is one form. `ctx.forms` is loaded before
 * rendering starts, like `ctx.media` - the renderer still never touches the
 * database.
 *
 * Its body is blocks, written on the same canvas a page is, so it draws
 * through renderBlock like anything else. A form with a heading and a line of
 * explanation over its fields needs no special case here: those are a Heading
 * and a Text.
 */
function renderForm(obj, ctx, s) {
  const id = obj.props?.formId;
  const form = id ? ctx.forms?.get(id) : null;

  if (!form) {
    /* Says so on the page rather than rendering nothing, because a form that
       has been deleted out from under a page is something the author has to
       be able to see. Only while editing: a visitor gets silence. */
    return ctx.isPreview
      ? `<p class="placeholder-note"${s}>This form has been deleted. Choose another in the panel.</p>`
      : '';
  }

  const words = wordsIn(ctx);
  const sent = ctx.flash?.formSentId === obj.id;
  if (sent) {
    return `<section class="b-form"${s}>
      <p class="b-form__status b-form__status--ok">${
        esc(form.success_message || words.formThanks)}</p>
    </section>`;
  }

  const error = ctx.flash?.formErrorId === obj.id ? ctx.flash.formError : '';
  /* A flat list, rendered straight into the form element - so a form takes
     the width of whatever holds it, whether that is a column, a card or a
     table cell. It used to be a stack of slices, which made every placed form
     a full-width band of its own. */
  const body = form.objects?.length
    ? joinHtml(form.objects.map((obj) => renderObject(obj, ctx)))
    : `<p class="b-field__hint">${esc(words.formEmpty)}</p>`;

  /* The honeypot is skipped when a real field already answers to that name:
     `fieldKey` lets an author set props.name to anything, and reading a
     visitor's own answer as a robot is the one failure this must not have. */
  const trap = !formFields(form).some((f) => fieldKey(f) === HONEYPOT);

  return `<form class="b-form" method="post" action="/form/submit" novalidate${s}>
    <input type="hidden" name="page" value="${esc(ctx.path || '')}">
    <input type="hidden" name="form" value="${esc(obj.id)}">
    <input type="hidden" name="${TOKEN}" value="${esc(issue(obj.id, ctx.path || ''))}">
    <input type="hidden" name="${EVIDENCE}" value="" data-guard>
    ${trap ? `<div class="b-form__trap" aria-hidden="true">
      <label for="ff-trap-${esc(obj.id)}">Website</label>
      <input id="ff-trap-${esc(obj.id)}" type="text" name="${HONEYPOT}"
             value="" tabindex="-1" autocomplete="off">
    </div>` : ''}
    ${error ? `<p class="b-form__status b-form__status--error">${esc(error)}</p>` : ''}
    ${body}
    <div><button class="${buttonClasses({
      colour: form.colour, outline: form.outline, buttonSize: form.button_size,
    })}" type="submit">${esc(form.submit_label || words.send)}</button></div>
  </form>`;
}

/**
 * What a field posts under.
 *
 * Exported because three places need the same answer - the input's name
 * attribute, /form/submit reading it back, and the honeypot checking it is
 * not about to collide with a real field. Two answers would mean a field
 * nobody could fill in.
 */
export const fieldKey = (obj) =>
  obj.props?.name || slugify(obj.props?.label, '') || `f_${obj.id}`;

/** Every field object inside a form's blocks, in the order they are drawn. */
export const formFields = (form) =>
  (form?.objects || []).filter((obj) => isFormField(obj.kind));

/* -------------------------------------------------------------- code / embed */

/**
 * A block of code, shown and never run. There is no syntax highlighting: it
 * would mean a parser per language, and the label plus a monospace face
 * carries most of the meaning at none of the cost.
 */
function renderCode(props, s = '', align = '') {
  if (!props.code) return '';
  const label = props.filename || props.language;
  return `<div class="b-code${align}"${s}>`
    + (label ? `<div class="b-code__label">${esc(label)}</div>` : '')
    + `<pre class="b-code__pre"><code>${esc(props.code)}</code></pre></div>`;
}

/**
 * A third-party embed, framed from a URL this file's allowlist recognises.
 *
 * An unrecognised URL becomes a link rather than nothing: the author pasted
 * something meaningful, and a page that silently drops it is worse than one
 * that shows where it pointed.
 */
function renderEmbed(props, s = '', align = '') {
  if (!props.url) return '';
  const embed = parseEmbed(props.url);
  if (!embed) {
    // A real destination no provider matched still becomes a link: the author
    // meant something by it. Something that is not a destination at all -
    // `javascript:`, `data:` - is dropped, because there is nothing to show
    // and a dead link labelled with the payload is worse than silence.
    const href = safeHref(props.url);
    if (!href) return '';
    return `<p class="b-embed b-embed--plain${align}"${s}>`
      + `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">`
      + `${esc(props.url)}</a></p>`;
  }
  const box = embed.height
    ? ` style="height:${Number(embed.height)}px"`
    : ` style="aspect-ratio:${esc(embed.ratio || '16 / 9')}"`;
  return `<figure class="b-embed${align}"${s}>`
    + `<div class="b-embed__frame"${box}>`
    + `<iframe src="${esc(embed.src)}" title="${esc(props.caption || embed.provider.name)}"`
    + ' loading="lazy" allowfullscreen'
    + ' referrerpolicy="strict-origin-when-cross-origin"'
    + ' sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"></iframe></div>'
    + (props.caption ? `<figcaption>${esc(props.caption)}</figcaption>` : '')
    + '</figure>';
}

/* ------------------------------------------------------------ article feeds */

/** The box each layout puts its articles in. */
const FEED_WRAP = {
  grid: 'card-grid',
  list: 'article-list',
  feature: 'article-features',
  'feature-reverse': 'article-features',
};

/**
 * The articles themselves, in whichever shape the layout asks for.
 *
 * Exported because the load-more endpoint renders the next batch with it -
 * one description of what an article looks like, rather than a second copy
 * living in the browser.
 */
export function feedItems(list, layout = 'grid', words = siteWords()) {
  if (layout === 'feature' || layout === 'feature-reverse') {
    return joinHtml(list.map((a) => articleFeature(a, layout === 'feature-reverse', words)));
  }
  if (layout === 'list') return list.map((a) => articleRow(a, words)).join('');
  return list.map(articleCard).join('');
}

/** Subjects a visitor can narrow the feed to, plus the way back to all of them. */
function chipRow(chips, active, path, words) {
  const href = (slug) => esc(slug ? `${path}?category=${encodeURIComponent(slug)}` : path);
  return `<nav class="chip-row" aria-label="${esc(words.subjects)}">
    <a class="chip${active ? '' : ' is-active'}" href="${href('')}">${esc(words.allSubjects)}</a>
    ${chips.map((c) => `<a class="chip${active === c.id ? ' is-active' : ''}"
       href="${href(c.slug)}">${esc(c.name)}</a>`).join('')}
  </nav>`;
}

/**
 * An article feed.
 *
 * `ctx.feedFor` does the reading, so the renderer still never touches the
 * database. The markup carries the page's path and this object's id rather
 * than the query that produced it: the load-more endpoint re-reads the props
 * from the stored page, exactly as /form/submit reads a form's fields from
 * the page rather than from whatever the browser sent.
 */
function renderArticleFeed(obj, ctx, s = '') {
  const props = obj.props || {};
  const words = wordsIn(ctx);
  const feed = ctx.feedFor?.(props) || { items: [], hasMore: false, chips: [], active: null };
  const layout = props.layout || 'grid';
  const chips = props.filter && feed.chips.length
    ? chipRow(feed.chips, feed.active, ctx.path || '/', words) : '';

  const body = feed.items.length
    ? `<div class="${FEED_WRAP[layout] || 'card-grid'}" data-feed-items>${feedItems(feed.items, layout, words)}</div>`
    : `<div class="placeholder-note">${esc(words.feedEmpty)}</div>`;

  /* `more` only means anything while there is more, so the control is not
     drawn on a feed that is already showing everything - a "Load more" that
     loads nothing is worse than no button at all. */
  const wantsMore = props.more === 'button' || props.more === 'scroll';
  const control = wantsMore && feed.hasMore
    ? (props.more === 'button'
      ? `<div class="feed-more"><button class="btn" type="button" data-feed-more>${esc(words.showMore)}</button></div>`
      : '<div class="feed-more feed-more--auto" data-feed-more aria-hidden="true"></div>')
    : '';

  return `<div class="article-feed"${s}${wantsMore ? attrs({
    'data-feed': obj.id,
    'data-path': ctx.path || '/',
    'data-offset': feed.items.length,
    'data-mode': props.more,
    'data-category': feed.activeSlug || '',
  }) : ''}>${chips}${body}${control}</div>`;
}

/** Frames 2.1 / 3.6 - the wide article band with the image on one side. */
export function articleFeature(a, reverse = false, words = siteWords()) {
  return `<article class="${cls('article-feature', reverse && 'article-feature--reverse')}">
    <div class="article-feature__media">
      ${articleImg(a, SIZES.feature)}
    </div>
    <div class="article-feature__body">
      ${a.category_name ? `<span class="tag">${esc(a.category_name)}</span>` : ''}
      <h2 class="block-subheader">${esc(a.title)}</h2>
      ${a.lead ? `<p class="article-feature__lead">${esc(a.lead)}</p>` : ''}
      <div><a class="btn" href="${esc(articleHref(a))}">${esc(a.cta_label || words.readMore)}</a></div>
    </div>
  </article>`;
}

/**
 * Where a card points. An article's own address, unless it carries a CTA link
 * - which is how a piece that is really a pointer somewhere else is written.
 */
export const articleHref = (a) => a.cta_url || a.permalink || '/';

/**
 * An article's lead image. Article queries join the media columns in flat, so
 * they are reassembled into the shape the srcset helpers expect.
 */
export function articleImg(a, sizes) {
  if (!a.image_filename) return '';
  const row = {
    filename: a.image_filename,
    variants: a.image_variants || '',
    width: a.image_width,
    height: a.image_height,
    fallback_filename: a.image_fallback || '',
  };
  return pictureHtml(row, { sizes, img: `alt="${esc(a.image_alt || '')}" loading="lazy" decoding="async"` });
}

export function articleCard(a) {
  return `<a class="card" href="${esc(articleHref(a))}">
    <div class="card__media">${articleImg(a, SIZES.card)}</div>
    <div class="card__body">
      ${a.category_name ? `<span class="tag">${esc(a.category_name)}</span>` : ''}
      <h3>${esc(a.title)}</h3>
      ${a.lead ? `<p class="card__excerpt">${esc(stripTagsSafe(a.lead, 140))}</p>` : ''}
      <div class="card__meta">${esc(formatDate(a.published_at || a.created_at))}</div>
    </div>
  </a>`;
}

export function articleRow(a, words = siteWords()) {
  return `<a class="article-row" href="${esc(articleHref(a))}">
    <time datetime="${esc(a.published_at || a.created_at)}">${esc(formatDate(a.published_at || a.created_at))}</time>
    <div>
      ${a.category_name ? `<span class="tag">${esc(a.category_name)}</span>` : ''}
      <h3>${esc(a.title)}</h3>
    </div>
    <span class="textlink">${esc(words.readMore)}</span>
  </a>`;
}

/* ------------------------------------------------------------------ blocks */

/**
 * Line appearance as classes. Only the non-defaults are emitted, so the
 * common case stays a single class.
 */
const lineClasses = (p = {}) => cls(
  p.borderStyle && p.borderStyle !== 'solid' && `b-line--${p.borderStyle}`,
  p.borderWidth && p.borderWidth !== 'thin' && `b-line--w-${p.borderWidth}`,
  p.borderColor && p.borderColor !== 'soft' && `b-line--c-${p.borderColor}`);

/**
 * The colour one cell draws on: its row's, its column's, or the stripe.
 *
 * Row beats column because that is the browser's own order - CSS paints the
 * column layer of a table underneath the row layer - so the rule is the
 * platform's rather than one invented here. A stripe loses to both: it is the
 * ambient pattern, and an author who has coloured a row or a column meant it.
 *
 * Resolved to a single class per cell rather than left to the cascade. A
 * background on the `<tr>` and another on the `<td>` would be decided by
 * whichever rule this file happened to write last, and `<col>` cannot be used
 * at all - it paints a background but is no ancestor of the cells, so its ink
 * would never reach the text sitting on it.
 */
export function cellSurface(props = {}, r = 0, c = 0) {
  const row = (props.rowSurfaces || [])[r];
  if (row) return row;
  const col = (props.colSurfaces || [])[c];
  if (col) return col;
  if (!props.stripes) return '';
  // A header is not part of the alternation, and the first body row is the
  // plain one: a zebra that starts on the stripe reads as an off-by-one.
  const first = props.headerRow ? 1 : 0;
  return r >= first && (r - first) % 2 === 1 ? props.stripes : '';
}

/**
 * Tabular data. The wrapper is what lets a wide table scroll on a phone
 * instead of forcing the page sideways.
 */
function renderTable(props, ctx, s = '', align = '') {
  const rows = props.rows || 0;
  const cols = props.cols || 0;
  if (!rows || !cols) return '';
  const cells = props.cells || [];
  // A cell holds objects, so it renders exactly the way a column does.
  const cell = (r, c) => joinHtml((cells[r]?.[c] || []).map((obj) => renderObject(obj, ctx)));

  const row = (r, tag) => `<tr>${Array.from({ length: cols }, (_, c) => {
    const surface = cellSurface(props, r, c);
    return `<${tag}${surface ? ` class="b-surface--${esc(surface)}"` : ''}>${cell(r, c)}</${tag}>`;
  }).join('')}</tr>`;

  const head = props.headerRow ? `<thead>${row(0, 'th')}</thead>` : '';
  const first = props.headerRow ? 1 : 0;
  const body = `<tbody>${Array.from({ length: rows - first }, (_, i) =>
    row(i + first, 'td')).join('')}</tbody>`;

  const classes = cls('b-table', `b-table--${props.borders || 'all'}`,
    `b-table--pad-${props.cellPadding || 'medium'}`,
    props.surface && `b-surface--${props.surface}`, lineClasses(props));
  return `<div class="b-table-wrap${align}"${s}><table class="${classes}">${head}${body}</table></div>`;
}

/**
 * A slice: the only kind of page block there is. It owns the layout - column
 * count, split, gap, how wide it draws - and its objects own nothing but their
 * own content.
 */
export function renderBlock(block, ctx) {
  if (!block?.columns?.length) return '';
  const count = block.columns.length;

  /* Claimed before the columns render. Otherwise a heading inside the slice
     takes the name first and the section - the thing most links point at -
     ends up as the numbered duplicate of its own content. */
  const id = anchorAttr(block.props?.anchor, ctx);

  const cols = block.columns.map((col) => {
    const inner = joinHtml((col.objects || []).map((obj) => renderObject(obj, ctx)));
    /* A column with a surface or an outline is a card. `b-surface--*` is the
       same class a band uses, so a dark card gets its light ink for free; the
       line classes are the ones tables and dividers already share. */
    const isCard = !!col.surface || !!col.border;
    const classes = cls('b-slice__col',
      col.align && col.align !== 'left' && `b-align-${col.align}`,
      col.valign && col.valign !== 'top' && `b-valign-${col.valign}`,
      isCard && 'b-card',
      isCard && col.radius && col.radius !== 'medium' && `b-card--r-${col.radius}`,
      col.surface && `b-surface--${col.surface}`,
      col.border && 'b-card--bordered',
      col.border && lineClasses(col));
    return `<div class="${classes}"${styleAttr(col.style)}>${inner}</div>`;
  });

  return `<section class="${sliceBandClasses(block)}"${id}${styleAttr(block.style)}${
    block.name ? ` data-slice="${esc(block.name)}"` : ''
  }><div class="${sliceInnerClasses(block, count)}">${cols.join('')}</div></section>`;
}

/**
 * A slice is two elements, the way the design always was: a band that runs the
 * full width and carries the background, and an inner box that caps how wide
 * the content draws. One element cannot do both - a background that stops at
 * the text is a card, not a section.
 */
export function sliceBandClasses(block) {
  const { surface } = block.props || {};
  return cls('b-slice', surface && `b-surface--${surface}`);
}

/** The inner box: the container cap, plus every layout class as before. */
export function sliceInnerClasses(block, count = block.columns.length) {
  const { ratio, gap, width, container } = block.props || {};
  return cls('b-slice__inner', `b-slice__inner--${container || 'body'}`,
    `b-slice--cols-${count}`,
    ratio && ratio !== 'full' && `b-slice--${ratio}`,
    gap && gap !== 'medium' && `b-slice--gap-${gap}`,
    width && width !== 'full' && `b-slice--w-${width}`);
}

export const renderBlocks = (blocks, ctx) =>
  joinHtml((blocks || []).map((block) => renderBlock(block, ctx)));

export { mediaFigure, styleAttr };
