const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape for HTML text and double-quoted attribute contexts. */
export const esc = (value) =>
  value == null ? '' : String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Escape for inside a <script> JSON island. */
export const escJson = (value) =>
  JSON.stringify(value ?? null).replace(/</g, '\\u003c').replace(/-->/g, '--\\>');

/** Join a list of rendered fragments, dropping empties. */
export const joinHtml = (parts) => parts.filter(Boolean).join('');

/** Conditional class list: cls('btn', isPrimary && 'btn-primary'). */
export const cls = (...parts) => parts.filter(Boolean).join(' ');

/** `attrs({href:'/x', disabled:true, title:null})` -> ` href="/x" disabled`. */
export function attrs(map) {
  let out = '';
  for (const [key, value] of Object.entries(map)) {
    if (value == null || value === false) continue;
    out += value === true ? ` ${key}` : ` ${key}="${esc(value)}"`;
  }
  return out;
}

/* ------------------------------------------------------------- sanitising */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
  'h2', 'h3', 'h4', 'a', 'blockquote', 'span', 'div',
]);
const ALLOWED_ATTRS = {
  a: new Set(['href', 'title', 'target', 'rel']),
  span: new Set(['class']),
  div: new Set(['class']),
  p: new Set(['class']),
  h2: new Set(['class']),
  h3: new Set(['class']),
  h4: new Set(['class']),
  li: new Set(['class']),
  ul: new Set(['class']),
  ol: new Set(['class']),
  blockquote: new Set(['class']),
};
/* Only alignment helpers may come in from the editor. A picture is an Image
   object on the canvas, never markup in a text object - so rich text has no
   business carrying an <img> at all. */
const ALLOWED_CLASSES = new Set(['align-left', 'align-center', 'align-right']);
const VOID_TAGS = new Set(['br']);

export function safeHref(value) {
  const trimmed = String(value || '').trim();
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (/^[/#]/.test(trimmed)) return trimmed;          // internal link or anchor
  return null;                                         // blocks javascript:, data:
}

/**
 * Allowlist sanitiser for rich-text coming from the CMS editor. Unknown tags
 * are unwrapped (their text survives), and every attribute must be listed.
 */
export function sanitizeHtml(input) {
  if (!input) return '';
  const source = String(input);
  let out = '';
  const open = [];
  // Matches real tags, comments and script/style blocks (contents and all).
  // A lone '<' in prose is left alone and escaped as text further down.
  const tagRe = /<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)\s*>|<(?:script|style)\b[^>]*>[\s\S]*$|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*(?:"[^"]*"|'[^']*')?)*?)\s*\/?>/g;
  let last = 0;
  let m;

  while ((m = tagRe.exec(source)) !== null) {
    out += escapeText(source.slice(last, m.index));
    last = tagRe.lastIndex;

    const tagName = m[1] && m[1].toLowerCase();
    if (!tagName || !ALLOWED_TAGS.has(tagName)) continue;   // drop comments/unknown
    const closing = m[0].startsWith('</');

    if (closing) {
      const idx = open.lastIndexOf(tagName);
      if (idx < 0) continue;
      while (open.length > idx) out += `</${open.pop()}>`;
      continue;
    }

    let rendered = `<${tagName}`;
    const allowed = ALLOWED_ATTRS[tagName];
    if (allowed) {
      const attrRe = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
      let a;
      while ((a = attrRe.exec(m[2] || '')) !== null) {
        const key = a[1].toLowerCase();
        if (!allowed.has(key)) continue;
        let value = a[2] ?? a[3] ?? a[4] ?? '';
        if (key === 'href') {
          const href = safeHref(value);
          if (!href) continue;
          value = href;
        } else if (key === 'class') {
          value = value.split(/\s+/).filter((c) => ALLOWED_CLASSES.has(c)).join(' ');
          if (!value) continue;
        } else if (key === 'target') {
          if (value !== '_blank') continue;
        }
        rendered += ` ${key}="${esc(value)}"`;
      }
      if (tagName === 'a' && /target="_blank"/.test(rendered) && !/rel=/.test(rendered)) {
        rendered += ' rel="noopener noreferrer"';
      }
    }

    if (VOID_TAGS.has(tagName)) {
      out += rendered + '>';
    } else {
      out += rendered + '>';
      open.push(tagName);
    }
  }
  out += escapeText(source.slice(last));
  while (open.length) out += `</${open.pop()}>`;
  return out;
}

// Text nodes: keep existing entities, escape stray angle brackets and ampersands.
const escapeText = (text) =>
  text.replace(/&(?!#?[a-zA-Z0-9]{1,8};)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Plain text preview of rich HTML, for lists and meta descriptions. */
export function stripTags(input, limit = 0) {
  const text = String(input || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!limit || text.length <= limit) return text;
  return text.slice(0, text.lastIndexOf(' ', limit) > 0 ? text.lastIndexOf(' ', limit) : limit) + '…';
}
