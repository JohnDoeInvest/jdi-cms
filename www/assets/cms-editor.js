/* ===================================================================
   Slice CMS — page editor canvas.

   The canvas renders content the way the site will render it, using the
   same blocks.css rules, and edits it in place. Anything that is not the
   content itself — links, alignment, alt text, form settings — lives in
   the properties tab so the canvas stays honest and uncluttered.

   State is a JSON block list. The DOM is rendered from it and never read
   back except through the explicit edit handlers below.
   =================================================================== */
(function () {
  'use strict';

  var CMS = window.CMS;
  if (!CMS) return;
  var DATA = CMS.data || {};
  var canvas = document.querySelector('[data-canvas]');
  if (!canvas) return;

  var esc = CMS.escapeHtml;
  var blocks = Array.isArray(DATA.blocks) ? DATA.blocks : [];
  var mediaMap = DATA.media || {};
  var selectedId = null;
  var dirty = false;

  /* ------------------------------------------------------------ registry */

  var OBJECTS = {
    heading:  { label: 'Heading', content: 'text' },
    text:     { label: 'Text', content: 'html' },
    image:    { label: 'Image', content: 'media' },
    button:   { label: 'Button', content: 'label' },
    link:     { label: 'Link', content: 'label' },
    quote:    { label: 'Quote', content: 'text' },
    table: { label: 'Table' },
    divider:  { label: 'Divider' },
    spacer:   { label: 'Spacer' },
    form:     { label: 'Form' },
    articles: { label: 'Article feed' },
    breadcrumbs: { label: 'Breadcrumbs' },
    code:     { label: 'Code', content: 'code' },
    embed:    { label: 'Embed' },
    fieldText:     { label: 'Text input', content: 'label', formField: true },
    fieldEmail:    { label: 'Email field', content: 'label', formField: true },
    fieldPhone:    { label: 'Phone number', content: 'label', formField: true },
    fieldTextarea: { label: 'Textarea', content: 'label', formField: true },
    fieldSelect:   { label: 'Select', content: 'label', formField: true },
    fieldRadio:    { label: 'Radio buttons', content: 'label', formField: true },
    fieldCheckbox: { label: 'Checkbox', content: 'label', formField: true },
  };

  /* Named sizes and splits, mirroring the sets objects.js will accept. Labels
     carry the measurement so the choice is not a guess; the value never does. */
  var IMAGE_SIZES = [['small', 'Small (180px)'], ['medium', 'Medium (320px)'],
    ['large', 'Large (520px)'], ['full', 'Full width']];
  /* Splits per column count, mirroring COLUMN_RATIOS in src/lib/objects.js. */
  var RATIOS = {
    1: [['full', 'Single column']],
    2: [['50-50', 'Equal'], ['67-33', 'Wider left'], ['33-67', 'Wider right'],
      ['75-25', 'Much wider left'], ['25-75', 'Much wider right']],
    3: [['equal', 'Equal'], ['wide-left', 'Wider left'],
      ['wide-center', 'Wider centre'], ['wide-right', 'Wider right']],
    4: [['equal', 'Equal']],
  };
  var DEFAULT_RATIO = { 1: 'full', 2: '50-50', 3: 'equal', 4: 'equal' };
  var COLUMN_COUNTS = [['1', 'One'], ['2', 'Two'], ['3', 'Three'], ['4', 'Four']];
  var GAPS = [['none', 'None'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];
  var WIDTHS = [['full', 'Full width'], ['three-quarters', 'Three quarters'],
    ['half', 'Half'], ['measure', 'Reading measure']];
  var CONTAINERS = [['narrow', 'Narrow'], ['body', 'Body'], ['wide', 'Wide'],
    ['full', 'Edge to edge']];
  var HEADING_LEVELS = [['h1', 'H1 — page title'], ['h2', 'H2'], ['h3', 'H3'], ['h4', 'H4']];
  var HEADING_SIZES = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'],
    ['xlarge', 'Extra large'], ['display', 'Display']];
  var BUTTON_SIZES = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];

  /* The country prefixes a phone field offers, handed over rather than
     restated: the list, its order and the flag are decided once in
     src/lib/phone.js, and a second copy here is a second thing to keep
     current. Empty on every screen but the form editor, which is the only
     place a phone field can be made. */
  var COUNTRY_OPTIONS = (CMS.data.countries || []).map(function (c) {
    return [c.value, c.label];
  });

  function countryLabel(iso) {
    for (var i = 0; i < COUNTRY_OPTIONS.length; i++) {
      if (COUNTRY_OPTIONS[i][0] === iso) return COUNTRY_OPTIONS[i][1];
    }
    return COUNTRY_OPTIONS.length ? COUNTRY_OPTIONS[0][1] : '';
  }

  /* The palette, as the panel offers it. Ids are what a page stores; the hex
     values are only ever used to draw a preview of the choice. */
  var COLORS = (CMS.data.colors || []);
  /* The forms this site has, handed over with everything else so the canvas
     can name one and the panel can offer the list without a round trip.
     Empty on a screen with no business placing one. */
  var FORMS = (CMS.data.forms || []);
  /* A flat canvas is a set, not a document. The single slice holding
     everything is plumbing the author has no business seeing, so it draws no
     chrome, cannot be selected, and Slice is not in the palette. A form is
     the only thing that wants this: it is a list of questions, and a
     background, a padding and a container width are a level of layout it has
     no business owning - which is what made every placed form a full-width
     band of its own. */
  var FLAT = !!CMS.data.flat;
  var colorById = {};
  COLORS.forEach(function (c) { colorById[c.id] = c; });

  /* The page's own trail, and the embed providers the server can frame. Both
     come from the server so the lists are stated once, not mirrored here. */
  var TRAIL = CMS.data.trail || [];
  var EMBED_PROVIDERS = CMS.data.embedProviders || [];
  var EMBED_HINT = 'A link from ' + EMBED_PROVIDERS.map(function (p) { return p.name; }).join(', ')
    + '. Anything else is shown as a plain link.';

  /** Which provider a URL belongs to, for labelling the card on the canvas. */
  function providerForUrl(url) {
    var host;
    try { host = new URL(String(url || '')).hostname.toLowerCase(); } catch (e) { return null; }
    for (var i = 0; i < EMBED_PROVIDERS.length; i++) {
      if (EMBED_PROVIDERS[i].hosts.indexOf(host) >= 0) return EMBED_PROVIDERS[i];
    }
    return null;
  }

  /** The trail, in the markup site and canvas share. */
  function trailHtml() {
    var out = '<nav class="breadcrumbs" aria-label="Brödsmulor"><a href="#">' + homeIcon() + '</a>';
    TRAIL.forEach(function (crumb, i) {
      out += '<span class="breadcrumbs__sep">' + chevronIcon() + '</span>'
        + (i === TRAIL.length - 1
          ? '<span>' + esc(crumb.label) + '</span>'
          : '<a href="#">' + esc(crumb.label) + '</a>');
    });
    return out + '</nav>';
  }

  /* Whether this page's template lets a band reach the window edge. Only the
     canvas cares: it should not draw an edge-to-edge band on a page whose
     frame will cap it, which would be the editor lying about the result. */
  var FREE_FRAME = CMS.data.frame === 'blank';

  /* Mirrors PAGE_TYPE_HINT in routes/cms/pages.js, so changing the type in the
     editor updates the explanation without a round trip. */
  var PAGE_TYPE_HINT = {
    default: 'Page title, breadcrumbs and the body column\u2019s width.',
    landing: 'No page title. Still capped to the body column.',
    blank: 'No title and no cap. Slices run edge to edge and set their own width.',
  };
  var VALIGN = [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']];
  var LINE_STYLES = [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']];
  var LINE_WIDTHS = [['thin', 'Thin'], ['medium', 'Medium'], ['thick', 'Thick']];
  var LINE_COLORS = [['soft', 'Soft'], ['medium', 'Medium'], ['strong', 'Strong'],
    ['accent', 'Accent']];

  /**
   * What this screen may hold, which is exactly what its palette offers.
   *
   * There used to be a rule per place - "form fields belong inside a form" in
   * four of them - from when a field could only live inside a Form container.
   * A form is its own screen now and fields are its whole palette, so the
   * question is no longer "is this a field" but "does this editor offer it",
   * and the server refuses the same list on save.
   */
  var ALLOWED_KINDS = (CMS.data.objectKinds || []).slice();
  function accepts(kind) {
    if (kind === 'slice') return !FLAT;
    if (ALLOWED_KINDS.indexOf(kind) >= 0) return true;
    CMS.toast(objectLabel({ kind: kind }) + ' does not belong here.', 'error');
    return false;
  }

  /** A column has no id of its own; this addresses one within its slice. */
  function columnKey(blockId, index) { return blockId + '#' + index; }

  function uid() {
    return Math.random().toString(16).slice(2, 8) + Math.random().toString(16).slice(2, 8);
  }

  function blankObject(kind) {
    var o = { id: uid(), kind: kind, props: {}, style: { margin: {}, padding: {} } };
    switch (kind) {
      case 'heading':  o.props = { text: '', level: 'h2', headingSize: 'large', align: 'left', ink: '', anchor: '' }; break;
      case 'text':     o.props = { html: '', align: 'left', ink: '' }; break;
      case 'image':    o.props = { media: null, caption: '', href: '', alt: '', align: 'left' }; break;
      case 'button':   o.props = { label: 'Button', href: '', colour: '', outline: true, buttonSize: 'medium', align: 'left' }; break;
      case 'link':     o.props = { label: 'Link', href: '', align: 'left' }; break;
      case 'quote':    o.props = { text: '', source: '', align: 'left', ink: '' }; break;
      case 'spacer':   o.props = { height: 32 }; break;
      case 'breadcrumbs': o.props = { align: 'left' }; break;
      case 'code':     o.props = { code: '', language: '', filename: '' }; break;
      case 'embed':    o.props = { url: '', caption: '' }; break;
      case 'divider':  o.props = { borderStyle: 'solid' }; break;
      case 'table':
        o.props = {
          rows: 3, cols: 3, headerRow: false, borders: 'all', cellPadding: 'medium',
          borderStyle: 'solid', borderWidth: 'thin', borderColor: 'soft',
          cells: [0, 1, 2].map(function () { return [[], [], []]; }),
        };
        break;
      case 'articles':
        o.props = { categories: [], limit: 3, layout: 'grid', order: 'newest', more: 'none', filter: false };
        break;
      case 'form':     o.props = { formId: null }; break;
      /* A field's name starts empty on purpose: empty means "follow the
         label", and a new field that arrived with its name already set would
         keep posting under `name` after the label became "Företag". The
         defaults below are only labels, which is content the author edits. */
      case 'fieldText':
      case 'fieldEmail':
        o.props = { label: kind === 'fieldEmail' ? 'Email' : 'Name',
          name: '', placeholder: '', required: true, width: 'full' };
        break;
      case 'fieldPhone':
        o.props = { label: 'Phone', name: '', placeholder: '', required: false,
          width: 'full', prefix: CMS.data.country || '' };
        break;
      case 'fieldTextarea':
        o.props = { label: 'Message', name: '', placeholder: '', required: true, rows: 6 };
        break;
      case 'fieldSelect':
        o.props = { label: 'Choose', name: '', options: 'Option one\nOption two', required: false, width: 'full' };
        break;
      case 'fieldRadio':
        o.props = { label: 'Choose', name: '', options: 'Option one\nOption two', required: false };
        break;
      case 'fieldCheckbox':
        o.props = { label: 'I agree', name: '', required: false };
        break;
    }
    if (OBJECTS[kind] && OBJECTS[kind].columns) {
      o.columns = [];
      for (var i = 0; i < OBJECTS[kind].columns; i++) o.columns.push([]);
    }
    return o;
  }

  /* --------------------------------------------------------- state utils */

  /**
   * Every change schedules a save of the *draft*.
   *
   * Safe to do on every keystroke because the draft is not what the public
   * sees: publishing is a separate, deliberate act. The debounce is about
   * request count, not about safety.
   */
  var saveTimer = null;
  var AUTOSAVE_MS = 1500;

  function markDirty() {
    dirty = true;
    setState('Unsaved changes', 'busy');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { save(null); }, AUTOSAVE_MS);
  }

  /**
   * The saved indicator. `kind` colours it: busy while a request is in
   * flight, error when one failed, and otherwise green - which is the whole
   * point of it, since nothing said whether anything had been saved at all.
   */
  function setState(text, kind) {
    document.querySelectorAll('[data-save-state]').forEach(function (el) {
      el.textContent = text;
      el.classList.toggle('is-busy', kind === 'busy');
      el.classList.toggle('is-error', kind === 'error');
    });
  }

  /** "Saved 14:32" - the thing that was missing, since nothing said so. */
  function setSaved(stamp) {
    var when = stamp ? new Date(stamp.replace(' ', 'T') + 'Z') : new Date();
    setState('Saved ' + (isNaN(when) ? new Date() : when)
      .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  }

  /**
   * Requests are numbered so an answer that arrives late cannot put back a
   * state a newer one has already replaced - an autosave overtaken by a
   * Publish would otherwise redraw the bar as it was before publishing.
   */
  var requestSeq = 0;
  var appliedSeq = 0;
  function isCurrent(seq) {
    if (seq < appliedSeq) return false;
    appliedSeq = seq;
    return true;
  }

  /**
   * Redraw where the document stands from what the server said: the status
   * pill in the head, the action bar, and whether the address can move.
   *
   * The server renders all of it, so the rules for which buttons belong
   * where - and there are five states now - exist once. Each part is only
   * replaced when it differs, so an autosave that changed nothing does not
   * pull a button out from under a pointer.
   */
  function applyState(res) {
    if (!res) return;
    DATA.status = res.status;
    DATA.scheduledAt = res.scheduledAt || null;
    // The address is composed on the server from the parent and the slug,
    // so what it comes back as is the only place that knows it.
    if (res.permalink) DATA.permalink = res.permalink;
    // Addressed by its own hook: the head holds two pills.
    swapHtml(document.querySelector('[data-status-pill]'), res.pill);
    swapHtml(document.querySelector('.cms-actions'), res.actions);
    if (res.address) setAddressState(res.address);
    watchSchedule(DATA.scheduledAt);
  }

  function swapHtml(host, markup) {
    if (!host || typeof markup !== 'string') return;
    // Parsed first, so the comparison is between two serialisations of the
    // same markup rather than a template string and the live DOM.
    var probe = document.createElement('template');
    probe.innerHTML = markup;
    if (probe.innerHTML !== host.innerHTML) host.innerHTML = markup;
  }

  /**
   * An editor left open when its schedule comes due goes and looks, so it
   * does not go on offering to schedule something that is already live. The
   * server's clock ticks just after the minute; this asks a few seconds
   * later, and every half minute after that while the schedule is still
   * there. A timer cannot wait more than about 24 days, so a longer wait is
   * taken in stages.
   */
  var scheduleTimer = null;
  function watchSchedule(at) {
    clearTimeout(scheduleTimer);
    var due = at ? new Date(at.replace(' ', 'T') + 'Z').getTime() : NaN;
    if (isNaN(due)) return;
    var wait = due - Date.now();
    wait = wait > 0 ? wait + 4000 : 30000;
    scheduleTimer = setTimeout(function () {
      if (Date.now() < due) return watchSchedule(at);
      var seq = ++requestSeq;
      CMS.getJson(DATA.saveUrl).then(function (res) {
        if (!isCurrent(seq)) return;
        var wentOut = !res.scheduledAt && res.status === 'published';
        applyState(res);
        if (wentOut) CMS.toast('The scheduled version is live now.');
      }).catch(function () { /* offline or signed out: the next save will tell */ });
    }, Math.min(wait, 2000000000));
  }

  /** Find an object anywhere in the tree, with the array that holds it. */
  /**
   * Find whatever an id addresses: a slice, one of its columns, an object in a
   * column, or a field inside a form's slot. Slice -> column -> object is the
   * whole hierarchy, so this is the whole search.
   */
  function locate(id) {
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      if (block.id === id) return { block: block, obj: block, list: blocks, index: i, isBlock: true };
      for (var c = 0; c < block.columns.length; c++) {
        var col = block.columns[c];
        if (columnKey(block.id, c) === id) {
          return { block: block, column: col, columnIndex: c, isColumn: true };
        }
        for (var j = 0; j < col.objects.length; j++) {
          var obj = col.objects[j];
          if (obj.id === id) {
            return { obj: obj, list: col.objects, index: j, block: block, columnIndex: c };
          }
          // A form groups its fields in a slot of its own.
          for (var k = 0; k < (obj.columns || []).length; k++) {
            var slot = obj.columns[k];
            for (var n = 0; n < slot.length; n++) {
              if (slot[n].id === id) {
                return { obj: slot[n], list: slot, index: n, owner: obj, block: block };
              }
            }
          }
          // A table's cells hold objects, and each cell is their list.
          var grid = (obj.props && obj.props.cells) || [];
          for (var gr = 0; gr < grid.length; gr++) {
            for (var gc = 0; gc < (grid[gr] || []).length; gc++) {
              var cell = grid[gr][gc];
              if (!Array.isArray(cell)) continue;
              for (var ci = 0; ci < cell.length; ci++) {
                if (cell[ci].id === id) {
                  return { obj: cell[ci], list: cell, index: ci, owner: obj, block: block };
                }
              }
            }
          }
        }
      }
    }
    return null;
  }

  /** The array an id lives in, plus its index. Blocks and objects alike. */
  function siblings(id) {
    var found = locate(id);
    if (!found || found.isColumn || !found.list) return null;
    var idx = found.list.indexOf(found.obj);
    return idx < 0 ? null : { list: found.list, index: idx, isBlock: !!found.isBlock };
  }

  function moveBy(id, delta) {
    var found = siblings(id);
    if (!found) return;
    var to = found.index + delta;
    if (to < 0 || to >= found.list.length) return;
    found.list.splice(to, 0, found.list.splice(found.index, 1)[0]);
    selectedId = id;
    markDirty();
    render();
  }

  /**
   * Copy a slice's columns. Only the objects are rebuilt, because only they
   * need new ids; everything else about a column is carried whole.
   *
   * It used to list the four props it knew about, which is why a duplicated
   * slice came back stripped of its cards: `surface`, `border`, `radius` and
   * the three line props arrived after this was written and nothing here ever
   * asked for them. A copy that names what it keeps silently loses whatever
   * is added next - so this one names only what it has to change.
   */
  function copyColumns(columns) {
    return (columns || []).map(function (col) {
      // A bare array is a column carrying nothing but its objects, the same
      // shape normalizeColumn accepts on the way in.
      var source = Array.isArray(col) ? { objects: col } : (col || {});
      var copy = JSON.parse(JSON.stringify(source));
      copy.style = copy.style || { padding: {} };
      copy.objects = reId(source.objects);
      return copy;
    });
  }

  /** A page block built from a saved slice, ready to drop in. */
  function sliceBlockFrom(slice) {
    var def = slice.definition || {};
    return {
      type: 'slice', id: uid(), sliceId: slice.id, name: slice.name,
      props: JSON.parse(JSON.stringify(def.props || { ratio: 'full', gap: 'medium', width: 'full' })),
      style: JSON.parse(JSON.stringify(def.style || { margin: {}, padding: {} })),
      columns: copyColumns(def.columns && def.columns.length ? def.columns : [{ objects: [] }]),
    };
  }

  function duplicate(id) {
    var found = siblings(id);
    if (!found) return;
    var source = found.list[found.index];
    var copy;
    if (found.isBlock) {
      copy = {
        type: 'slice', id: uid(), sliceId: source.sliceId, name: source.name,
        props: JSON.parse(JSON.stringify(source.props || {})),
        style: JSON.parse(JSON.stringify(source.style || {})),
        columns: copyColumns(source.columns),
      };
    } else {
      copy = reId([source])[0];
    }
    found.list.splice(found.index + 1, 0, copy);
    selectedId = copy.id;
    markDirty();
    render();
  }

  /**
   * Hide a slice, or show it again. An edit like any other: it lands in the
   * draft, and the site follows when the page is published - so taking one
   * version down and putting another up is a single publish, and visitors
   * never see both or neither.
   */
  function toggleHidden(id) {
    var block = blocks.filter(function (b) { return b.id === id; })[0];
    if (!block) return;
    block.props = block.props || {};
    block.props.hidden = !block.props.hidden;
    markDirty();
    render();
  }

  function removeById(id) {
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].id === id) { blocks.splice(i, 1); return true; }
    }
    var found = locate(id);
    if (!found) return false;
    var idx = found.list.indexOf(found.obj);
    if (idx < 0) return false;
    found.list.splice(idx, 1);
    return true;
  }

  function reId(list) {
    return (list || []).map(function (obj) {
      var copy = JSON.parse(JSON.stringify(obj));
      copy.id = uid();
      if (copy.columns) copy.columns = copy.columns.map(reId);
      // A table's cells hold objects too, and two copies of one table must
      // not share their ids.
      if (copy.props && Array.isArray(copy.props.cells)) {
        copy.props.cells = copy.props.cells.map(function (row) {
          return row.map(function (cell) { return reId(cell); });
        });
      }
      return copy;
    });
  }

  /* ------------------------------------------------------------ rendering */

  /** Only the non-default line classes, matching src/views/render.js. */
  function lineClasses(p) {
    return (p.borderStyle && p.borderStyle !== 'solid' ? ' b-line--' + p.borderStyle : '')
      + (p.borderWidth && p.borderWidth !== 'thin' ? ' b-line--w-' + p.borderWidth : '')
      + (p.borderColor && p.borderColor !== 'soft' ? ' b-line--c-' + p.borderColor : '');
  }

  function alignClass(align) { return align && align !== 'left' ? ' b-align-' + align : ''; }

  /**
   * The colour one table cell draws on. Mirrors cellSurface() in
   * src/views/render.js exactly - a row beats a column, both beat the stripe -
   * because the canvas showing a different winner than the site would be the
   * one thing a WYSIWYG canvas must never do.
   */
  function cellSurface(p, r, c) {
    var row = (p.rowSurfaces || [])[r];
    if (row) return row;
    var col = (p.colSurfaces || [])[c];
    if (col) return col;
    if (!p.stripes) return '';
    var first = p.headerRow ? 1 : 0;
    return r >= first && (r - first) % 2 === 1 ? p.stripes : '';
  }

  /* An explicit text colour, as the site emits it. Empty means the object
     inherits from the surface it sits on. */
  function inkClass(p) { return p && p.ink ? ' b-ink--' + p.ink : ''; }

  /** Text size as a class, matching the site: `body` is the default and bare. */
  function textSizeClass(p) {
    return p && p.textSize && p.textSize !== 'body' ? ' b-text--' + p.textSize : '';
  }
  var TEXT_SIZES = [['small', 'Small'], ['body', 'Body'], ['large', 'Large'],
    ['xlarge', 'Very large']];

  function styleAttr(style) {
    var bits = [];
    ['margin', 'padding'].forEach(function (group) {
      var set = (style && style[group]) || {};
      Object.keys(set).forEach(function (side) { bits.push(group + '-' + side + ':' + set[side] + 'px'); });
    });
    return bits.length ? ' style="' + bits.join(';') + '"' : '';
  }

  /** Editable text node: plain text for simple props, rich HTML for text. */
  function editable(id, prop, value, className, tag, placeholder) {
    return '<' + (tag || 'div') + ' class="' + className + ' is-editable"'
      + ' contenteditable="true" spellcheck="false"'
      + ' data-edit-text="' + esc(id) + '|' + esc(prop) + '"'
      + ' data-placeholder="' + esc(placeholder || '') + '">' + esc(value || '') + '</' + (tag || 'div') + '>';
  }

  function editableHtml(id, prop, html, className, placeholder) {
    return '<div class="' + className + ' is-editable" contenteditable="true"'
      + ' data-obj-rich="' + esc(id) + '" data-edit-html="' + esc(id) + '|' + esc(prop) + '"'
      + ' data-placeholder="' + esc(placeholder || '') + '">' + (html || '') + '</div>';
  }

  /** Content rendered exactly as the site renders it, but editable. */
  function contentHtml(obj) {
    var p = obj.props || {};
    var id = obj.id;
    var align = alignClass(p.align);

    switch (obj.kind) {
      case 'heading': {
        var tag = p.level || 'h2';
        return editable(id, 'text', p.text,
          'b-heading b-heading--' + (p.headingSize || 'large') + align + inkClass(p), tag, 'Heading');
      }

      case 'text':
        return editableHtml(id, 'html', p.html,
          'b-text' + textSizeClass(p) + align + inkClass(p), 'Write something…');

      case 'image':
        return imageHtml(obj);

      case 'table': {
        var rows = p.rows || 3, cols = p.cols || 3, cells = p.cells || [];
        var cell = function (r, c, tag) {
          var content = (cells[r] || [])[c] || [];
          var surface = cellSurface(p, r, c);
          return '<' + tag + ' class="table-cell'
            + (surface ? ' b-surface--' + esc(surface) : '')
            + '" data-cell="' + esc(id) + '|' + r + '|' + c + '">'
            + (content.length
              ? content.map(function (o) { return objectHtml(o, 2); }).join('')
              : '<div class="table-cell__empty">Drop or type</div>')
            + '</' + tag + '>';
        };
        var row = function (r, tag) {
          var out = '';
          for (var c = 0; c < cols; c++) out += cell(r, c, tag);
          return '<tr>' + out + '</tr>';
        };
        var head = p.headerRow ? '<thead>' + row(0, 'th') + '</thead>' : '';
        var body = '';
        for (var r = p.headerRow ? 1 : 0; r < rows; r++) body += row(r, 'td');
        return '<div class="b-table-wrap' + align + '">'
          + '<table class="b-table b-table--' + esc(p.borders || 'all')
          + ' b-table--pad-' + esc(p.cellPadding || 'medium')
          + (p.surface ? ' b-surface--' + esc(p.surface) : '') + lineClasses(p) + '">'
          + head + '<tbody>' + body + '</tbody></table></div>';
      }

      case 'button':
        return '<div class="b-button' + align + '">'
          + editable(id, 'label', p.label, 'b-button__el'
            + (p.colour ? ' b-button__el--c-' + p.colour : '')
            + (p.outline ? ' b-button__el--outline' : '')
            + (p.buttonSize && p.buttonSize !== 'medium' ? ' b-button__el--' + p.buttonSize : ''),
            'span', 'Button')
          + '</div>';

      case 'link':
        return '<div class="b-link' + align + '">'
          + editable(id, 'label', p.label, 'b-link__el', 'span', 'Link text') + '</div>';

      case 'quote':
        return '<blockquote class="b-quote' + align + inkClass(p) + '">'
          + editable(id, 'text', p.text, 'b-quote__text', 'span', 'Quote')
          + (p.source ? '<cite>' + esc(p.source) + '</cite>' : '') + '</blockquote>';

      case 'code': {
        var label = p.filename || p.language;
        return '<div class="b-code' + align + '">'
          + (label ? '<div class="b-code__label">' + esc(label) + '</div>' : '')
          + '<pre class="b-code__pre">'
          + editable(id, 'code', p.code, 'b-code__edit', 'code', 'Paste code here…')
          + '</pre></div>';
      }

      /* A card, not the real frame. Loading third-party iframes into the
         canvas would let them take clicks meant for the editor, and would
         make opening a page depend on somebody else's server. */
      case 'embed': {
        var known = providerForUrl(p.url);
        return '<div class="editor-embed' + align + '">'
          + '<div class="editor-embed__mark">' + embedIcon() + '</div>'
          + '<div class="grow" style="min-width:0">'
          + '<div class="strong small">' + esc(known ? known.name : (p.url ? 'Not a recognised embed' : 'Embed')) + '</div>'
          + '<div class="tiny muted truncate">' + esc(p.url || 'Paste a link in the panel') + '</div>'
          + '</div></div>';
      }

      /* The real trail for this page, so what the canvas shows is what the
         page will draw - and nothing at all on the landing page, same as
         there. */
      case 'breadcrumbs':
        return '<div class="b-breadcrumbs' + align + '">'
          + (TRAIL.length ? trailHtml() : '<span class="tiny muted">No trail — this is the top-level page.</span>')
          + '</div>';

      case 'divider':
        return '<hr class="b-divider' + lineClasses(p) + '">';

      case 'spacer':
        return '<div class="b-spacer editor-spacer" style="height:' + (Number(p.height) || 32) + 'px">'
          + '<span>' + (Number(p.height) || 32) + 'px</span></div>';

      case 'columns2':
      case 'columns3': {
        var count = OBJECTS[obj.kind].columns;
        var ratio = (obj.props && obj.props.ratio) ? ' b-columns--' + obj.props.ratio : '';
        return '<div class="b-columns b-columns--' + count + ratio + '">'
          + obj.columns.map(function (col, index) {
            return '<div class="b-column obj__col" data-column="' + index + '" data-owner="' + esc(id) + '">'
              + '<span class="chrome-tag">Column ' + (index + 1) + '</span>'
              + (col.length ? col.map(function (child) { return objectHtml(child, 2); }).join('')
                : '<div class="obj__col-empty">Drop a block here</div>')
              + '</div>';
          }).join('') + '</div>';
      }

      case 'form':
        return formHtml(obj);

      case 'articles':
        return articlesHtml(obj);

      default:
        return OBJECTS[obj.kind] && OBJECTS[obj.kind].formField ? fieldHtml(obj) : '';
    }
  }

  function imageHtml(obj) {
    var p = obj.props || {};
    var item = mediaMap[p.media];
    var align = alignClass(p.align);
    var inner;
    if (!item) {
      inner = '<div class="editor-image-empty"></div>';
    } else if (item.kind === 'video') {
      inner = '<video src="' + esc(item.url) + '" muted></video>';
    } else if (item.kind === 'image') {
      inner = '<img src="' + esc(item.url) + '"'
        + (item.srcset ? ' srcset="' + esc(item.srcset) + '" sizes="(max-width: 1048px) 100vw, 1000px"' : '')
        + ' alt="' + esc(p.alt || item.alt || '') + '">';
    } else {
      inner = '<div class="editor-image-empty"><span>' + esc(item.name) + '</span></div>';
    }
    /* The frame is a plain box so that clicking it selects the block like any
       other object; the centred control is what opens the library. It sits in
       the middle in both states, so an empty and a filled frame read the same.
       While empty the frame carries the control's attribute too, so a click
       anywhere on the placeholder starts the same job. */
    var sizeCls = (p.size && p.size !== 'full') ? ' b-image--' + p.size : '';
    // The same rule the site's renderer follows: large is the default and has no class.
    var cornerCls = (p.radius && p.radius !== 'large') ? ' b-image--r-' + p.radius : '';
    var verb = item ? 'Change image' : 'Add image';
    var openAttr = ' data-edit-media="' + esc(obj.id) + '"';
    return '<figure class="b-image' + sizeCls + cornerCls + align + '">'
      + '<div class="b-image__frame editor-image' + (item ? '' : ' editor-image--empty') + '"'
        + (item ? '' : openAttr) + '>'
        + inner
        + '<button type="button" class="editor-image__pick"' + openAttr
          + ' title="' + verb + '" aria-label="' + verb + '">' + imageIcon() + '</button>'
      + '</div>'
      + (p.caption ? '<figcaption>' + esc(p.caption) + '</figcaption>' : '')
      + '</figure>';
  }

  function fieldHtml(obj) {
    var p = obj.props || {};
    var star = p.required ? ' <span class="b-field__req">*</span>' : '';
    var label = '<label>' + editable(obj.id, 'label', p.label, 'editor-field-label', 'span', 'Label')
      + star + '</label>';
    var half = p.width === 'half' ? ' b-field--half' : '';
    var control;
    switch (obj.kind) {
      case 'fieldTextarea':
        control = '<textarea rows="' + (Number(p.rows) || 6) + '" placeholder="'
          + esc(p.placeholder || '') + '" disabled></textarea>';
        break;
      case 'fieldSelect': {
        var first = String(p.options || '').split('\n')[0] || '';
        control = '<select disabled><option>' + esc(p.placeholder || first || '—') + '</option></select>';
        break;
      }
      case 'fieldRadio': {
        var choices = String(p.options || '').split('\n')
          .map(function (o) { return o.trim(); }).filter(Boolean);
        return '<fieldset class="b-field b-field--group' + half + '">'
          + '<legend>' + editable(obj.id, 'label', p.label, 'editor-field-label', 'span', 'Label')
          + star + '</legend>'
          + (choices.length
            ? choices.map(function (o) {
              return '<span class="b-checkbox"><input type="radio" disabled>'
                + '<span>' + esc(o) + '</span></span>';
            }).join('')
            : '<span class="tiny muted">Add options in the panel.</span>')
          + '</fieldset>';
      }

      case 'fieldCheckbox':
        return '<div class="b-field' + half + '"><span class="b-checkbox">'
          + '<input type="checkbox" disabled>'
          + editable(obj.id, 'label', p.label, 'editor-field-label', 'span', 'Label') + star + '</span></div>';
      case 'fieldEmail':
        control = '<input type="email" placeholder="' + esc(p.placeholder || '') + '" disabled>';
        break;
      case 'fieldPhone':
        control = '<div class="b-phone">'
          + '<select class="b-phone__code" disabled><option>' + esc(countryLabel(p.prefix)) + '</option></select>'
          + '<input class="b-phone__number" type="tel" placeholder="'
          + esc(p.placeholder || '') + '" disabled></div>';
        break;
      default:
        control = '<input type="text" placeholder="' + esc(p.placeholder || '') + '" disabled>';
    }
    return '<div class="b-field' + half + '">' + label + control + '</div>';
  }

  /**
   * A form on a page: which form, not what is in it.
   *
   * The canvas names the real thing rather than drawing a grey box, but it is
   * read-only here - a form is written on its own screen and the link goes
   * there. Editing it from inside a page would be editing a shared thing
   * somewhere that does not say it is shared.
   */
  function formHtml(obj) {
    var p = obj.props || {};
    var form = FORMS.filter(function (f) { return f.id === p.formId; })[0];
    if (!form) {
      return '<div class="editor-formref editor-formref--empty">'
        + '<span class="chrome-tag">Form</span>'
        + '<p class="tiny muted" style="margin:0">'
        + (FORMS.length ? 'Choose a form in the panel.'
          : 'No forms yet. Make one under Forms, then choose it here.')
        + '</p></div>';
    }
    return '<div class="editor-formref">'
      + '<span class="chrome-tag">Form</span>'
      + '<div class="row" style="margin-bottom:var(--ui-s-2)">'
        + '<strong class="grow truncate">' + esc(form.name) + '</strong>'
        + '<a class="linkish" href="/cms/forms/' + form.id + '/edit">Edit this form \u2192</a>'
      + '</div>'
      + '<p class="tiny muted" style="margin:0">' + form.fields
        + (form.fields === 1 ? ' field' : ' fields')
        + ' \u2014 edited on its own screen, so every page using it follows.</p>'
      + '</div>';
  }

  function articlesHtml(obj) {
    var p = obj.props || {};
    var chosen = p.categories || [];
    var names = (DATA.categories || []).filter(function (c) {
      return chosen.indexOf(c.id) >= 0;
    }).map(function (c) { return c.name; });
    var layouts = { grid: 'grid', feature: 'wide', 'feature-reverse': 'wide, reversed', list: 'list' };
    var more = { none: '', button: ' · show more', scroll: ' · keeps loading' };
    var n = Number(p.limit) || 3;
    var cards = '';
    for (var i = 0; i < Math.min(n, 3); i++) {
      cards += '<div class="editor-feed__card"></div>';
    }
    return '<div class="editor-feed">'
      + (p.filter ? '<div class="editor-feed__chips"><span></span><span></span><span></span></div>' : '')
      + '<div class="editor-feed__cards">' + cards + '</div>'
      + '<div class="editor-feed__meta">' + n + (p.order === 'random' ? ' at random · ' : ' at a time · ')
      + esc(names.length ? names.join(', ') : 'every subject') + ' · '
      + esc(layouts[p.layout] || p.layout) + esc(more[p.more] || '') + '</div>'
      + '</div>';
  }

  /* --------------------------------------------------------------- chrome */

  function objectHtml(obj, depth) {
    var def = OBJECTS[obj.kind] || { label: obj.kind };
    var selected = obj.id === selectedId;
    return '<div class="obj' + (selected ? ' is-selected' : '') + '" data-object="' + esc(obj.id) + '"'
      + ' data-kind="' + esc(obj.kind) + '" data-depth="' + depth + '"' + styleAttr(obj.style) + '>'
      + '<span class="chrome-tag">' + esc(def.label) + '</span>'
      + toolsHtml(obj.id, depth > 0)
      + contentHtml(obj)
      + '</div>';
  }

  function toolsHtml(id, hasParent) {
    var btn = function (attr, title, glyph) {
      return '<button class="chrome-tools__btn" type="button" ' + attr + ' title="' + title + '">'
        + glyph + '</button>';
    };
    return '<div class="chrome-tools">'
      + '<span class="chrome-tools__btn" draggable="true" data-obj-handle title="Drag to move">'
      + dragIcon() + '</span>'
      + (hasParent ? btn('data-select-parent="' + esc(id) + '"', 'Select parent', parentIcon()) : '')
      + btn('data-move-up="' + esc(id) + '"', 'Move up', arrowIcon('up'))
      + btn('data-move-down="' + esc(id) + '"', 'Move down', arrowIcon('down'))
      + btn('data-duplicate="' + esc(id) + '"', 'Duplicate', copyIcon())
      + (hasParent ? '' : btn('data-save-slice="' + esc(id) + '"', 'Save as slice', saveIcon()))
      + '<button class="chrome-tools__btn chrome-tools__btn--danger" type="button"'
      + ' data-remove-object="' + esc(id) + '" title="Delete">' + trashIcon() + '</button>'
      + '</div>';
  }

  /**
   * The band, and the inner box inside it - the same two elements and the
   * same classes the site renders, so the canvas cannot drift from the page.
   */
  function sliceBandClasses(block) {
    var p = block.props || {};
    return 'b-slice' + (p.surface ? ' b-surface--' + p.surface : '');
  }

  function sliceInnerClasses(block) {
    var p = block.props || {};
    return 'b-slice__inner b-slice__inner--' + (p.container || 'body')
      + ' b-slice--cols-' + block.columns.length
      + (p.ratio && p.ratio !== 'full' ? ' b-slice--' + p.ratio : '')
      + (p.gap && p.gap !== 'medium' ? ' b-slice--gap-' + p.gap : '')
      + (p.width && p.width !== 'full' ? ' b-slice--w-' + p.width : '');
  }

  function blockHtml(block, position) {
    /* A flat canvas draws the objects and nothing else. The slice around them
       is plumbing the editor needs and the author has no business seeing: no
       label, no toolbar, nothing to select, no band to colour. */
    if (FLAT) {
      var only = (block.columns[0] || { objects: [] }).objects || [];
      return '<div class="slice-block slice-block--flat" data-block="' + esc(block.id) + '">'
        + '<div class="b-slice__col slice-col" data-column="0" data-owner="' + esc(block.id) + '">'
        + (only.length
          ? only.map(function (o) { return objectHtml(o, 1); }).join('')
          : '<div class="obj__col-empty">Drop fields here</div>')
        + '</div></div>';
    }
    /* An unnamed slice is labelled by where it sits, so "Slice 2" means
       something on a page of several. The number is positional and never
       stored - renumbering on reorder is the point, and the data model does
       not have to know. */
    var label = block.name || ('Slice ' + (position + 1));
    var body = block.columns.map(function (col, i) {
      var key = columnKey(block.id, i);
      var isCard = !!col.surface || !!col.border;
      var cls = 'b-slice__col slice-col'
        + (col.align !== 'left' ? ' b-align-' + col.align : '')
        + (col.valign !== 'top' ? ' b-valign-' + col.valign : '')
        + (isCard ? ' b-card' : '')
        + (isCard && col.radius && col.radius !== 'medium' ? ' b-card--r-' + col.radius : '')
        + (col.surface ? ' b-surface--' + col.surface : '')
        + (col.border ? ' b-card--bordered' + lineClasses(col) : '')
        + (key === selectedId ? ' is-selected' : '');
      return '<div class="' + cls + '" data-column="' + i + '" data-owner="' + esc(block.id) + '"'
        + styleAttr(col.style) + '>'
        + (block.columns.length > 1
          ? '<span class="chrome-tag chrome-tag--col">Column ' + (i + 1) + '</span>' : '')
        + (col.objects.length
          ? col.objects.map(function (o) { return objectHtml(o, 1); }).join('')
          : '<div class="obj__col-empty">Drop a block here</div>')
        + '</div>';
    }).join('');

    var hidden = !!(block.props && block.props.hidden);
    return '<div class="slice-block' + (block.id === selectedId ? ' is-selected' : '')
      + (hidden ? ' is-hidden' : '') + '" data-block="' + esc(block.id) + '">'
      + '<span class="chrome-tag chrome-tag--slice">' + esc(label) + '</span>'
      /* Always showing, where the name tag only comes up under the pointer:
         a hidden slice is easy to lose track of, and this is the one thing
         saying why it is not on the site. */
      + (hidden ? '<span class="slice-hidden-tag">' + eyeIcon(true, 13) + 'Hidden</span>' : '')
      + '<div class="chrome-tools">'
      + '<span class="chrome-tools__btn" draggable="true" data-block-handle title="Drag to move">'
      + dragIcon() + '</span>'
      + '<button class="chrome-tools__btn" type="button" data-move-up="' + esc(block.id)
      + '" title="Move up">' + arrowIcon('up') + '</button>'
      + '<button class="chrome-tools__btn" type="button" data-move-down="' + esc(block.id)
      + '" title="Move down">' + arrowIcon('down') + '</button>'
      + '<button class="chrome-tools__btn" type="button" data-duplicate="' + esc(block.id)
      + '" title="Duplicate">' + copyIcon() + '</button>'
      + '<button class="chrome-tools__btn" type="button" data-hide-slice="' + esc(block.id) + '"'
      + ' aria-pressed="' + hidden + '" title="' + (hidden ? 'Show on the site' : 'Hide from the site')
      + '">' + eyeIcon(hidden) + '</button>'
      + '<button class="chrome-tools__btn" type="button" data-save-slice="' + esc(block.id)
      + '" title="Save as slice">' + saveIcon() + '</button>'
      + '<button class="chrome-tools__btn chrome-tools__btn--danger" type="button"'
      + ' data-remove-block="' + esc(block.id) + '" title="Delete">' + trashIcon() + '</button>'
      + '</div>'
      + '<div class="slice-block__body ' + sliceBandClasses(block) + '"'
      + styleAttr(block.style) + '>'
      + '<div class="' + sliceInnerClasses(block) + '">' + body + '</div>'
      + '</div></div>';
  }

  function render() {
    // Everything on the canvas is about to be replaced, so let go of the
    // caret first: the floating toolbar would otherwise stay up, pointing at
    // a node that no longer exists.
    if (CMS.clearRichFocus) CMS.clearRichFocus();
    canvas.innerHTML = blocks.length
      ? blocks.map(function (b, i) { return blockHtml(b, i); }).join('')
      : '<div class="canvas__hint" data-canvas-hint>Drag blocks here from the panel on the right.</div>';
    bindCanvas();
    renderProperties();
  }

  /* ---------------------------------------------------------------- icons */

  function svg(body, size) {
    return '<svg width="' + (size || 15) + '" height="' + (size || 15) + '" viewBox="0 0 24 24" fill="none"'
      + ' stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"'
      + ' aria-hidden="true">' + body + '</svg>';
  }
  function alignIcon(side) {
    var lines = {
      left:   'M3 5h18M3 10h11M3 15h15M3 20h8',
      center: 'M3 5h18M6 10h12M4 15h16M7 20h10',
      right:  'M3 5h18M10 10h11M6 15h15M13 20h8',
    };
    return svg('<path d="' + lines[side] + '"/>', 17);
  }

  function homeIcon() {
    return svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.5"/>', 15);
  }
  function chevronIcon() { return svg('<path d="m9 5 7 7-7 7"/>', 12); }
  function embedIcon() {
    return svg('<rect x="3" y="4" width="18" height="14" rx="2"/><path d="m10.5 9 4 3-4 3Z"/><path d="M8 21h8"/>', 20);
  }

  function dragIcon() {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
      + '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/>'
      + '<circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>';
  }
  function trashIcon() {
    return svg('<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'
      + '<path d="M6 7v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7"/><path d="M10 11v5M14 11v5"/>');
  }
  function arrowIcon(dir) {
    return svg(dir === 'up' ? '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>'
      : '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>');
  }
  function copyIcon() {
    return svg('<rect x="9" y="9" width="11" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>');
  }
  function parentIcon() { return svg('<path d="M12 19V7"/><path d="m7 11 5-5 5 5"/>'); }
  /* The eye shows the state the slice is in, the way a layer's does in
     Photoshop: open while it is on the site, struck through while hidden. */
  function eyeIcon(off, size) {
    return svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/>'
      + '<circle cx="12" cy="12" r="2.8"/>' + (off ? '<path d="m4 4 16 16"/>' : ''), size);
  }
  function saveIcon() {
    return svg('<path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/>'
      + '<path d="M8 4v5h7V4M8 20v-5h8v5"/>');
  }
  function imageIcon() {
    return svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/>'
      + '<path d="m4 17 5-4.5 4 3.5 3-2.5L20 17"/>', 26);
  }
  function sliceIcon() {
    return svg('<rect x="3" y="4" width="18" height="5" rx="1.5"/><rect x="3" y="12" width="18" height="8" rx="1.5"/>', 18);
  }

  /* ----------------------------------------------------------- side panel */

  var panel = document.querySelector('[data-panel]');
  var propsEmpty = panel && panel.querySelector('[data-props-empty]');
  var propsBody = panel && panel.querySelector('[data-props-body]');

  function showTab(name) {
    if (!panel) return;
    panel.querySelectorAll('[data-tab]').forEach(function (tab) {
      var on = tab.dataset.tab === name;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
    });
    panel.querySelectorAll('[data-pane]').forEach(function (pane) {
      pane.hidden = pane.dataset.pane !== name;
    });
  }

  if (panel) {
    panel.querySelectorAll('[data-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () { showTab(tab.dataset.tab); });
    });
  }

  /**
   * One field: a label, the control, and an explanation folded away behind a
   * question mark.
   *
   * Every hint used to sit open under its field, which on a panel of eight
   * fields is more explanation than content and pushes the settings off the
   * bottom of a 13" screen. Behind a dot they cost one line each and are still
   * there the day someone needs them. A click rather than a hover: a panel
   * that whispers at you as the pointer crosses it is worse than one that
   * says nothing.
   */
  function pField(label, hint, control) {
    return '<div class="field">'
      + (label
        ? '<div class="field__head"><label>' + esc(label) + '</label>'
          + (hint ? '<button class="hint-dot" type="button" data-hint aria-expanded="false"'
            + ' title="What is this?" aria-label="What is this?">?</button>' : '')
          + '</div>'
        : '')
      + control
      + (hint ? '<span class="field__hint" hidden>' + esc(hint) + '</span>' : '')
      + '</div>';
  }

  function pInput(id, prop, value, label, hint, type) {
    return pField(label, hint,
      '<input type="' + (type || 'text') + '" data-obj-field="' + esc(id) + '" data-prop="' + esc(prop)
      + '" value="' + esc(value == null ? '' : value) + '">');
  }
  function pArea(id, prop, value, label, hint) {
    return pField(label, hint,
      '<textarea rows="4" data-obj-field="' + esc(id) + '" data-prop="' + esc(prop) + '">'
      + esc(value == null ? '' : value) + '</textarea>');
  }
  function pSelect(id, prop, value, options, label, hint) {
    return pField(label, hint,
      '<select data-obj-field="' + esc(id) + '" data-prop="' + esc(prop) + '">'
      + options.map(function (o) {
        return '<option value="' + esc(o[0]) + '"'
          + (String(o[0]) === String(value == null ? '' : value) ? ' selected' : '') + '>'
          + esc(o[1]) + '</option>';
      }).join('') + '</select>');
  }
  /**
   * The formatting commands, repeated in the panel so everything for a text
   * block is in one place. They act on the caret, not the object, so they do
   * nothing until there is one - and cancelling mousedown is what stops the
   * click from taking the caret away before the command runs.
   */
  function pRich() {
    var bar = document.querySelector('[data-toolbar]');
    if (!bar) return '';
    // Mirror the bar's own markup rather than redrawing its icons here, so the
    // two cannot drift; only the hook is renamed, to keep the bindings apart.
    var html = bar.innerHTML.replace(/data-cmd=/g, 'data-rich-cmd=')
      .replace(/\bis-active\b/g, '');
    return '<div class="field"><label>Formatting</label>'
      + '<div class="toolbar toolbar--panel">' + html + '</div>'
      + '<span class="field__hint">Applies to the text you have selected.</span></div>';
  }

  /**
   * Alignment, as three buttons rather than a dropdown.
   *
   * Three fixed choices with obvious pictures: a select made it two clicks and
   * a read to do the most common thing in the panel.
   */
  function pAlign(id, value, label) {
    var current = value || 'left';
    var button = function (val, glyph, title) {
      return '<button class="segment__btn' + (current === val ? ' is-on' : '') + '" type="button"'
        + ' data-obj-set="' + esc(id) + '" data-prop="align" data-value="' + val + '"'
        + ' aria-pressed="' + (current === val ? 'true' : 'false') + '"'
        + ' title="' + title + '" aria-label="' + title + '">' + glyph + '</button>';
    };
    return pField(label || 'Alignment', '',
      '<div class="segment" data-set-group role="group">'
      + button('left', alignIcon('left'), 'Left')
      + button('center', alignIcon('center'), 'Centre')
      + button('right', alignIcon('right'), 'Right')
      + '</div>');
  }

  /**
   * A theme colour, as the colours themselves.
   *
   * A named list in a dropdown asks you to remember what "Sand" looks like.
   * The swatches are the answer to that, and "none" is drawn as a struck-out
   * empty square because an absent colour still has to be a thing you can aim
   * at - it is the default, and the way back from a wrong choice.
   */
  function pSwatches(id, prop, value, label, hint, noneLabel) {
    var current = value || '';
    var chip = function (colour) {
      var on = current === colour.id;
      return '<button class="swatch-pick' + (on ? ' is-on' : '') + '" type="button"'
        + ' data-obj-set="' + esc(id) + '" data-prop="' + esc(prop) + '"'
        + ' data-value="' + esc(colour.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '"'
        + ' title="' + esc(colour.name) + '" aria-label="' + esc(colour.name) + '">'
        + '<span class="swatch-pick__chip" style="background:' + esc(colour.value) + '"></span>'
        + '</button>';
    };
    var none = '<button class="swatch-pick swatch-pick--none' + (current ? '' : ' is-on') + '" type="button"'
      + ' data-obj-set="' + esc(id) + '" data-prop="' + esc(prop) + '" data-value=""'
      + ' aria-pressed="' + (current ? 'false' : 'true') + '"'
      + ' title="' + esc(noneLabel) + '" aria-label="' + esc(noneLabel) + '">'
      + '<span class="swatch-pick__chip swatch-pick__chip--none"></span></button>';

    return pField(label, hint,
      '<div class="swatch-grid" data-set-group role="group">'
      + none + COLORS.map(chip).join('') + '</div>');
  }

  /**
   * A name to link to, with the address it produces spelled out.
   *
   * Not slugged here: the server folds it on save and this shows what is
   * stored, so what the field says is always what the link actually is. A
   * second slugger in the browser could only ever disagree with the first.
   */
  /**
   * A link, chosen rather than typed.
   *
   * The same list a menu item picks from: every page, and under each the
   * sections of it marked as link targets. Anything the list does not cover -
   * an external site, a file, a mail address - is what the text field is for,
   * and picking a page fills that field so the two never disagree about what
   * the link actually is.
   *
   * Anchors on *this* page are added live from the canvas, because a section
   * marked a moment ago is exactly the one you want to link to and it has not
   * been saved yet.
   */
  function pLink(id, value, label, hint) {
    // This page's saved anchors are dropped from the shipped list and replaced
    // by the live ones, or every section on the page would be offered twice -
    // once as it was last saved and once as it stands.
    var here = CMS.data.permalink || '';
    var options = String(CMS.data.linkOptions || '')
      .replace(new RegExp('<option value="' + here.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        + '#[^"]*"[^>]*>[^<]*</option>', 'g'), '')
      + livePageAnchors();
    var known = options.indexOf('value="' + esc(value || '') + '"') >= 0;
    return pField(label, hint,
      '<select data-link-for="' + esc(id) + '">'
      + '<option value="">Custom link\u2026</option>' + options + '</select>'
      + '<input type="text" data-obj-field="' + esc(id) + '" data-prop="href"'
      + ' value="' + esc(value || '') + '" placeholder="https://\u2026, /page, mailto:\u2026"'
      + (known ? ' hidden' : '') + '>');
  }

  /** This page's own link targets, as they stand on the canvas right now. */
  function livePageAnchors() {
    var here = CMS.data.permalink || '';
    var seen = {};
    var out = '';
    var take = function (anchor, label) {
      if (!anchor) return;
      var id = anchor;
      for (var n = 2; seen[id]; n++) id = anchor + '-' + n;
      seen[id] = true;
      out += '<option value="' + esc(here + '#' + id) + '">'
        + '\u00a0\u00a0\u2514 ' + esc(label || id) + '</option>';
    };
    blocks.forEach(function (block) {
      // A hidden slice's sections are not on the site for a link to land on.
      if (block.props && block.props.hidden) return;
      var heading = null;
      block.columns.forEach(function (col) {
        col.objects.forEach(function (o) {
          if (!heading && o.kind === 'heading' && o.props.text) heading = o.props.text;
        });
      });
      take((block.props || {}).anchor, block.name || heading);
      block.columns.forEach(function (col) {
        col.objects.forEach(function (o) { take((o.props || {}).anchor, o.props.text); });
      });
    });
    return out ? '<option disabled>\u2014 on this page \u2014</option>' + out : '';
  }

  /**
   * Whether this is a link target. On or off.
   *
   * A big site has hundreds of headings and almost none of them are somewhere
   * you would link to, so the switch is off until someone says otherwise -
   * nothing unnamed gets an id, and nothing unnamed shows up in the menu
   * picker. Turning it on seeds a name from the text and then *stores* it:
   * from that moment the name is its own thing, and rewriting the heading
   * cannot move a link that already points here.
   */
  function pAnchor(id, value, what) {
    var toggle = '<div class="field"><div class="field__head"><label class="check">'
      + '<input type="checkbox" data-anchor-toggle="' + esc(id) + '"'
      + (value ? ' checked' : '') + '>'
      + '<span>Mark as link target</span></label>'
      + (value ? '' : '<button class="hint-dot" type="button" data-hint aria-expanded="false"'
        + ' title="What is this?" aria-label="What is this?">?</button>') + '</div>'
      + (value ? '' : '<span class="field__hint" hidden>Makes this ' + what
        + ' a destination, so a menu item or a link can point straight at it.</span>')
      + '</div>';
    var rule = '<hr class="rule" style="margin:var(--ui-s-3) 0">';
    if (!value) return toggle + rule;

    var here = (CMS.data.permalink || '');
    var clash = anchorClashes(id, value);
    return toggle
      + pInput(id, 'anchor', value, 'Name in the address',
        'Links point here as ' + here + '#' + value
        + '. Changing it breaks any link that already does.')
      + (clash
        ? '<p class="field__error">Another ' + esc(clash) + ' on this page uses this name. '
          + 'Whichever comes second is given a number, so reordering the page would move '
          + 'the link. Rename one of them.</p>'
        : '')
      + rule;
  }

  /**
   * Whether something else on this page already claims this anchor. Only
   * what the site shows can: a hidden slice carries no ids, so a variant
   * hidden beside the section it copies does not clash with it - while the
   * hidden one, asked, still hears about the visible one it would clash with.
   */
  function anchorClashes(id, value) {
    var hit = null;
    blocks.forEach(function (block) {
      if (block.props && block.props.hidden) return;
      if (block.id !== id && (block.props || {}).anchor === value) hit = 'section';
      block.columns.forEach(function (col) {
        col.objects.forEach(function (obj) {
          if (obj.id !== id && (obj.props || {}).anchor === value) hit = hit || 'block';
        });
      });
    });
    return hit;
  }

  /**
   * The name a freshly switched-on destination starts with.
   *
   * Only ever a suggestion: the server folds whatever it is given, and its
   * answer is what gets stored. This has to produce something close enough to
   * be recognisable, not something identical.
   */
  function suggestAnchor(found) {
    var from = '';
    if (found.isBlock) {
      from = found.block.name;
      found.block.columns.forEach(function (col) {
        col.objects.forEach(function (o) {
          if (!from && o.kind === 'heading') from = o.props.text;
        });
      });
      from = from || 'section';
    } else {
      from = (found.obj.props || {}).text || found.obj.kind;
    }
    var slug = String(from).toLowerCase()
      .replace(/[\u00e5\u00e4]/g, 'a').replace(/\u00f6/g, 'o')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return slug || 'section';
  }

  /** Two narrow fields side by side, for pairs that read as one setting. */
  function pPair(a, b) { return '<div class="field-pair">' + a + b + '</div>'; }

  /**
   * Checkboxes over a list-valued prop, for a feed's subjects.
   *
   * Not a multi-select: it hides what is chosen behind a scroll and gives no
   * clue that more than one is allowed. None ticked means every subject,
   * which is what a news page is - so the empty state is the useful default
   * rather than an unset one.
   */
  function pChecks(id, prop, values, options, label, hint) {
    var chosen = (values || []).map(String);
    return pField(label, hint,
      '<div class="check-grid">' + options.map(function (o) {
        return '<label class="check"><input type="checkbox" data-obj-toggle="' + esc(id) + '"'
          + ' data-prop="' + esc(prop) + '" value="' + esc(o[0]) + '"'
          + (chosen.indexOf(String(o[0])) >= 0 ? ' checked' : '') + '>'
          + '<span>' + esc(o[1]) + '</span></label>';
      }).join('') + '</div>');
  }

  function pCheck(id, prop, value, label) {
    return '<div class="field"><label class="check">'
      + '<input type="checkbox" data-obj-field="' + esc(id) + '" data-prop="' + esc(prop) + '"'
      + (value ? ' checked' : '') + '><span>' + esc(label) + '</span></label></div>';
  }

  /**
   * The slice owns the layout, so this is where column count, split, gap and
   * width live. Changing the count adds empty columns or, when shrinking,
   * folds the objects of the columns being dropped into the last one kept -
   * losing content to a mis-click would be far worse than a crowded column.
   */
  function sliceFormHtml(block) {
    var id = block.id;
    var count = block.columns.length;
    var p = block.props || {};
    return pAnchor(id, p.anchor, 'section')
      + pSelect(id, 'columns', String(count), COLUMN_COUNTS, 'Columns')
      + (count > 1 ? pSelect(id, 'ratio', p.ratio, RATIOS[count] || [], 'Split') : '')
      + (count > 1 ? pSelect(id, 'gap', p.gap, GAPS, 'Gap between columns') : '')
      + pSwatches(id, 'surface', p.surface, 'Background',
        FREE_FRAME
          ? 'The band runs to the window edge; the content inside it does not.'
          : 'This page type caps the band \u2014 a Blank page lets it reach the edge.',
        'No background')
      + pSelect(id, 'container', p.container, CONTAINERS, 'Content width',
        'How wide the content draws inside the band. The measurements come from the theme.')
      + pSelect(id, 'width', p.width, WIDTHS, 'Width',
        'A proportion of that. Everything goes full width on a phone.')
      + (count > 1
        ? '<p class="tiny muted">Select a column on the canvas for its own padding and alignment.</p>'
        : '')
      + '<hr class="rule" style="margin:var(--ui-s-3) 0">' + SPACING_HTML;
  }

  /* Per-column box settings. The column has no id, so it is addressed by index.
     The corner scale is an image's too, mirroring RADII in src/lib/objects.js,
     so a name measures the same on a card and on a picture. */
  var RADII = [['none', 'Square'], ['small', 'Slight'],
    ['medium', 'Rounded'], ['large', 'Very rounded']];
  /** What the demo site's cards were padded by, and so what one starts with. */
  var CARD_PADDING = 24;
  /** The room a coloured band gives its contents, seeded when one is chosen. */
  var BAND_PADDING = 56;

  function columnFormHtml(block, index, col) {
    var key = columnKey(block.id, index);
    var isCard = !!col.surface || !!col.border;
    return pAlign(key, col.align, 'Content alignment')
      + pSelect(key, 'valign', col.valign, VALIGN, 'Vertical placement',
        'Where the contents sit when a neighbouring column is taller.')
      /* A card is a column with a background, an outline, or both. Its own
         section, because it is a different question from where the contents
         sit - and because three columns given one become three cards of equal
         height, which is the whole reason it lives here. */
      + '<hr class="rule" style="margin:var(--ui-s-4) 0">'
      + '<h3 class="h-section" style="margin-bottom:var(--ui-s-2)">Card</h3>'
      + pSwatches(key, 'surface', col.surface, 'Background',
        'A background or an outline turns this column into a card. Columns are '
        + 'the same height, so cards across a slice line up.', 'None')
      + pCheck(key, 'border', col.border, 'Outline')
      + (isCard
        ? pSelect(key, 'radius', col.radius || 'medium', RADII, 'Corners')
          + (col.border
            ? pPair(
              pSelect(key, 'borderStyle', col.borderStyle, LINE_STYLES, 'Style'),
              pSelect(key, 'borderWidth', col.borderWidth, LINE_WIDTHS, 'Thickness'))
              + pSelect(key, 'borderColor', col.borderColor, LINE_COLORS, 'Outline colour')
            : '')
        : '')
      + '<hr class="rule" style="margin:var(--ui-s-4) 0">'
      + spacingHtml(['padding'])
      + '<p class="tiny muted">Margin and spacing for the whole slice live on the slice itself.</p>';
  }

  /**
   * Text colour, offered on the objects that carry text.
   *
   * Left on "inherit" the object takes its colour from the surface it sits
   * on, which is right almost always - the reason a surface carries an ink at
   * all. This is the escape hatch for the odd accent word, not the way to set
   * text colour on a dark band.
   */
  function pInk(id, value) {
    return pSwatches(id, 'ink', value, 'Text colour',
      'Inherit follows the slice\u2019s background. Only override it for emphasis.',
      'Inherit from the surface');
  }

  /**
   * Which row or column the table colour picker is aimed at.
   *
   * Panel state, not page state: it is where the author is looking, not
   * anything about the table, so it never reaches the stored JSON. Held
   * against an object id so selecting a different table starts fresh.
   */
  var tableTarget = null;

  var axisLabel = function (p, axis, i) {
    if (axis === 'col') return 'Column ' + (i + 1);
    return i === 0 && p.headerRow ? 'Header row' : 'Row ' + (i + 1);
  };

  /**
   * The current target, clamped to the table as it is now.
   *
   * Clamping here rather than when rows change is what makes shrinking a
   * table safe: the picker can never end up pointed at a row that is gone,
   * whatever order the edits happened in.
   */
  function tableTargetFor(obj) {
    var p = obj.props || {};
    var t = tableTarget && tableTarget.id === obj.id ? tableTarget : null;
    var axis = t && t.axis === 'col' ? 'col' : 'row';
    var limit = axis === 'row' ? (p.rows || 3) : (p.cols || 3);
    return { axis: axis, index: Math.max(0, Math.min(t ? t.index : 0, limit - 1)) };
  }

  /**
   * A table's colours: the whole table, the stripe, and one row or column at
   * a time.
   *
   * The map is the answer to "which row?". A palette and twenty rows cannot
   * both fit in a panel, so the shape of the table is drawn small, you click
   * a number to say what you are colouring, and the one swatch grid under it
   * does the colouring. It doubles as a preview: every square is filled with
   * the colour that cell will actually draw, so precedence and the stripe are
   * visible rather than something to be remembered.
   */
  function tableBgHtml(obj) {
    var p = obj.props || {};
    var id = obj.id;
    var rows = p.rows || 3;
    var cols = p.cols || 3;
    var target = tableTargetFor(obj);
    var isRow = target.axis === 'row';

    var head = function (axis, i) {
      var on = (axis === 'row') === isRow && target.index === i;
      return '<button class="tbl-map__head' + (on ? ' is-on' : '') + '" type="button"'
        + ' data-table-target="' + axis + '|' + i + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
        + ' title="' + esc(axisLabel(p, axis, i)) + '"'
        + ' aria-label="' + esc(axisLabel(p, axis, i)) + '">' + (i + 1) + '</button>';
    };

    var grid = '<span class="tbl-map__corner" aria-hidden="true"></span>';
    var c;
    for (c = 0; c < cols; c++) grid += head('col', c);
    for (var r = 0; r < rows; r++) {
      grid += head('row', r);
      for (c = 0; c < cols; c++) {
        // The table's own colour is the fallback, so the map shows what the
        // cell draws rather than only what was set on its row or column.
        var colour = colorById[cellSurface(p, r, c) || p.surface];
        grid += '<span class="tbl-map__cell' + (colour ? '' : ' is-bare') + '" aria-hidden="true"'
          + (colour ? ' style="background:' + esc(colour.value) + '"' : '') + '></span>';
      }
    }

    var list = (isRow ? p.rowSurfaces : p.colSurfaces) || [];
    return pSwatches(id, 'surface', p.surface, 'Table background',
        'Left unset the band behind the table shows through, the way every '
        + 'other object behaves. Pick White for a table that stays white on a '
        + 'coloured band.', 'None \u2014 the band shows through')
      + pSwatches(id, 'stripes', p.stripes, 'Striped rows',
        'Every second body row takes this colour. A header row is not part of '
        + 'the alternation, and an explicit row or column colour beats it.',
        'No stripes')
      + pField('Rows and columns',
        'Click a number to aim the picker below at that row or column. Where '
        + 'both carry a colour the row wins \u2014 the same order the browser '
        + 'itself paints a table in.',
        '<div class="tbl-map" style="--tbl-cols:' + cols + '">' + grid + '</div>')
      + pSwatches(id, (isRow ? 'rowSurfaces.' : 'colSurfaces.') + target.index,
        list[target.index], axisLabel(p, target.axis, target.index), '', 'None');
  }

  /**
   * A form field's label, in the panel as well as on the canvas.
   *
   * It is a content prop, so by rule it belongs only on the canvas - but a
   * form is a dense stack of small controls, and the label is a caption
   * inside one of them rather than a line of prose you would naturally click.
   * With it missing here, the panel's first field was "Field name" and that
   * is what people typed the label into: it silently deleted every character
   * that was not ASCII, so "Ärende" was stored as "rende" and the label
   * stayed at its English default. Two places to type one thing is a smaller
   * problem than one place nobody finds.
   */
  function pFieldLabel(id, value) {
    return pInput(id, 'label', value, 'Label', 'What the visitor reads above the field.');
  }

  /* The same folding `slugify` does on the server, character for character.
     The panel shows this value now rather than describing it, so a label the
     editor folded differently would be the panel telling a small lie about
     what the site posts. */
  var TRANSLIT = { '\u00e5': 'a', '\u00e4': 'a', '\u00f6': 'o', '\u00e9': 'e', '\u00e8': 'e',
    '\u00fc': 'u', '\u00f8': 'o', '\u00e6': 'ae', '\u00df': 'ss', '\u00f1': 'n', '\u00e7': 'c' };

  function fieldSlug(label) {
    return String(label || '').toLowerCase()
      .replace(/[\u00e5\u00e4\u00f6\u00e9\u00e8\u00fc\u00f8\u00e6\u00df\u00f1\u00e7]/g,
        function (c) { return TRANSLIT[c] || c; })
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Keep the Field name box showing what an untouched name follows.
   *
   * The value is never written to the model while it is following - the site
   * derives it from the label at render time - so this only repaints the box.
   * A name that has been typed into is left exactly alone.
   */
  function mirrorFieldName(obj) {
    if (!propsBody || !obj || !OBJECTS[obj.kind] || !OBJECTS[obj.kind].formField) return;
    var p = obj.props || {};
    if (p.name) return;
    var box = propsBody.querySelector('[data-obj-field="' + obj.id + '"][data-prop="name"]');
    if (box) box.value = fieldSlug(p.label);
  }

  /**
   * A label typed on the canvas moves the panel's copy of it.
   *
   * The two have always been able to drift - a label is typed in both places
   * and only the model was kept - but nobody saw it while the panel box just
   * sat there. With Field name updating underneath it, a Label box still
   * showing the old text reads as a bug in the thing that did work. Never
   * over a box being typed into: the panel is the other writer here.
   */
  function syncPanelProp(id, prop, value) {
    if (!propsBody) return;
    var box = propsBody.querySelector('[data-obj-field="' + id + '"][data-prop="' + prop + '"]');
    if (box && box !== document.activeElement) box.value = value;
  }

  /**
   * What this field is called in the submitted data - the input's `name`.
   *
   * Under the Label, because it is the label's shadow: it follows what is
   * typed there until somebody types here instead. It used to sit last and be
   * called "Key in the e-mail", which was both misplaced and untrue - the
   * e-mail is written from the *label*, and the key appears in it only for a
   * field with no label at all. So the one line describing it sent the reader
   * looking for an effect they would never see.
   *
   * Stored empty while it follows, rather than stamped with a copy: a label
   * corrected later corrects the key with it. The box shows the derived value
   * anyway, because an empty box under a filled Label reads as "nothing here"
   * and the old hint hid the answer behind a question mark.
   */
  function pFieldKey(id, p) {
    return pInput(id, 'name', p.name || fieldSlug(p.label), 'Field name',
      'What this field is called in the data that arrives \u2014 plain letters and '
      + 'numbers. Follows the label until you type your own; clear it to follow again. '
      + 'Two fields cannot share one name.');
  }

  /** Settings for the selected object. Content props never appear here. */
  function propsFormHtml(obj) {
    var p = obj.props || {};
    var id = obj.id;
    switch (obj.kind) {
      case 'heading':
        // Whether this is a destination is a question about the page, not
        // about how the heading looks, so it comes before the appearance.
        return pAnchor(id, p.anchor, 'heading')
          + pSelect(id, 'headingSize', p.headingSize, HEADING_SIZES, 'Size')
          + pSelect(id, 'level', p.level, HEADING_LEVELS, 'Level',
            'Where this sits in the page\u2019s outline, not how big it draws. '
            + 'Standard pages already carry an H1 in their title.')
          + pAlign(id, p.align, 'Alignment')
          + pInk(id, p.ink);
      case 'text':
        return pRich()
          + pSelect(id, 'textSize', p.textSize || 'body', TEXT_SIZES, 'Size',
            'How big the whole block draws. An intro under a hero is body copy '
            + 'that happens to be larger \u2014 it does not have to be a heading.')
          + pAlign(id, p.align, 'Alignment')
          + pInk(id, p.ink);
      case 'image':
        return pInput(id, 'alt', p.alt, 'Alt text', 'Describes the image for screen readers')
          + pInput(id, 'caption', p.caption, 'Caption')
          + pLink(id, p.href, 'Link', 'Makes the image clickable')
          + pSelect(id, 'size', p.size || 'full', IMAGE_SIZES, 'Display size',
              'Never wider than its column, whatever the upload measures')
          + pSelect(id, 'radius', p.radius || 'large', RADII, 'Corners',
              'Square leaves artwork such as a logo exactly as it was drawn')
          + pAlign(id, p.align, 'Alignment');
      case 'columns2':
        return pSelect(id, 'ratio', p.ratio || '50-50', RATIOS2, 'Split',
              'Stacks to one column on a phone');
      case 'columns3':
        return pSelect(id, 'ratio', p.ratio || 'equal', RATIOS3, 'Split',
              'Stacks to one column on a phone');
      case 'button':
        return pLink(id, p.href, 'Link')
          + pSwatches(id, 'colour', p.colour, 'Colour',
            '', 'Plain \u2014 the theme\u2019s default outline')
          + pCheck(id, 'outline', p.outline, 'Outline only')
          + pSelect(id, 'buttonSize', p.buttonSize, BUTTON_SIZES, 'Size')
          + pAlign(id, p.align, 'Alignment');
      case 'link':
        return pLink(id, p.href, 'Link')
          + pAlign(id, p.align, 'Alignment');
      case 'quote':
        return pInput(id, 'source', p.source, 'Attribution')
          + pAlign(id, p.align, 'Alignment')
          + pInk(id, p.ink);
      case 'code':
        return pInput(id, 'filename', p.filename, 'File name', 'Optional. Shown above the code.')
          + pInput(id, 'language', p.language, 'Language', 'A label only — nothing is highlighted.')
          + pAlign(id, p.align, 'Alignment');
      case 'embed':
        return pInput(id, 'url', p.url, 'Link', EMBED_HINT)
          + pInput(id, 'caption', p.caption, 'Caption')
          + pAlign(id, p.align, 'Alignment');
      case 'breadcrumbs':
        return pAlign(id, p.align, 'Alignment')
          + '<p class="tiny muted">'
          + (CMS.data.frame === 'default'
            ? 'This page type already draws breadcrumbs above the content — an object here would repeat them.'
            : 'This page type draws no breadcrumbs of its own, which is what this is for.')
          + '</p>';
      case 'table':
        return pPair(
          pInput(id, 'rows', p.rows == null ? 3 : p.rows, 'Rows', '', 'number'),
          pInput(id, 'cols', p.cols == null ? 3 : p.cols, 'Cols', '', 'number'))
          + '<span class="field__hint" style="margin-top:-6px;display:block">'
          + 'Rows are added at the bottom, columns on the right.</span>'
          + pCheck(id, 'headerRow', p.headerRow, 'First row is a header')
          + pSelect(id, 'cellPadding', p.cellPadding, [['small', 'Small'], ['medium', 'Medium'],
            ['large', 'Large']], 'Cell padding')
          /* Its own section, and redrawn on its own: the map has to follow a
             change to the row count, and re-rendering the whole panel for
             that would replace the number input being typed into. */
          + '<hr class="rule" style="margin:var(--ui-s-4) 0">'
          + '<h3 class="h-section" style="margin-bottom:var(--ui-s-2)">Backgrounds</h3>'
          + '<div data-table-bg>' + tableBgHtml(obj) + '</div>'
          + '<hr class="rule" style="margin:var(--ui-s-4) 0">'
          + '<h3 class="h-section" style="margin-bottom:var(--ui-s-2)">Borders</h3>'
          + pSelect(id, 'borders', p.borders, [['all', 'All'], ['rows', 'Rows only'],
            ['columns', 'Columns only'], ['none', 'None']], 'Borders')
          + pPair(
            pSelect(id, 'borderStyle', p.borderStyle, LINE_STYLES, 'Style'),
            pSelect(id, 'borderWidth', p.borderWidth, LINE_WIDTHS, 'Thickness'))
          + pSelect(id, 'borderColor', p.borderColor, LINE_COLORS, 'Border colour');
      case 'divider':
        return pSelect(id, 'borderStyle', p.borderStyle, LINE_STYLES, 'Style');
      case 'spacer':
        return pInput(id, 'height', p.height, 'Height (px)', '', 'number');
      case 'form': {
        var options = [['', FORMS.length ? '\u2014 choose a form \u2014' : 'No forms yet']]
          .concat(FORMS.map(function (f) { return [String(f.id), f.name]; }));
        return pSelect(id, 'formId', p.formId ? String(p.formId) : '', options, 'Form',
            'The fields, the recipient and what the button says live on the form '
            + 'itself, so the same form on two pages stays one form.')
          + '<p class="tiny muted">'
          + (p.formId
            ? '<a href="/cms/forms/' + Number(p.formId) + '/edit">Edit this form \u2192</a>'
            : '<a href="/cms/forms">Manage forms \u2192</a>')
          + '</p>';
      }
      case 'articles': {
        var cats = (DATA.categories || []).map(function (c) { return [String(c.id), c.name]; });
        return pChecks(id, 'categories', p.categories, cats, 'Subjects',
            'None ticked draws from every subject \u2014 which is what a news page is.')
          + pSelect(id, 'layout', p.layout, [['grid', 'Grid'], ['feature', 'Wide, image right'],
            ['feature-reverse', 'Wide, image left'], ['list', 'List']], 'Layout')
          + pInput(id, 'limit', p.limit, 'Show at a time', '', 'number')
          + pSelect(id, 'order', p.order, [['newest', 'Newest first'], ['random', 'Random']], 'Order',
            'Random makes a new pick on every page load and shows only that, so it never loads more.')
          /* Gone rather than greyed out, the way a one-column slice has no
             Split: a random feed has no more to load. */
          + (p.order === 'random' ? '' : pSelect(id, 'more', p.more, [['none', 'Nothing'],
            ['button', 'A \u201cShow more\u201d button'], ['scroll', 'Keep loading as you scroll']],
            'When there are more',
            'The first batch is in the page itself; the rest arrive as they are asked for.'))
          + pCheck(id, 'filter', p.filter, 'Let visitors filter by subject');
      }
      case 'fieldText':
      case 'fieldEmail':
        return pFieldLabel(id, p.label)
          + pFieldKey(id, p)
          + pInput(id, 'placeholder', p.placeholder, 'Placeholder')
          + pSelect(id, 'width', p.width, [['full', 'Full width'], ['half', 'Half width']], 'Width')
          + pCheck(id, 'required', p.required, 'Required');
      case 'fieldPhone':
        return pFieldLabel(id, p.label)
          + pFieldKey(id, p)
          + pSelect(id, 'prefix', p.prefix, COUNTRY_OPTIONS, 'Starts on',
            'Which country the prefix shows first. The visitor can pick another, '
            + 'and a number typed with + or 00 keeps its own.')
          + pInput(id, 'placeholder', p.placeholder, 'Placeholder')
          + pSelect(id, 'width', p.width, [['full', 'Full width'], ['half', 'Half width']], 'Width')
          + pCheck(id, 'required', p.required, 'Required');
      case 'fieldTextarea':
        return pFieldLabel(id, p.label)
          + pFieldKey(id, p)
          + pInput(id, 'placeholder', p.placeholder, 'Placeholder')
          + pInput(id, 'rows', p.rows, 'Rows', '', 'number')
          + pCheck(id, 'required', p.required, 'Required');
      case 'fieldSelect':
        return pFieldLabel(id, p.label)
          + pFieldKey(id, p)
          + pArea(id, 'options', p.options, 'Options', 'One per line')
          + pSelect(id, 'width', p.width, [['full', 'Full width'], ['half', 'Half width']], 'Width')
          + pCheck(id, 'required', p.required, 'Required');
      case 'fieldRadio':
        return pFieldLabel(id, p.label)
          + pFieldKey(id, p)
          + pArea(id, 'options', p.options, 'Options', 'One per line')
          + pCheck(id, 'required', p.required, 'Required');
      case 'fieldCheckbox':
        return pFieldLabel(id, p.label)
          + pFieldKey(id, p)
          + pCheck(id, 'required', p.required, 'Required');
      default:
        return '';
    }
  }

  function spacingHtml(groups) {
    var sides = ['top', 'right', 'bottom', 'left'];
    var row = function (group, label) {
      return '<div class="spacing__group"><span class="label">' + label + '</span>'
        + sides.map(function (side) {
          return '<input type="number" data-space="' + group + '.' + side + '" placeholder="0"'
            + ' aria-label="' + label + ' ' + side + '">';
        }).join('') + '</div>';
    };
    return '<div class="spacing"><div class="spacing__legend">'
      + '<span></span><span>Top</span><span>Right</span><span>Bottom</span><span>Left</span></div>'
      + groups.map(function (g) { return row(g, g === 'margin' ? 'Margin' : 'Padding'); }).join('')
      + '</div>';
  }
  var SPACING_HTML = spacingHtml(['margin', 'padding']);

  /**
   * The canvas node a spacing change writes its inline style to.
   *
   * All three levels already carry their spacing as a style attribute, so all
   * three can be patched without redrawing anything - which is the whole
   * point, since a redraw takes the caret out of the field being typed into.
   * A slice's is the band inside its chrome, not the wrapper: the wrapper
   * carries the selection outline and the tools, and margin on it would push
   * those around instead of the content.
   */
  function spacingNode(found) {
    if (!found) return null;
    if (found.isBlock) {
      var wrapper = canvas.querySelector('[data-block="' + found.block.id + '"]');
      return wrapper && wrapper.querySelector('.slice-block__body');
    }
    if (found.isColumn) {
      return canvas.querySelector('[data-column="' + found.columnIndex + '"]'
        + '[data-owner="' + found.block.id + '"]');
    }
    return found.obj && canvas.querySelector('[data-object="' + found.obj.id + '"]');
  }

  /**
   * Whose `style` the spacing inputs edit. A slice, one of its columns and an
   * object all carry the same shape, so one accessor covers the three cases.
   */
  function styleOwner(found) {
    if (!found) return null;
    if (found.isBlock) return found.block;
    if (found.isColumn) return found.column;
    return found.obj;
  }

  /**
   * The path to what is selected, as clickable steps.
   *
   * A slice is selected by clicking its own area - the padding around its
   * columns, or the space under them - and nothing says so. On a full slice
   * that area is a thin ring, which is how "where do I set the background?"
   * becomes a fair question with the control sitting right there. This makes
   * every level reachable from whatever is selected, with no aiming.
   */
  function crumbHtml(found) {
    var steps = [];
    var block = found.block;
    // On a flat canvas the slice is plumbing, so it is not a step anybody
    // should be offered a way back to.
    if (block && !FLAT) {
      steps.push({
        id: block.id,
        label: block.name || ('Slice ' + (blocks.indexOf(block) + 1)),
        here: !!found.isBlock,
      });
    }
    if (block && found.columnIndex != null && block.columns.length > 1) {
      steps.push({
        id: columnKey(block.id, found.columnIndex),
        label: 'Column ' + (found.columnIndex + 1),
        here: !!found.isColumn,
      });
    }
    // A field in a form, or an object in a table cell, sits under one more.
    if (found.owner) {
      steps.push({ id: found.owner.id, label: objectLabel(found.owner), here: false });
    }
    if (found.obj && !found.isBlock) {
      steps.push({ id: found.obj.id, label: objectLabel(found.obj), here: true });
    }

    return '<nav class="crumbs">' + steps.map(function (step, i) {
      var sep = i ? '<span class="crumbs__sep">' + chevronIcon() + '</span>' : '';
      return sep + (step.here
        ? '<span class="crumbs__here">' + esc(step.label) + '</span>'
        : '<button class="crumbs__step" type="button" data-crumb="' + esc(step.id) + '">'
          + esc(step.label) + '</button>');
    }).join('') + '</nav>';
  }

  function objectLabel(obj) {
    return (OBJECTS[obj.kind] || {}).label || obj.kind;
  }

  function renderProperties() {
    if (!panel) return;
    var found = selectedId ? locate(selectedId) : null;
    if (!found) {
      propsEmpty.hidden = false;
      propsBody.hidden = true;
      propsBody.innerHTML = '';
      return;
    }
    propsEmpty.hidden = true;
    propsBody.hidden = false;

    if (found.isBlock || found.isColumn) {
      propsBody.innerHTML = crumbHtml(found) + (found.isBlock
        ? sliceFormHtml(found.block)
        : columnFormHtml(found.block, found.columnIndex, found.column));
      bindProps();
      fillSpacing(styleOwner(found));
      return;
    }

    var obj = found.obj;
    propsBody.innerHTML =
      '<div class="spread">' + crumbHtml(found)
      + '<button class="icon-btn icon-btn--danger" type="button" data-props-delete title="Delete">'
      + trashIcon() + '</button></div>'
      + propsFormHtml(obj)
      + '<hr class="rule" style="margin:var(--ui-s-3) 0">' + SPACING_HTML;
    /* The panel's formatting buttons are bound by `bindProps`, and were bound
       a second time here as well. Every one of these commands is a *toggle* -
       h2 is toggleBlock('h2'), bold is execCommand('bold') - so two handlers
       on one click applied the command and immediately took it back off, and
       the panel looked inert while the identical bar above it worked. */
    bindProps();

    fillSpacing(obj);

  }

  function fillSpacing(owner) {
    propsBody.querySelectorAll('[data-space]').forEach(function (input) {
      var parts = input.dataset.space.split('.');
      var value = owner && owner.style && owner.style[parts[0]] && owner.style[parts[0]][parts[1]];
      input.value = value == null ? '' : value;
    });
  }

  /**
   * Apply one slice setting. Column count is the interesting one: growing adds
   * empty columns, shrinking folds the objects of the columns being removed
   * into the last one kept. Silently binning someone's content because they
   * picked "two" instead of "three" would be indefensible.
   */
  function applySliceProp(block, prop, value) {
    if (prop === 'columns') {
      var want = Math.max(1, Math.min(4, parseInt(value, 10) || 1));
      while (block.columns.length < want) {
        block.columns.push({ align: 'left', valign: 'top', style: { padding: {} }, objects: [] });
      }
      if (block.columns.length > want) {
        var dropped = block.columns.splice(want);
        var keep = block.columns[want - 1];
        dropped.forEach(function (col) { keep.objects = keep.objects.concat(col.objects); });
      }
      var allowed = (RATIOS[block.columns.length] || []).map(function (r) { return r[0]; });
      if (allowed.indexOf(block.props.ratio) < 0) block.props.ratio = DEFAULT_RATIO[block.columns.length];
    } else {
      block.props[prop] = value;
      /* Giving a slice a background seeds the room its colour needs, as a
         *stored* number. The stylesheet used to add it invisibly, so a
         coloured band had padding the spacing fields swore was zero - the
         third time that shape of bug has surfaced, after the slice margin and
         the card. Top and bottom only: the sides are the container's gutter,
         which is a different thing on a different element. Only when nothing
         has been set, because an author who chose a padding meant it. */
      if (prop === 'surface' && value) {
        var pad = block.style && block.style.padding;
        if (!pad || !Object.keys(pad).length) {
          block.style = block.style || {};
          block.style.padding = { top: BAND_PADDING, bottom: BAND_PADDING };
        }
      }
    }
    markDirty();
    render();
  }

  function coerce(prop, value, input, kind) {
    if (input && input.type === 'checkbox') return input.checked;
    if (prop === 'limit') return Math.max(1, Math.min(24, parseInt(value, 10) || 3));
    /* Two different numbers share the name `rows`: how many rows a table's
       grid has, and how tall a message box draws. The kind decides which,
       because reading the name alone let the message box's floor of two hold
       every table to two rows - a one-row table could not be made at all. */
    if (prop === 'rows') {
      return kind === 'table'
        ? Math.max(1, Math.min(20, parseInt(value, 10) || 3))
        : Math.max(2, Math.min(20, parseInt(value, 10) || 6));
    }
    if (prop === 'height') return Math.max(4, Math.min(240, parseInt(value, 10) || 32));
    if (prop === 'cols') return Math.max(1, Math.min(8, parseInt(value, 10) || 3));
    /* Which form a page points at. A select hands back a string and the
       server stores a number, so the canvas would compare "1" against 1 and
       draw "choose a form" over a form that had just been chosen. */
    if (prop === 'formId') return parseInt(value, 10) || null;
    return value;
  }

  // Props that change how the object draws, so the canvas needs a repaint.
  // Anything omitted here still saves, but the canvas stops matching the site
  // until reload - which is the one thing the WYSIWYG canvas must not do.
  var VISUAL_PROPS = ['level', 'align', 'variant', 'height', 'limit', 'categories', 'layout',
    'order', 'more', 'filter', 'textSize',
    'caption', 'source', 'required', 'width', 'rows', 'placeholder', 'options', 'submitLabel',
    /* `label` is edited on the canvas too, but a canvas edit writes straight
       to the model and never comes through here - so this only ever fires for
       a panel edit, which does need the repaint. */
    'label', 'name',
    'size', 'radius', 'ratio', 'rows', 'cols', 'headerRow', 'borders', 'cellPadding',
    'borderStyle', 'borderWidth', 'borderColor', 'ink', 'url', 'language', 'filename',
    'colour', 'outline', 'buttonSize', 'headingSize', 'level',
    'surface', 'stripes', 'rowSurfaces', 'colSurfaces', 'formId'];

  /* What the map in the table panel is drawn from: the table's shape and
     every colour that can land on a cell. */
  var TABLE_BG_PROPS = ['rows', 'cols', 'headerRow', 'surface', 'stripes',
    'rowSurfaces', 'colSurfaces'];
  /* `anchor` is deliberately absent above: it changes the markup's id, not
     how anything draws, so the canvas needs no repaint when it changes. The
     panel does re-read it, on the next selection, which is when the clash
     warning and the link preview are worth recomputing. */

  /**
   * Write one property, whatever addressed it.
   *
   * A select fires this with its value; a swatch or an alignment button fires
   * it with the value it stands for. Same path either way, so the two kinds of
   * control cannot drift in what they actually do.
   */
  function applyProp(id, prop, value, input) {
    var found = locate(id);
    if (!found) return;

    // A slice or a column is not an object: its settings are layout, and
    // every one of them changes the drawing, so the block is redrawn whole.
    if (found.isBlock) return applySliceProp(found.block, prop, value);
    if (found.isColumn) {
      /* Through `coerce` like everything else: a checkbox posts its `value`
         attribute whether it is ticked or not, so the Outline switch would
         have read "on" in both positions. */
      found.column[prop] = coerce(prop, value, input);
      /* Turning a column into a card seeds its padding, so text does not sit
         against the outline - and seeds it as a *stored* number, visible in
         the spacing fields and typeable back to 0. Applying it from the
         stylesheet instead is what made a slice's margin a gap the editor
         swore was zero. Only when nothing has been set yet: an author who has
         already chosen a padding meant it. */
      if ((prop === 'surface' || prop === 'border') && found.column[prop]) {
        var pad = found.column.style && found.column.style.padding;
        if (!pad || !Object.keys(pad).length) {
          found.column.style = found.column.style || {};
          found.column.style.padding = { top: CARD_PADDING, right: CARD_PADDING,
            bottom: CARD_PADDING, left: CARD_PADDING };
        }
      }
      markDirty();
      return render();
    }

    /* `rowSurfaces.2` addresses one entry of a list-valued prop: the colour of
       one row or one column. The list is grown as needed and never trimmed
       here - the server sizes it to the table on save, exactly as it does the
       cells - so shrinking a table and growing it back is not a way to lose a
       colour you set a moment ago. */
    var indexed = /^(rowSurfaces|colSurfaces)\.(\d+)$/.exec(prop);
    if (indexed) {
      var list = found.obj.props[indexed[1]] || (found.obj.props[indexed[1]] = []);
      var at = Number(indexed[2]);
      while (list.length <= at) list.push('');
      list[at] = String(value || '');
      prop = indexed[1];
    } else {
      found.obj.props[prop] = coerce(prop, value, input, found.obj.kind);
    }
    markDirty();
    if (prop === 'label') mirrorFieldName(found.obj);
    if (found.obj.kind === 'articles' && prop === 'order') feedOrderChanged(found.obj);
    // The map draws the table's shape and every colour on it, so it follows
    // both - and it is redrawn on its own, never by re-rendering the panel.
    if (found.obj.kind === 'table' && TABLE_BG_PROPS.indexOf(prop) >= 0) refreshTableBg(found.obj);
    if (VISUAL_PROPS.indexOf(prop) >= 0) refreshObject(found.obj.id);
  }

  /**
   * A random feed never loads more, so choosing Random switches that off and
   * takes "When there are more" out of the panel; Newest brings it back, set
   * to Nothing. The panel is redrawn only when the field has to come or go: a
   * select fires `input` and then `change`, and the second finds it already
   * right. Focus goes back to Order, so a keyboard user is where they were.
   */
  function feedOrderChanged(obj) {
    var random = obj.props.order === 'random';
    if (random) obj.props.more = 'none';
    if (!propsBody) return;
    var hasMore = !!propsBody.querySelector('[data-obj-field="' + obj.id + '"][data-prop="more"]');
    if (hasMore === !random) return;
    renderProperties();
    var order = propsBody.querySelector('[data-obj-field="' + obj.id + '"][data-prop="order"]');
    if (order) order.focus();
  }

  /* The question mark opens its own field's explanation and nothing else's,
     so asking a question costs one line rather than turning the panel back
     into a wall of prose. */
  function bindHints(root) {
    root.querySelectorAll('[data-hint]').forEach(function (dot) {
      dot.addEventListener('click', function () {
        var note = dot.closest('.field').querySelector('.field__hint');
        if (!note) return;
        note.hidden = !note.hidden;
        dot.setAttribute('aria-expanded', note.hidden ? 'false' : 'true');
        dot.classList.toggle('is-on', !note.hidden);
      });
    });
  }

  /* Buttons that stand for one value: alignment and the colour swatches.
     Re-rendering the panel would take the caret out of whatever is being
     typed, so only the pressed state is swapped. */
  function bindSetButtons(root) {
    root.querySelectorAll('[data-obj-set]').forEach(function (button) {
      button.addEventListener('click', function () {
        var group = button.closest('[data-set-group]');
        if (group) {
          group.querySelectorAll('[data-obj-set]').forEach(function (b) {
            b.classList.toggle('is-on', b === button);
            b.setAttribute('aria-pressed', b === button ? 'true' : 'false');
          });
        }
        applyProp(button.dataset.objSet, button.dataset.prop, button.dataset.value, null);
      });
    });
  }

  /* Aiming the colour picker at a row or a column. Only panel state changes,
     so the section is redrawn rather than the canvas. */
  function bindTableTargets(root) {
    root.querySelectorAll('[data-table-target]').forEach(function (button) {
      button.addEventListener('click', function () {
        var found = selectedId ? locate(selectedId) : null;
        if (!found || !found.obj || found.obj.kind !== 'table') return;
        var parts = button.dataset.tableTarget.split('|');
        tableTarget = { id: found.obj.id, axis: parts[0], index: Number(parts[1]) };
        refreshTableBg(found.obj);
      });
    });
  }

  /**
   * Redraw the Backgrounds section in place.
   *
   * In place because the row count sits in a text input just above it: a full
   * panel re-render would replace that input mid-keystroke, which is the bug
   * that made a slice's margin accept exactly one digit. Focus is carried
   * across by what a button stands for, so a keyboard user does not lose their
   * place when the map redraws under them.
   */
  function refreshTableBg(obj) {
    var host = propsBody.querySelector('[data-table-bg]');
    if (!host) return;
    var keyOf = function (el) {
      if (!el || !el.getAttribute) return '';
      if (el.hasAttribute('data-table-target')) return 'aim:' + el.getAttribute('data-table-target');
      if (el.hasAttribute('data-obj-set')) {
        return 'set:' + el.getAttribute('data-prop') + '/' + el.getAttribute('data-value');
      }
      return '';
    };
    var was = host.contains(document.activeElement) ? keyOf(document.activeElement) : '';
    host.innerHTML = tableBgHtml(obj);
    bindHints(host);
    bindSetButtons(host);
    bindTableTargets(host);
    if (!was) return;
    var buttons = host.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      if (keyOf(buttons[i]) === was) { buttons[i].focus(); return; }
    }
  }

  function bindProps() {
    bindHints(propsBody);
    bindSetButtons(propsBody);
    bindTableTargets(propsBody);

    /* Picking from the list fills the text field beside it, so the two can
       never disagree about what the link is; choosing "Custom link" reveals
       the field and leaves whatever is in it. */
    propsBody.querySelectorAll('[data-link-for]').forEach(function (picker) {
      var field = propsBody.querySelector('[data-obj-field="' + picker.dataset.linkFor + '"][data-prop="href"]');
      // The shipped options carry no selection, so match the stored value here.
      if (field) picker.value = field.value;
      picker.addEventListener('change', function () {
        if (!field) return;
        field.hidden = !!picker.value;
        if (picker.value) field.value = picker.value;
        applyProp(picker.dataset.linkFor, 'href', field.value, field);
      });
    });

    /* On seeds a name and stores it; off removes it. The panel redraws either
       way, because the fields under the switch change with it. */
    propsBody.querySelectorAll('[data-anchor-toggle]').forEach(function (box) {
      box.addEventListener('change', function () {
        var found = locate(box.dataset.anchorToggle);
        if (!found) return;
        var props = found.isBlock ? found.block.props : found.obj.props;
        props.anchor = box.checked ? suggestAnchor(found) : '';
        markDirty();
        renderProperties();
      });
    });

    /* Every step of the path selects that level, which is what makes a slice
       reachable without hunting for a bare patch of it to click. */
    propsBody.querySelectorAll('[data-crumb]').forEach(function (step) {
      step.addEventListener('click', function () { select(step.dataset.crumb); });
    });

    propsBody.querySelectorAll('[data-obj-field]').forEach(function (input) {
      var handler = function () {
        applyProp(input.dataset.objField, input.dataset.prop, input.value, input);
      };
      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
    });

    /* A checkbox that adds or removes one value from a list-valued prop. It
       reads the whole group rather than editing the stored array in place, so
       the order on the page is the order shown - and one stale checkbox
       cannot leave the two disagreeing. */
    /* Cleared and left, the name follows the label again - so the box says
       what it fell back to rather than sitting empty. On blur, not on input:
       refilling it the instant it is emptied is fighting whoever is typing. */
    propsBody.querySelectorAll('[data-obj-field][data-prop="name"]').forEach(function (box) {
      box.addEventListener('blur', function () {
        var found = locate(box.dataset.objField);
        if (found && found.obj && !found.obj.props.name) box.value = fieldSlug(found.obj.props.label);
      });
    });

    propsBody.querySelectorAll('[data-obj-toggle]').forEach(function (box) {
      box.addEventListener('change', function () {
        var prop = box.dataset.prop;
        var group = propsBody.querySelectorAll(
          '[data-obj-toggle="' + box.dataset.objToggle + '"][data-prop="' + prop + '"]');
        var values = [];
        group.forEach(function (b) { if (b.checked) values.push(parseInt(b.value, 10)); });
        applyProp(box.dataset.objToggle, prop, values, null);
      });
    });

    propsBody.querySelectorAll('[data-rich-cmd]').forEach(function (button) {
      // Same trick as the bar: without this the click takes the caret away
      // before the command can act on it.
      button.addEventListener('mousedown', function (e) { e.preventDefault(); });
      button.addEventListener('click', function () {
        if (CMS.applyRichCommand) CMS.applyRichCommand(button.dataset.richCmd);
      });
    });

    propsBody.querySelectorAll('[data-space]').forEach(function (input) {
      input.addEventListener('input', function () {
        var found = locate(selectedId);
        var owner = styleOwner(found);
        if (!owner) return;
        var parts = input.dataset.space.split('.');
        owner.style = owner.style || {};
        owner.style[parts[0]] = owner.style[parts[0]] || {};
        var n = parseInt(input.value, 10);
        if (Number.isFinite(n) && n !== 0) owner.style[parts[0]][parts[1]] = n;
        else delete owner.style[parts[0]][parts[1]];
        markDirty();

        /* Patched in place, never re-rendered. render() rebuilds the panel
           along with the canvas, which replaces the very input being typed
           into - so a slice's margin accepted exactly one digit and the
           second keystroke landed on <body>. Typing 50 got you 5. */
        var node = spacingNode(found);
        if (node) node.setAttribute('style', styleAttr(owner.style).replace(/^ style="|"$/g, ''));
        else render();
      });
    });

    var del = propsBody.querySelector('[data-props-delete]');
    if (del) {
      del.addEventListener('click', function () {
        if (!selectedId) return;
        removeById(selectedId);
        selectedId = null;
        markDirty();
        render();
      });
    }
  }

  /** Repaint one object without disturbing the rest of the canvas. */
  function refreshObject(id) {
    var node = canvas.querySelector('[data-object="' + id + '"]');
    var found = locate(id);
    if (!node || !found) return;
    var holder = document.createElement('div');
    holder.innerHTML = objectHtml(found.obj, Number(node.dataset.depth) || 0);
    var fresh = holder.firstChild;
    node.replaceWith(fresh);
    // Only the new node needs handlers. Binding the whole canvas again gave a
    // second set to everything that was not replaced - see bindCanvas.
    bindCanvas(fresh);
  }

  /* --------------------------------------------------------- canvas events */

  /**
   * Every element under `root` matching `selector`, and `root` itself when it
   * matches - a repainted object *is* the `.obj` its own handlers hang on.
   */
  function within(root, selector, fn) {
    if (root.matches && root.matches(selector)) fn(root);
    root.querySelectorAll(selector).forEach(fn);
  }

  /**
   * Give the canvas its handlers.
   *
   * Scoped to what was actually drawn. render() replaces the canvas whole and
   * passes nothing; refreshObject replaces one object and passes that node.
   * Binding the whole canvas after a repaint added a *second* copy of every
   * handler to every node that had survived it, and a third after the next
   * one - so six tweaks in the properties panel turned one click on Duplicate
   * into seven slices, one drop into seven objects, and Save as slice into
   * seven saved slices.
   */
  function bindCanvas(root) {
    root = root || canvas;
    // Plain-text editables write straight into the model.
    within(root, '[data-edit-text]', function (el) {
      if (el.dataset.bound === '1') return;
      el.dataset.bound = '1';
      var parts = el.dataset.editText.split('|');
      el.addEventListener('input', function () {
        var found = locate(parts[0]);
        if (!found) return;
        found.obj.props[parts[1]] = el.textContent;
        markDirty();
        // A field's label is typed here as often as in the panel, and both
        // the panel's copy and the name follow it either way.
        syncPanelProp(parts[0], parts[1], el.textContent);
        if (parts[1] === 'label') mirrorFieldName(found.obj);
      });
      el.addEventListener('focus', function () { select(parts[0]); });
      el.addEventListener('paste', function (event) {
        event.preventDefault();
        document.execCommand('insertText', false,
          (event.clipboardData || window.clipboardData).getData('text/plain'));
      });
      el.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); el.blur(); }
      });
    });

    within(root, '[data-obj-rich]', function (el) {
      el.dataset.rich = el.dataset.objRich;
      CMS.initRichEditor(el, document.querySelector('[data-toolbar]'));
      if (el.dataset.boundRich === '1') return;
      el.dataset.boundRich = '1';
      el.addEventListener('input', function () {
        var found = locate(el.dataset.objRich);
        if (found) { found.obj.props.html = el.innerHTML; markDirty(); }
      });
      el.addEventListener('focus', function () { select(el.dataset.objRich); });
    });

    // The image frame is the control.
    within(root, '[data-edit-media]', function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        var id = button.dataset.editMedia;
        select(id);
        CMS.pickMedia().then(function (item) {
          if (!item) return;
          var found = locate(id);
          if (!found) return;
          mediaMap[item.id] = item;
          found.obj.props.media = item.id;
          if (!found.obj.props.alt) found.obj.props.alt = item.alt || '';
          if (!found.obj.props.caption) found.obj.props.caption = item.caption || '';
          markDirty();
          refreshObject(id);
          renderProperties();
        });
      });
    });

    within(root, '[data-select-parent]', function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); selectParent(b.dataset.selectParent); });
    });
    within(root, '[data-move-up], [data-move-down]', function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var up = b.dataset.moveUp;
        moveBy(up || b.dataset.moveDown, up ? -1 : 1);
      });
    });
    within(root, '[data-duplicate]', function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); duplicate(b.dataset.duplicate); });
    });
    within(root, '[data-hide-slice]', function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); toggleHidden(b.dataset.hideSlice); });
    });
    within(root, '[data-save-slice]', function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); saveAsSlice(b.dataset.saveSlice); });
    });
    within(root, '[data-remove-object]', function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        removeById(b.dataset.removeObject);
        if (selectedId === b.dataset.removeObject) selectedId = null;
        markDirty();
        render();
      });
    });
    within(root, '[data-remove-block]', function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        removeById(b.dataset.removeBlock);
        markDirty();
        render();
      });
    });

    within(root, '.obj', function (node) {
      node.addEventListener('mousedown', function (event) {
        if (event.target.closest('.obj') !== node) return;
        select(node.dataset.object);
      });
    });
    /**
     * Selecting the box around the content, rather than the content.
     *
     * The browser's default for a mousedown near editable text is to hunt for
     * the closest caret position and focus whatever holds it - so clicking the
     * empty part of a slice that contains a heading blurred the heading,
     * selected the slice, and was then immediately undone when the heading
     * refocused itself and its focus handler re-selected it. The selection was
     * always right for about a millisecond.
     *
     * There is nothing to put a caret in out here, so the default is refused
     * and whatever holds one is let go of explicitly.
     */
    var takeSelection = function (event) {
      // Never over the slice's own controls: a drag handle needs the default
      // to start a drag, and a button needs it to take focus. Selecting the
      // slice as well is harmless, so only the default is left alone.
      if (event.target.closest('.chrome-tools, button, a, input, select, textarea')) return;
      event.preventDefault();
      var active = document.activeElement;
      if (active && active.isContentEditable) active.blur();
    };

    // A column is only worth selecting when there is more than one: with a
    // single column its box and the slice's are the same box, and offering two
    // ways to set the same padding would just be confusing.
    within(root, '.slice-col', function (col) {
      if (FLAT) return;
      col.addEventListener('mousedown', function (event) {
        if (event.target.closest('.obj')) return;
        var block = col.closest('.slice-block');
        if (!block || block.querySelectorAll('.slice-col').length < 2) return;
        event.stopPropagation();
        takeSelection(event);
        select(columnKey(block.dataset.block, Number(col.dataset.column)));
      });
    });
    within(root, '.slice-block', function (node) {
      if (FLAT) return;
      node.addEventListener('mousedown', function (event) {
        if (event.target.closest('.obj')) return;
        takeSelection(event);
        select(node.dataset.block);
      });
    });

    bindDragTargets(root);
  }

  function select(id) {
    if (selectedId === id) return;
    // Moving to anything that is not a rich-text body drops the caret, and the
    // formatting bar goes with it rather than lingering over the new target.
    var found = locate(id);
    if (!found || !found.obj || found.obj.kind !== 'text') {
      if (CMS.clearRichFocus) CMS.clearRichFocus();
    }
    selectedId = id;
    canvas.querySelectorAll('.obj, .slice-block').forEach(function (n) {
      n.classList.toggle('is-selected', n.dataset.object === id || n.dataset.block === id);
    });
    canvas.querySelectorAll('.slice-col').forEach(function (n) {
      var owner = n.closest('.slice-block');
      n.classList.toggle('is-selected',
        !!owner && columnKey(owner.dataset.block, Number(n.dataset.column)) === id);
    });
    renderProperties();
    if (id) showTab('props');
  }

  var hovered = null;
  function setHover(node) {
    if (hovered === node) return;
    if (hovered) hovered.classList.remove('is-hover');
    hovered = node;
    if (hovered) hovered.classList.add('is-hover');
  }
  canvas.addEventListener('mouseover', function (event) {
    var target = event.target.closest('.obj, .obj__col, .slice-block');
    setHover(target && canvas.contains(target) ? target : null);
  });
  canvas.addEventListener('mouseleave', function () { setHover(null); });

  function selectParent(id) {
    var node = canvas.querySelector('[data-object="' + id + '"]');
    if (!node) return;
    var parent = node.parentElement.closest('.obj, .slice-block');
    if (!parent) return;
    select(parent.dataset.object || parent.dataset.block);
    setHover(parent);
  }

  /* ------------------------------------------------------------ drag/drop */

  var dragPayload = null;

  /* ------------------------------------------------- library by keyboard */

  /**
   * The library can be driven without the mouse: click or arrow to a kind,
   * press Enter to place it. Dragging still works and is unchanged - this is
   * a second way in, for the same reason the canvas has both a drop target
   * and an "Add a block" button.
   */
  var libSelected = null;

  function libItems() {
    return Array.prototype.slice.call(
      document.querySelectorAll('[data-pane="blocks"] [data-object-kind]'))
      .filter(function (el) { return el.offsetParent !== null; });
  }

  function selectLibItem(item) {
    libItems().forEach(function (el) { el.classList.remove('is-selected'); });
    libSelected = item || null;
    if (!item) return;
    item.classList.add('is-selected');
    item.setAttribute('tabindex', '0');
    item.focus({ preventScroll: true });
    item.scrollIntoView({ block: 'nearest' });
  }

  function moveLibSelection(step) {
    var items = libItems();
    if (!items.length) return;
    var at = items.indexOf(libSelected);
    // No selection yet: down starts at the top, up starts at the bottom.
    var next = at < 0 ? (step > 0 ? 0 : items.length - 1) : at + step;
    selectLibItem(items[Math.max(0, Math.min(items.length - 1, next))]);
  }

  /**
   * Where a block placed from the library lands.
   *
   * Follows what is selected on the canvas, because that is what the author
   * is looking at: after the selected object, or at the end of the selected
   * column or slice, or - with nothing selected - in a new slice of its own.
   */
  function placeFromLibrary(kind) {
    var found = selectedId ? locate(selectedId) : null;

    if (kind === 'slice') {
      // A slice goes after the slice you are in, not inside it.
      var at = found ? blocks.indexOf(found.block) + 1 : blocks.length;
      var slice = newSlice([], '', at);
      blocks.splice(at, 0, slice);
      selectedId = slice.id;
      markDirty();
      render();
      return CMS.toast('Slice added.');
    }

    if (!accepts(kind)) return;
    var obj = blankObject(kind);

    /* Order matters: `locate` reports a slice as `{ isBlock: true, obj: block }`
       so that generic operations can treat one like an object, which means a
       plain `found.obj` check matches a selected *slice* and splices a bare
       object into the blocks array - a block with no columns, which the
       canvas then cannot draw at all. The specific cases go first. */
    if (found && found.isBlock) {
      found.block.columns[0].objects.push(obj);              // end of the slice
    } else if (found && found.isColumn) {
      found.column.objects.push(obj);                        // end of that column
    } else if (found && found.obj) {
      found.list.splice(found.index + 1, 0, obj);            // after the selection
    } else {
      blocks.push(newSlice([obj], '', blocks.length));       // a slice of its own
    }
    selectedId = obj.id;
    markDirty();
    render();
  }

  function bindPalette() {
    document.querySelectorAll('[data-object-kind]').forEach(function (item) {
      if (item.dataset.bound === '1') return;
      item.dataset.bound = '1';
      item.addEventListener('dragstart', function (event) {
        dragPayload = { source: 'library', kind: item.dataset.objectKind };
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/plain', item.dataset.objectKind);
      });
      item.addEventListener('dragend', function () { dragPayload = null; clearDropMarks(); });
      item.addEventListener('click', function () { selectLibItem(item); });
      item.addEventListener('dblclick', function () { placeFromLibrary(item.dataset.objectKind); });
    });
  }

  /**
   * Arrow keys move through the library, Enter places what is selected.
   *
   * Ignored while the caret is in text, where those keys already mean
   * something the author would rather they kept meaning.
   */
  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var el = document.activeElement;
    var typing = el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));
    if (typing || CMS.hasRichFocus()) return;
    if (document.querySelector('.overlay')) return;          // a dialog is open

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!libSelected && !document.querySelector('[data-pane="blocks"]:not([hidden])')) return;
      event.preventDefault();
      moveLibSelection(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter' && libSelected) {
      event.preventDefault();
      placeFromLibrary(libSelected.dataset.objectKind);
      return;
    }
    if (event.key === 'Escape' && libSelected) selectLibItem(null);
  });

  function clearDropMarks() {
    canvas.classList.remove('is-over');
    canvas.querySelectorAll('.is-over').forEach(function (n) { n.classList.remove('is-over'); });
    canvas.querySelectorAll('.is-drop-before, .is-drop-after').forEach(function (n) {
      n.classList.remove('is-drop-before', 'is-drop-after');
    });
  }

  /** Drag handles and drop targets, over the same root bindCanvas was given. */
  function bindDragTargets(root) {
    within(root, '[data-obj-handle]', function (bar) {
      var node = bar.closest('.obj');
      bar.addEventListener('dragstart', function (event) {
        dragPayload = { source: 'move', id: node.dataset.object };
        node.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', node.dataset.object);
      });
      bar.addEventListener('dragend', function () {
        node.classList.remove('is-dragging');
        dragPayload = null;
        clearDropMarks();
      });
    });

    within(root, '[data-block-handle]', function (bar) {
      var node = bar.closest('[data-block]');
      bar.addEventListener('dragstart', function (event) {
        dragPayload = { source: 'moveBlock', id: node.dataset.block };
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', node.dataset.block);
      });
      bar.addEventListener('dragend', function () { dragPayload = null; clearDropMarks(); });
    });

    /* The slice's own padding ring is inside the outline the hover state
       draws, so a drop there has to land somewhere sensible rather than
       falling through to the canvas and making a new slice. It routes to the
       column nearest the cursor. */
    within(root, '.slice-block', function (node) {
      node.addEventListener('dragover', function (event) {
        if (!dragPayload || event.target.closest('.slice-col')) return;
        event.preventDefault();
        event.stopPropagation();
        if (draggingSlice()) return markSliceInsertion(event.clientY);
        var col = nearestColumn(node, event.clientX);
        if (col) { col.classList.add('is-over'); markInsertion(col, event.clientY); }
      });
      node.addEventListener('drop', function (event) {
        if (!dragPayload || event.target.closest('.slice-col')) return;
        event.preventDefault();
        event.stopPropagation();
        if (draggingSlice()) return dropSliceAt(event.clientY);
        var col = nearestColumn(node, event.clientX);
        clearDropMarks();
        if (col) dropIntoColumn(col.dataset.owner, Number(col.dataset.column),
          insertionIndex(col, event.clientY));
      });
    });

    within(root, '[data-cell]', function (cell) {
      cell.addEventListener('dragover', function (event) {
        if (!dragPayload) return;
        event.preventDefault();
        event.stopPropagation();
        if (draggingSlice()) return markSliceInsertion(event.clientY);
        cell.classList.add('is-over');
        markInsertion(cell, event.clientY);
      });
      cell.addEventListener('dragleave', function () { cell.classList.remove('is-over'); });
      cell.addEventListener('drop', function (event) {
        if (!dragPayload) return;
        event.preventDefault();
        event.stopPropagation();
        if (draggingSlice()) return dropSliceAt(event.clientY);
        var at = insertionIndex(cell, event.clientY);
        clearDropMarks();
        var parts = cell.dataset.cell.split('|');
        dropIntoCell(parts[0], Number(parts[1]), Number(parts[2]), at);
      });
      // Clicking the empty hint starts a text block, so typing still works.
      var hint = cell.querySelector('.table-cell__empty');
      if (hint) {
        hint.addEventListener('mousedown', function (event) {
          event.preventDefault();
          event.stopPropagation();
          var parts = cell.dataset.cell.split('|');
          addToCell(parts[0], Number(parts[1]), Number(parts[2]), blankObject('text'), true);
        });
      }
    });

    within(root, '.slice-col, .obj__col', function (col) {
      col.addEventListener('dragover', function (event) {
        if (!dragPayload) return;
        event.preventDefault();
        event.stopPropagation();
        if (draggingSlice()) return markSliceInsertion(event.clientY);
        col.classList.add('is-over');
        markInsertion(col, event.clientY);
      });
      col.addEventListener('dragleave', function () { col.classList.remove('is-over'); });
      col.addEventListener('drop', function (event) {
        if (!dragPayload) return;
        event.preventDefault();
        event.stopPropagation();
        if (draggingSlice()) return dropSliceAt(event.clientY);
        var at = insertionIndex(col, event.clientY);
        clearDropMarks();
        dropIntoColumn(col.dataset.owner, Number(col.dataset.column), at);
      });
    });
  }

  /**
   * A slice is the one payload a column cannot take.
   *
   * A column holds objects and a slice holds columns, so one aimed at a
   * column means "beside the slice this column is in" - there is nowhere
   * else it could mean. Both shapes count: a saved slice from the library,
   * and the empty Slice in the palette.
   *
   * Nothing routed it before, so `dropIntoColumn` fell through every branch
   * it has and returned - a saved slice dropped anywhere over existing
   * content did nothing at all, silently, and the only place it landed was
   * the bare canvas between blocks. The palette's Slice was worse: it passed
   * for an object, and `blankObject('slice')` spliced a bare `kind: 'slice'`
   * into the column, which the canvas drew as an empty box and the server
   * dropped on the next save.
   *
   * FLAT has neither in its palette, and a form cannot hold a slice anyway.
   */
  function draggingSlice() {
    if (!dragPayload || FLAT) return false;
    return dragPayload.source === 'slice'
      || (dragPayload.source === 'library' && dragPayload.kind === 'slice');
  }

  /** Where a slice aimed at `y` lands, and the marks that say so. */
  function dropSliceAt(y) {
    var at = sliceInsertionIndex(y);
    clearDropMarks();
    dropIntoCanvas(at);
  }

  /** The column of a slice whose horizontal band the cursor is closest to. */
  function nearestColumn(sliceNode, x) {
    var cols = [].slice.call(sliceNode.querySelectorAll('.slice-col'));
    if (!cols.length) return null;
    var best = cols[0];
    var bestGap = Infinity;
    cols.forEach(function (col) {
      var r = col.getBoundingClientRect();
      var gap = x < r.left ? r.left - x : (x > r.right ? x - r.right : 0);
      if (gap < bestGap) { bestGap = gap; best = col; }
    });
    return best;
  }

  /**
   * Where a drop would land inside a column: the number of objects whose
   * midpoint the cursor is already past.
   */
  function insertionIndex(container, y) {
    var kids = [].slice.call(container.children).filter(function (n) {
      return n.classList.contains('obj');
    });
    for (var i = 0; i < kids.length; i++) {
      var r = kids[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return kids.length;
  }

  /** Draw the line showing where the drop will go. */
  function markInsertion(container, y) {
    canvas.querySelectorAll('.is-drop-before, .is-drop-after').forEach(function (n) {
      n.classList.remove('is-drop-before', 'is-drop-after');
    });
    var kids = [].slice.call(container.children).filter(function (n) {
      return n.classList.contains('obj');
    });
    if (!kids.length) return;
    var at = insertionIndex(container, y);
    if (at >= kids.length) kids[kids.length - 1].classList.add('is-drop-after');
    else kids[at].classList.add('is-drop-before');
  }

  /**
   * Clicking the page outside any block clears the selection. Without it the
   * editor always has something selected and the properties panel always
   * shows settings for it, with no way to put it down.
   *
   * Bound to the scrolling pane rather than the canvas, so the empty space
   * around the blocks counts as outside. The toolbar and the block chrome are
   * excluded: they act on the selection and must not cancel it first.
   */
  var centre = canvas.closest('.cms-center__scroll') || canvas;
  centre.addEventListener('mousedown', function (event) {
    if (event.target.closest('.slice-block, [data-toolbar], .chrome-tools, .dialog')) return;
    select(null);
  });

  /**
   * The canvas's own padding is a drop target, so that something can be added
   * after the last block - there has to be somewhere below it to point at.
   *
   * A flat canvas has one column and no slices to sit between, so that strip
   * belongs to the list rather than to the page: it drops into the column at
   * the end, instead of making a slice a form cannot have.
   */
  function flatColumn() { return FLAT ? canvas.querySelector('.slice-col') : null; }

  canvas.addEventListener('dragover', function (event) {
    if (!dragPayload) return;
    event.preventDefault();
    var flat = flatColumn();
    if (flat) { flat.classList.add('is-over'); markInsertion(flat, event.clientY); return; }
    canvas.classList.add('is-over');
    markSliceInsertion(event.clientY);
  });
  canvas.addEventListener('dragleave', function (event) {
    if (event.target === canvas) clearDropMarks();
  });
  canvas.addEventListener('drop', function (event) {
    if (!dragPayload) return;
    event.preventDefault();
    var flat = flatColumn();
    if (flat) {
      var into = insertionIndex(flat, event.clientY);
      clearDropMarks();
      dropIntoColumn(flat.dataset.owner, Number(flat.dataset.column), into);
      return;
    }
    var at = sliceInsertionIndex(event.clientY);
    clearDropMarks();
    dropIntoCanvas(at);
  });

  /** Which gap between slices the cursor is over. */
  function sliceInsertionIndex(y) {
    var nodes = [].slice.call(canvas.querySelectorAll('[data-block]'));
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return nodes.length;
  }

  function markSliceInsertion(y) {
    canvas.querySelectorAll('.is-drop-before, .is-drop-after').forEach(function (n) {
      n.classList.remove('is-drop-before', 'is-drop-after');
    });
    var nodes = [].slice.call(canvas.querySelectorAll('[data-block]'));
    if (!nodes.length) return;
    var at = sliceInsertionIndex(y);
    if (at >= nodes.length) nodes[nodes.length - 1].classList.add('is-drop-after');
    else nodes[at].classList.add('is-drop-before');
  }

  /** The objects of one cell, creating the row and cell arrays as needed. */
  function cellList(tableId, r, c) {
    var found = locate(tableId);
    if (!found || !found.obj || found.obj.kind !== 'table') return null;
    var cells = found.obj.props.cells || (found.obj.props.cells = []);
    while (cells.length <= r) cells.push([]);
    while (cells[r].length <= c) cells[r].push([]);
    if (!Array.isArray(cells[r][c])) cells[r][c] = [];
    return cells[r][c];
  }

  function addToCell(tableId, r, c, obj, focus) {
    var list = cellList(tableId, r, c);
    if (!list) return;
    list.push(obj);
    selectedId = obj.id;
    markDirty();
    render();
    if (focus) {
      var el = canvas.querySelector('[data-obj-rich="' + obj.id + '"]');
      if (el) el.focus();
    }
  }

  /** A table cell takes anything a column would, apart from another table. */
  function dropIntoCell(tableId, r, c, at) {
    var payload = dragPayload;
    dragPayload = null;
    if (!payload) return;
    var list = cellList(tableId, r, c);
    if (!list) return;

    /* A cell takes anything a column would, apart from another table. */
    var takes = function (kind) {
      if (kind === 'table') { CMS.toast('A table cannot hold another table.', 'error'); return false; }
      return accepts(kind);
    };
    var index = typeof at === 'number' ? Math.max(0, Math.min(at, list.length)) : list.length;

    if (payload.source === 'library') {
      if (!takes(payload.kind)) return;
      var obj = blankObject(payload.kind);
      list.splice(index, 0, obj);
      selectedId = obj.id;
      markDirty();
      render();
      return;
    }
    if (payload.source === 'move') {
      var found = locate(payload.id);
      if (!found || !found.obj || !takes(found.obj.kind)) return;
      var moving = found.obj;
      var sameList = found.list === list;
      var from = found.list.indexOf(moving);
      removeById(payload.id);
      if (sameList && from < index) index -= 1;
      list.splice(Math.max(0, Math.min(index, list.length)), 0, moving);
      selectedId = moving.id;
      markDirty();
      render();
    }
  }

  /**
   * A fresh one-column slice around some objects.
   *
   * It inherits the band - background and content width - of the slice above
   * it, because a page reads as one design when its sections line up, and
   * re-setting the width on every slice is the tax for not doing this. The
   * layout is deliberately *not* inherited: a new slice is added to hold
   * different content, and a stale four-column split is more work to undo
   * than a background is to change.
   */
  /**
   * What a new slice is spaced by.
   *
   * A stored number rather than a rule in the stylesheet, because the panel
   * has to be able to tell the truth about it. Every slice used to be given
   * 56px by blocks.css while its margin fields read 0 - so a page had a gap
   * nobody had asked for and nothing in the editor could be set to remove it.
   * Seeded here, it shows up in the spacing fields, draws on the canvas, and
   * can be typed down to 0 for a page whose bands should run together.
   */
  var NEW_SLICE_MARGIN = 50;

  function newSlice(objects, name, at) {
    var above = blocks[(at == null ? blocks.length : at) - 1];
    var band = above && above.props
      ? { container: above.props.container, surface: above.props.surface }
      : { container: 'body', surface: '' };
    return {
      type: 'slice', id: uid(), sliceId: null, name: name || '',
      props: {
        ratio: 'full', gap: 'medium', width: 'full',
        container: band.container || 'body', surface: band.surface || '',
        // Never inherited: two sections cannot share one address.
        anchor: '',
      },
      style: { margin: { bottom: NEW_SLICE_MARGIN }, padding: {} },
      columns: [{ align: 'left', valign: 'top', style: { padding: {} }, objects: objects || [] }],
    };
  }

  function dropIntoCanvas(index) {
    var payload = dragPayload;
    dragPayload = null;
    if (!payload) return;

    if (payload.source === 'library') {
      // Slice is in the same list but is not an object: it is the thing the
      // objects go into, so dropping one adds an empty one to fill.
      if (payload.kind === 'slice') {
        var fresh = newSlice([], '', index);
        blocks.splice(index, 0, fresh);
        selectedId = fresh.id;
        markDirty();
        render();
        return;
      }
      if (!accepts(payload.kind)) return;
      // An object dropped on the canvas gets a slice of its own: a page is a
      // stack of slices, so there is nowhere else for it to live.
      var obj = blankObject(payload.kind);
      blocks.splice(index, 0, newSlice([obj], '', index));
      selectedId = obj.id;
      markDirty();
      render();
      return;
    }
    if (payload.source === 'slice') {
      CMS.getJson('/cms/api/slices/' + payload.id).then(function (slice) {
        Object.keys(slice.media || {}).forEach(function (k) { mediaMap[k] = slice.media[k]; });
        blocks.splice(index, 0, sliceBlockFrom(slice));
        markDirty();
        render();
      }).catch(function (err) { CMS.toast(err.message, 'error'); });
      return;
    }
    if (payload.source === 'move') {
      var found = locate(payload.id);
      if (!found || !found.obj) return;
      var moving = found.obj;
      if (!accepts(moving.kind)) return;
      removeById(payload.id);
      var at = Math.min(index, blocks.length);
      blocks.splice(at, 0, newSlice([moving], '', at));
      markDirty();
      render();
      return;
    }
    if (payload.source === 'moveBlock') {
      var from = blocks.findIndex(function (b) { return b.id === payload.id; });
      if (from < 0) return;
      var moved = blocks.splice(from, 1)[0];
      var to = from < index ? index - 1 : index;
      blocks.splice(Math.max(0, Math.min(to, blocks.length)), 0, moved);
      markDirty();
      render();
    }
  }

  /**
   * Drop into a column. `ownerId` is a slice for its own columns, or a form
   * object for its field slot. A form has no slot any more - it is written on
   * its own screen - so a column is a column wherever it is.
   */
  function dropIntoColumn(ownerId, columnIndex, at) {
    var payload = dragPayload;
    dragPayload = null;
    if (!payload) return;

    var owner = locate(ownerId);
    if (!owner) return;
    var target = (owner.block && owner.block.columns[columnIndex] || {}).objects;
    if (!target) return;

    var index = typeof at === 'number' ? Math.max(0, Math.min(at, target.length)) : target.length;

    if (payload.source === 'library') {
      if (!accepts(payload.kind)) return;
      var obj = blankObject(payload.kind);
      target.splice(index, 0, obj);
      selectedId = obj.id;
      markDirty();
      render();
      return;
    }
    if (payload.source === 'move') {
      var found = locate(payload.id);
      if (!found || !found.obj || !accepts(found.obj.kind)) return;
      var moving = found.obj;
      // Moving within one column shifts the target once the object is gone.
      var sameList = found.list === target;
      var from = found.list.indexOf(moving);
      removeById(payload.id);
      if (sameList && from < index) index -= 1;
      target.splice(Math.max(0, Math.min(index, target.length)), 0, moving);
      selectedId = moving.id;
      markDirty();
      render();
    }
  }

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;
    if (!selectedId) return;
    // `event.target` is the document itself when nothing is focused, and a
    // document has no .matches - which threw here and took the shortcut
    // with it. A non-element target is not a text field, so carry on.
    var target = event.target;
    if (target && target.matches && target.matches('input, textarea, select, [contenteditable]')) return;
    event.preventDefault();
    removeById(selectedId);
    selectedId = null;
    markDirty();
    render();
  });

  /* --------------------------------------------------------- add dialogue */

  var addButton = document.querySelector('[data-add-block]');
  if (addButton) {
    addButton.addEventListener('click', function () {
      var sliceItems = (DATA.slices || []).map(function (s) {
        return '<button class="lib__item" type="button" data-add-slice="' + s.id + '" style="width:100%">'
          + sliceIcon() + '<span>' + esc(s.name) + '</span></button>';
      }).join('');
      /* Built from the list the server ships, which is the same one the
         right-hand palette is rendered from - so this cannot offer an object
         the palette refuses and the server would strip back out on save.
         Form fields used to be filtered out here, from when they could only
         live inside a Form container; on the form screen they are the whole
         point of the button. */
      var kinds = (DATA.objectKinds || Object.keys(OBJECTS))
        .filter(function (k) { return !!OBJECTS[k]; });
      var objectItems = kinds.map(function (kind) {
        return '<button class="lib__item" type="button" data-add-object="' + kind + '" style="width:100%">'
          + '<span>' + esc(OBJECTS[kind].label) + '</span></button>';
      }).join('');

      /* A flat canvas holds no bands, so it is offered none: no empty slice
         and no saved ones, and the heading says what this actually adds. */
      var overlay = CMS.showDialog(
        '<div class="spread" style="margin-bottom:var(--ui-s-4)">'
        + '<h2>' + (FLAT ? 'Add to the form' : 'Add to page') + '</h2>'
        + '<button class="icon-btn" type="button" data-cancel aria-label="Close">✕</button></div>'
        + '<div class="dialog__body">'
        /* An empty slice, first and on its own, exactly as the palette has it.
           It was missing here entirely - so the one button at the foot of a
           long page, the button you reach for precisely when the canvas has
           run out of room to drop into, could add anything except the thing a
           page is made of. */
        + (FLAT ? '' : '<div class="lib" style="margin-bottom:var(--ui-s-5)">'
          + '<button class="lib__item lib__item--slice" type="button" data-add-empty-slice style="width:100%">'
          + sliceIcon() + '<span>Slice</span></button></div>')
        + (!FLAT && sliceItems ? '<h3 class="h-section" style="margin-bottom:var(--ui-s-2)">Saved slices</h3>'
          + '<div class="lib" style="margin-bottom:var(--ui-s-5)">' + sliceItems + '</div>' : '')
        + (FLAT ? '' : '<h3 class="h-section" style="margin-bottom:var(--ui-s-2)">Blocks</h3>')
        + '<div class="lib">' + objectItems + '</div></div>',
        { className: 'dialog--form' });

      overlay.querySelectorAll('[data-add-empty-slice]').forEach(function (button) {
        button.addEventListener('click', function () {
          var slice = newSlice([], '', blocks.length);
          blocks.push(slice);
          // Selected, so the thing just added is the thing being worked in -
          // the same reason an empty page opens with its slice selected.
          selectedId = slice.id;
          CMS.closeDialog();
          markDirty();
          render();
        });
      });

      overlay.querySelectorAll('[data-add-object]').forEach(function (button) {
        button.addEventListener('click', function () {
          var obj = blankObject(button.dataset.addObject);
          // A page is a stack of slices, so an object added here needs one of
          // its own - pushing a bare object left the canvas with a block it
          // could not draw, and only the server's normalise ever fixed it.
          blocks.push(newSlice([obj], '', blocks.length));
          selectedId = obj.id;
          CMS.closeDialog();
          markDirty();
          render();
        });
      });
      overlay.querySelectorAll('[data-add-slice]').forEach(function (button) {
        button.addEventListener('click', function () {
          CMS.getJson('/cms/api/slices/' + button.dataset.addSlice).then(function (slice) {
            Object.keys(slice.media || {}).forEach(function (k) { mediaMap[k] = slice.media[k]; });
            blocks.push(sliceBlockFrom(slice));
            CMS.closeDialog();
            markDirty();
            render();
          }).catch(function (err) { CMS.toast(err.message, 'error'); });
        });
      });
    });
  }

  /* --------------------------------------------------------- save a slice */

  function saveAsSlice(id) {
    var found = locate(id);
    if (!found || !found.isBlock) return;
    var block = found.block;
    var objects = block.columns.reduce(function (all, c) { return all.concat(c.objects); }, []);
    if (!objects.length) return CMS.toast('This slice is empty.', 'error');

    var origin = block.sliceId
      ? (DATA.slices || []).filter(function (s) { return s.id === block.sliceId; })[0]
      : null;
    var suggested = block.name || (OBJECTS[objects[0].kind] || {}).label || 'New slice';

    var overlay = CMS.showDialog(
      '<h2>Save as slice</h2>'
      + '<p class="dialog__note" style="font-style:normal">It will appear under <strong>Saved</strong> '
      + 'and can be dragged onto any page.</p>'
      + '<div class="field"><label for="slice-name">Name</label>'
      + '<input id="slice-name" type="text" value="' + esc(origin ? origin.name : suggested) + '" autofocus></div>'
      + (origin
        ? '<div class="field"><label class="check"><input type="checkbox" data-overwrite checked>'
          + '<span>Update “' + esc(origin.name) + '” instead of creating a new one</span></label></div>'
        : '')
      + '<div class="dialog__actions" style="margin-top:var(--ui-s-4)">'
      + '<button class="btn" type="button" data-cancel>Cancel</button>'
      + '<button class="btn btn--accent grow" type="button" data-confirm>Save</button></div>',
      { className: 'dialog--form' });

    overlay.querySelector('[data-confirm]').addEventListener('click', function () {
      var name = overlay.querySelector('#slice-name').value.trim();
      if (!name) return CMS.toast('Give the slice a name.', 'error');
      var overwrite = overlay.querySelector('[data-overwrite]');
      // The whole slice is the definition now - its layout as much as its
      // contents - so the saved copy reproduces the arrangement, not just a
      // list of objects.
      var payload = {
        name: name,
        definition: { props: block.props, style: block.style, columns: block.columns },
      };
      if (origin && overwrite && overwrite.checked) payload.id = origin.id;

      CMS.postForm('/cms/api/slices', payload).then(function (res) {
        CMS.closeDialog();
        CMS.toast(res.updated ? 'Slice updated' : 'Slice saved');
        block.sliceId = res.id;
        block.name = res.name;
        refreshSavedTab();
        render();
      }).catch(function (err) { CMS.toast(err.message, 'error'); });
    });
    overlay.querySelector('#slice-name').select();
  }

  function refreshSavedTab() {
    var host = panel && panel.querySelector('[data-slice-lib]');
    if (!host) return;
    CMS.getJson('/cms/api/slices').then(function (data) {
      DATA.slices = data.items;
      host.innerHTML = data.items.length
        ? data.items.map(function (s) {
          return '<div class="lib__item lib__item--saved" draggable="true" data-slice-id="' + s.id + '">'
            + sliceIcon() + '<span class="grow truncate">' + esc(s.name) + '</span>'
            + '<button class="icon-btn icon-btn--danger" type="button" data-delete-saved-slice="' + s.id + '"'
            + ' data-title="' + esc(s.name) + '" data-usage="' + s.usage + '" title="Delete slice">'
            + trashIcon() + '</button></div>';
        }).join('')
        : '<p class="tiny muted">No saved slices yet.</p>';
      bindSavedTab();
    }).catch(function (err) { CMS.toast(err.message, 'error'); });
  }

  function bindSavedTab() {
    if (!panel) return;
    panel.querySelectorAll('[data-slice-id]').forEach(function (item) {
      if (item.dataset.bound === '1') return;
      item.dataset.bound = '1';
      item.addEventListener('dragstart', function (event) {
        dragPayload = { source: 'slice', id: item.dataset.sliceId };
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/plain', 'slice:' + item.dataset.sliceId);
      });
      item.addEventListener('dragend', function () { dragPayload = null; clearDropMarks(); });
    });

    panel.querySelectorAll('[data-delete-saved-slice]').forEach(function (button) {
      if (button.dataset.bound === '1') return;
      button.dataset.bound = '1';
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        var id = button.dataset.deleteSavedSlice;
        var used = Number(button.dataset.usage || 0);
        var overlay = CMS.confirmDelete({
          title: 'Delete saved slice:',
          subject: button.dataset.title,
          meta: used ? used + ' page(s) use it' : 'Unused',
          action: '/cms/slices/' + id + '/delete',
          warning: used ? { text: used + ' page(s) use this slice. Content already placed is unaffected.' } : null,
        });
        overlay.querySelector('form').addEventListener('submit', function (e) {
          e.preventDefault();
          fetch('/cms/slices/' + id + '/delete', { method: 'POST', headers: { Accept: 'application/json' } })
            .then(function () {
              CMS.closeDialog();
              CMS.toast('Slice deleted');
              refreshSavedTab();
            })
            .catch(function (err) { CMS.toast(err.message, 'error'); });
        });
      });
    });
  }

  /* ---------------------------------------------------------------- save */

  /**
   * Save the draft, and optionally take the extra step.
   *
   * `status` null is the autosave: blocks reach `draft_content` and nothing
   * else moves. 'published' also copies the draft across to what is live;
   * 'draft' takes the page down without touching either copy's contents;
   * 'scheduled' keeps a copy to publish at `extra.publish_at`, and
   * 'unscheduled' calls that off. Resolves true once the server has it.
   */
  var SAVED_TOASTS = {
    published: 'Published',
    draft: 'Taken down. What was live is kept.',
    scheduled: 'Scheduled',
    unscheduled: 'Schedule removed',
  };

  function save(status, extra, message) {
    clearTimeout(saveTimer);
    var payload = { blocks: blocks };
    if (status) payload.status = status;
    Object.keys(extra || {}).forEach(function (key) { payload[key] = extra[key]; });
    var hadSchedule = !!DATA.scheduledAt;
    /* Every page-level setting travels with the blocks, so a thing that is
       not on the canvas - the page type, the sub menu, the password - is
       saved by the same autosave rather than needing a Save of its own. */
    document.querySelectorAll('[data-page-field]').forEach(function (el) {
      var key = el.dataset.pageField;
      /* A set of checkboxes under one name answers with a list of what is
         ticked. Without this the last box on the screen decided the whole
         answer, and it answered true or false. */
      if (el.type === 'checkbox' && el.dataset.multi !== undefined) {
        if (!Array.isArray(payload[key])) payload[key] = [];
        if (el.checked) payload[key].push(el.value);
        return;
      }
      payload[key] = el.type === 'checkbox' ? el.checked : el.value;
    });
    /* The form screen's own settings - recipient, subject, what the button
       says - ride along the same way. A different attribute because they are
       not fields of a page; the same idea because it is the same idea. */
    document.querySelectorAll('[data-form-field]').forEach(function (el) {
      payload[el.dataset.formField] = el.type === 'checkbox' ? el.checked : el.value;
    });
    var chosen = document.querySelector('[data-colour-group] .swatch-pick.is-on');
    if (chosen) payload.colour = chosen.dataset.colour;

    setState('Saving…', 'busy');
    var seq = ++requestSeq;
    return CMS.postForm(DATA.saveUrl, payload).then(function (res) {
      dirty = false;
      setSaved(res.savedAt);
      /* Publishing changes which buttons belong here, and the server still
         decides that - it hands back the bar it would have rendered. This
         used to reload the page to find out, which threw the writer back to
         the top of a long document every time they published. */
      if (isCurrent(seq)) applyState(res);

      /* A date the server would not take - one in the future, or not a date
         at all - goes back to the one it kept, and says why. Everything else
         in the save went through, publishing included. */
      if (res.dateRefused) {
        var dateField = document.querySelector('[data-page-field="published_on"]');
        if (dateField && isCurrent(seq)) dateField.value = res.publishedOn || '';
        CMS.toast(res.dateRefused, 'error');
        return true;
      }

      var said = message || SAVED_TOASTS[status];
      /* Publishing now and taking a page down both call a schedule off,
         which is right but not obvious - so it is said. */
      if (hadSchedule && (status === 'published' || status === 'draft')) {
        said = said.replace(/\.?$/, '. The schedule is removed.');
      }
      if (said) CMS.toast(said);
      return true;
    }).catch(function (err) {
      setState('Could not save', 'error');
      CMS.toast(err.message, 'error');
      return false;
    });
  }

  /**
   * A published or scheduled address is frozen; taking the page down, or
   * calling its schedule off, unfreezes it. `address` is the server's word
   * for which: 'live', 'scheduled' or 'free'.
   *
   * The server renders the fields disabled or not, which was right until the
   * page could change status without reloading - press Unpublish and the two
   * address fields stayed dimmed, saying the address was fixed when it had
   * just stopped being. The state lives in the DOM either way; this is the
   * one place that has to move it when the status moves.
   */
  var ADDRESS_HINTS = { live: 'hintLive', scheduled: 'hintScheduled', free: 'hintFree' };

  function setAddressState(address) {
    var frozen = address !== 'free';
    var shown = document.querySelector('[data-page-address]');
    if (shown && DATA.permalink) shown.textContent = DATA.permalink;
    /* Every control that decides an address carries the hook and its own
       hints, so this stays one function across two screens that word the same
       state differently - a page sits under a page, an article lives under
       one. `{address}` is filled from the save, which is the only place that
       knows what the address became. */
    document.querySelectorAll('[data-address-field]').forEach(function (el) {
      el.disabled = frozen;
      var field = el.closest('.field');
      var hint = field && field.querySelector('.field__hint');
      var text = el.dataset[ADDRESS_HINTS[address] || 'hintFree'];
      if (hint && text) hint.textContent = text.replace('{address}', DATA.permalink || '');
    });
  }

  /* Delegated, because the action bar is replaced whole after a publish and a
     handler bound to the old buttons would go down with them. */
  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('[data-save]');
    if (button) save(button.dataset.save);
  });

  /* Throw the draft away and go back to what is live - or, while something
     is scheduled, to the scheduled copy, which is the version last committed
     to. This is the undo that autosave takes away, so it is the one
     destructive button that matters. */
  document.addEventListener('click', function (event) {
    var trigger = event.target.closest && event.target.closest('[data-discard]');
    if (!trigger) return;
    var back = trigger.dataset.discard === 'scheduled'
      ? 'since this was scheduled and goes back to the version that is scheduled.'
      : 'since this was last published and goes back to what is live now.';
    var overlay = CMS.showDialog(
      '<h2>Discard changes?</h2>'
      + '<p class="dialog__note">Throws away every edit made ' + back + ' This cannot be undone.</p>'
      + '<div class="dialog__actions">'
      + '<button class="btn" type="button" data-cancel>Keep editing</button>'
      + '<button class="btn btn--danger grow" type="button" data-confirm>Discard</button>'
      + '</div>');
    overlay.querySelector('[data-confirm]').addEventListener('click', function () {
      clearTimeout(saveTimer);
      var seq = ++requestSeq;
      CMS.postForm(DATA.saveUrl + '/discard', {}).then(function (res) {
        CMS.closeDialog();
        dirty = false;
        /* The title, the description and the rest are plain fields that
           nothing redraws, and the next autosave sends whatever they hold -
           so when a discard put any of them back, the thrown-away values would
           return with the next keystroke. Those need the page fetched again. */
        if (res.settingsReset) return reloadInPlace('Changes discarded');
        /* Otherwise redrawn rather than reloaded, for the same reason
           publishing is: discarding on a long document should not also lose
           your place. */
        blocks = res.blocks || [];
        selectedId = null;
        render();
        setSaved(res.savedAt);
        if (isCurrent(seq)) applyState(res);
        CMS.toast('Changes discarded');
      }).catch(function (err) { CMS.toast(err.message, 'error'); });
    });
  });

  /**
   * Reload without losing your place: where the page was scrolled to, and
   * what to say once it is back, ride across in sessionStorage. Below the
   * narrow breakpoint the window scrolls rather than the centre pane, so
   * both are kept.
   */
  var RETURN_KEY = 'cms-editor-return';
  var scrollPane = canvas.closest('.cms-center__scroll');

  function reloadInPlace(message) {
    try {
      sessionStorage.setItem(RETURN_KEY, JSON.stringify({
        path: location.pathname,
        pane: scrollPane ? scrollPane.scrollTop : 0,
        page: window.scrollY,
        message: message,
      }));
    } catch (e) { /* storage refused: it still reloads, from the top */ }
    location.reload();
  }

  function returnToPlace() {
    var saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(RETURN_KEY) || 'null');
      sessionStorage.removeItem(RETURN_KEY);
    } catch (e) { return; }
    if (!saved || saved.path !== location.pathname) return;
    if (scrollPane) scrollPane.scrollTop = saved.pane || 0;
    window.scrollTo(0, saved.page || 0);
    if (saved.message) CMS.toast(saved.message);
  }

  /**
   * Schedule: pick the minute, and the draft as it is now goes live then.
   *
   * The same dialogue edits a schedule that exists - move it, take in the
   * edits made since, or remove it. It opens on tomorrow at 08:00 when
   * nothing is set, which is as good a guess as any and plainly a guess.
   * The time is the author's own, turned into an absolute moment here, so
   * the server never has to know which zone anybody is in.
   */
  document.addEventListener('click', function (event) {
    var trigger = event.target.closest && event.target.closest('[data-schedule]');
    if (trigger) openSchedule(trigger.dataset.at || '');
  });

  /* "Include them": the same minute, a fresh copy. */
  document.addEventListener('click', function (event) {
    var trigger = event.target.closest && event.target.closest('[data-schedule-refresh]');
    if (!trigger) return;
    var at = new Date(trigger.dataset.scheduleRefresh.replace(' ', 'T') + 'Z');
    if (!isNaN(at)) save('scheduled', { publish_at: at.toISOString() }, 'The latest edits are included');
  });

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateValue(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function timeValue(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }

  /* Built from its parts: a date string without a zone is read as UTC by
     some engines and as local time by others. */
  function localMoment(date, time) {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    var t = /^(\d{2}):(\d{2})/.exec(time || '');
    if (!d || !t) return null;
    var when = new Date(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], 0, 0);
    return isNaN(when) ? null : when;
  }

  function openSchedule(at) {
    var current = at ? new Date(at.replace(' ', 'T') + 'Z') : null;
    if (current && isNaN(current)) current = null;
    var start = current;
    if (!start) {
      start = new Date();
      start.setDate(start.getDate() + 1);
      start.setHours(8, 0, 0, 0);
    }
    var noun = DATA.mode === 'article' ? 'article' : 'page';
    var note = current
      ? 'Saving takes the ' + noun + ' as it is now, edits made since it was scheduled included.'
      : DATA.status === 'published'
        ? 'Your changes go live as they are now. Later edits wait until you schedule or publish again.'
        : 'The ' + noun + ' goes live as it is now. Later edits wait until you schedule or publish again.';
    var overlay = CMS.showDialog(
      '<h2>' + (current ? 'Edit schedule' : 'Schedule') + '</h2>'
      + '<p class="dialog__note">' + esc(note) + '</p>'
      + '<div class="field-row">'
      + '<div class="field"><label for="sched-date">Date</label>'
      + '<input id="sched-date" type="date" required min="' + dateValue(new Date()) + '"'
      + ' value="' + dateValue(start) + '"></div>'
      + '<div class="field"><label for="sched-time">Time</label>'
      + '<input id="sched-time" type="time" required step="60" value="' + timeValue(start) + '"></div>'
      + '</div>'
      + '<p class="field__error sched-error" data-sched-error hidden></p>'
      + '<div class="dialog__actions">'
      + (current ? '<button class="btn" type="button" data-unschedule>Remove schedule</button>' : '')
      + '<button class="btn" type="button" data-cancel>Cancel</button>'
      + '<button class="btn btn--accent grow" type="button" data-confirm>'
      + (current ? 'Save schedule' : 'Schedule') + '</button>'
      + '</div>', { className: 'dialog--form' });

    var dateInput = overlay.querySelector('#sched-date');
    var timeInput = overlay.querySelector('#sched-time');
    var error = overlay.querySelector('[data-sched-error]');
    var confirm = overlay.querySelector('[data-confirm]');
    var remove = overlay.querySelector('[data-unschedule]');

    // One request at a time from this dialogue.
    function busy(on) {
      [confirm, remove].forEach(function (b) { if (b) b.disabled = on; });
    }

    function submit() {
      var when = localMoment(dateInput.value, timeInput.value);
      var problem = !when ? 'Pick a date and a time.'
        : when.getTime() <= Date.now() ? 'That time has already passed. Pick a later one.' : '';
      error.textContent = problem;
      error.hidden = !problem;
      if (problem || confirm.disabled) return;
      busy(true);
      save('scheduled', { publish_at: when.toISOString() }).then(function (ok) {
        if (ok) CMS.closeDialog();
        else busy(false);
      });
    }

    confirm.addEventListener('click', submit);
    [dateInput, timeInput].forEach(function (input) {
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      input.addEventListener('input', function () { error.hidden = true; });
    });
    if (remove) {
      remove.addEventListener('click', function () {
        busy(true);
        save('unscheduled').then(function (ok) {
          if (ok) CMS.closeDialog();
          else busy(false);
        });
      });
    }
  }

  /* A pending autosave still counts as unsaved, so flush it rather than
     warn - the warning is for a request that never got made. */
  window.addEventListener('beforeunload', function (event) {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  /**
   * A page-level setting is a change like any other, and schedules the same
   * autosave the canvas does. Without this the page type and the sub menu
   * only ever reached the server when something on the canvas happened to be
   * touched afterwards - so changing one and walking away lost it.
   */
  document.querySelectorAll('[data-page-field]').forEach(function (el) {
    el.addEventListener('change', markDirty);
    /* Anything typed into, which a textarea is: its `type` reads "textarea",
       so testing for "text" left the meta description saving only on blur. */
    if (/^(input|textarea)$/i.test(el.tagName) && !/^(checkbox|radio)$/.test(el.type)) {
      el.addEventListener('input', markDirty);
    }
  });

  /**
   * The password row at the foot of the editor.
   *
   * The switch says whether the page is protected; the field is only where
   * the password goes, so it shows when there is a reason for it. The server
   * clears the password when the switch is off, which is what keeps the two
   * from ever disagreeing about whether a page is locked.
   */
  var lockToggle = document.querySelector('[data-page-field="password_on"]');
  var lockInput = document.querySelector('[data-page-field="password"]');
  if (lockToggle && lockInput) {
    var lockHint = document.querySelector('.page-lock__hint');
    lockToggle.addEventListener('change', function () {
      lockInput.hidden = !lockToggle.checked;
      if (lockHint) lockHint.hidden = !lockToggle.checked;
      if (lockToggle.checked) lockInput.focus();
    });
  }

  /**
   * Changing the page type changes whether a band can reach the window edge,
   * so the canvas has to be told - otherwise the editor keeps drawing bleed
   * on a page that will cap it, or the reverse.
   */
  var typeField = document.querySelector('[data-page-field="page_type"]');
  if (typeField) {
    typeField.addEventListener('change', function () {
      FREE_FRAME = typeField.value === 'blank';
      var hint = typeField.parentNode.querySelector('.field__hint');
      if (hint) hint.textContent = PAGE_TYPE_HINT[typeField.value] || '';
      render();
    });
  }

  /**
   * Clear the page back to one empty slice.
   *
   * Not to nothing: an empty page opens with a slice on it, so leaving the
   * canvas bare would put the page in a state it can never otherwise be in.
   * This one *is* marked dirty - it is something the author did, unlike
   * opening a page, which must not change it - but marking dirty is all it
   * does. Nothing reaches the database until Save or Publish, which is what
   * makes walking away the way to undo it.
   */
  var wipeButton = document.querySelector('[data-wipe-page]');
  if (wipeButton) {
    wipeButton.addEventListener('click', function () {
      var count = blocks.length;
      var empty = count === 0 || (count === 1 && !blocks[0].columns.some(function (c) {
        return c.objects.length;
      }));
      if (empty) return CMS.toast('This page has nothing on it yet.');

      var overlay = CMS.showDialog(
        '<h2>Clear all slices?</h2>'
        + '<p class="dialog__note">This action will wipe all slices and content '
        + 'on this page.</p>'
        + '<div class="dialog__actions">'
        + '<button class="btn" type="button" data-cancel>Cancel</button>'
        + '<button class="btn btn--danger grow" type="button" data-confirm>Clear the page</button>'
        + '</div>');

      overlay.querySelector('[data-confirm]').addEventListener('click', function () {
        blocks.length = 0;
        blocks.push(newSlice([]));
        selectedId = null;
        CMS.closeDialog();
        markDirty();
        render();
        CMS.toast('Page cleared.');
      });
    });
  }

  /**
   * Apply a template to the page that is already here.
   *
   * "Start from a template" only ever worked on a page that did not exist
   * yet, which is the wrong half of the job: a site is often laid out as
   * blank pages first - to hang the menus off - and populated one at a time
   * afterwards. There was nowhere to say "make this one look like that".
   *
   * It replaces every slice, and says so plainly rather than trying to merge:
   * a template is a whole page, and a half-applied one is neither.
   *
   * Like every other editing action here it only touches the draft in the
   * browser. Nothing reaches the database until Save or Publish, so leaving
   * the page without saving is the undo - which is what makes a single
   * confirmation enough for something this destructive.
   */
  var applyButton = document.querySelector('[data-apply-template]');
  if (applyButton) {
    applyButton.addEventListener('click', function () {
      CMS.getJson('/cms/api/templates').then(function (data) {
        var items = data.items || [];
        if (!items.length) {
          return CMS.toast('No page templates saved yet. Build a page and use "Save page as template".');
        }
        /* Read off the page type control rather than restated here, so the
           two can never name the same type differently. */
        var typeLabel = function (value) {
          var opt = typeField && typeField.querySelector('option[value="' + value + '"]');
          return opt ? opt.textContent.trim() : String(value || '');
        };

        var overlay = CMS.showDialog(
          '<h2>Apply page template</h2>'
          /* The same sentence whatever is on the page, because it describes
             what the action does rather than what this particular page has to
             lose - it replaces the page either way. Mac's call. It is also
             why the button stays red on an empty page: the colour marks the
             kind of action, and softening it when there happens to be nothing
             on the page would be reading the contents, not the verb. */
          + '<p class="dialog__note">This action will replace all slices and '
          + 'content on this page.</p>'
          + '<div class="field"><label for="applytpl">Template</label>'
          + '<select id="applytpl">'
          /* The page type rides in the option rather than in a line of its
             own underneath: it is a property of the thing being chosen, and
             the row it saves is a row of prose in a dialogue that should be
             read in one glance. A long enough name will clip it - the select
             is the width of the dialogue - and the fallback is to put it back
             under the select as a labelled value. */
          + items.map(function (t) {
            return '<option value="' + t.id + '">' + esc(t.name) + ' (' + t.blockCount
              + ' slice' + (t.blockCount === 1 ? '' : 's')
              + '/type ' + esc(typeLabel(t.page_type)) + ')</option>';
          }).join('')
          + '</select></div>'
          + '<div class="dialog__actions">'
          + '<button class="btn" type="button" data-cancel>Cancel</button>'
          + '<button class="btn btn--danger grow" type="button" data-confirm>'
          + 'Apply template</button>'
          + '</div>', { className: 'dialog--form' });

        overlay.querySelector('[data-confirm]').addEventListener('click', function () {
          var id = overlay.querySelector('#applytpl').value;
          CMS.getJson('/cms/api/templates/' + id).then(function (tpl) {
            Object.keys(tpl.media || {}).forEach(function (k) { mediaMap[k] = tpl.media[k]; });
            blocks.length = 0;
            (tpl.blocks || []).forEach(function (b) { blocks.push(b); });
            if (!blocks.length) blocks.push(newSlice([]));
            // Before the page type, which redraws: the selection points at a
            // block that is no longer here.
            selectedId = null;
            /* The page type rides along, the way it does when a page is
               started from one - a template is a whole page, and its frame is
               part of what you asked for. Through the field rather than past
               it, so the canvas and the autosave hear about it like any other
               change. Only a type the field actually offers: setting a select
               to a value it has no option for silently empties it. */
            if (typeField && tpl.page_type && typeField.value !== tpl.page_type
                && typeField.querySelector('option[value="' + tpl.page_type + '"]')) {
              typeField.value = tpl.page_type;
              typeField.dispatchEvent(new Event('change', { bubbles: true }));
            }
            CMS.closeDialog();
            markDirty();
            render();
            CMS.toast('Applied "' + tpl.name + '".');
          }).catch(function (err) { CMS.toast(err.message, 'error'); });
        });
      }).catch(function (err) { CMS.toast(err.message, 'error'); });
    });
  }

  /* Save the whole page as a template: the slice library, one level up. */
  var templateButton = document.querySelector('[data-save-as-template]');
  if (templateButton) {
    templateButton.addEventListener('click', function () {
      var overlay = CMS.showDialog(
        '<h2>Save page as template</h2>'
        + '<p class="dialog__note">Keeps this page\u2019s type and all '
        + blocks.length + ' slice' + (blocks.length === 1 ? '' : 's') + ', content included. '
        + 'Starting a new page from it copies them in — the template and the page stay separate.</p>'
        + '<div class="field"><label for="tplname">Name</label>'
        + '<input id="tplname" type="text" autofocus placeholder="e.g. Investor page"></div>'
        + '<div class="dialog__actions">'
        + '<button class="btn" type="button" data-cancel>Cancel</button>'
        + '<button class="btn btn--accent grow" type="button" data-confirm>Save template</button>'
        + '</div>', { className: 'dialog--form' });

      var input = overlay.querySelector('#tplname');
      var submit = function () {
        var name = input.value.trim();
        if (!name) { return CMS.toast('A template needs a name.', 'error'); }
        CMS.postForm('/cms/api/templates', {
          name: name,
          page_type: typeField ? typeField.value : 'default',
          blocks: blocks,
        }).then(function () {
          CMS.closeDialog();
          CMS.toast('Saved as template "' + name + '"');
        }).catch(function (err) { CMS.toast(err.message, 'error'); });
      };
      overlay.querySelector('[data-confirm]').addEventListener('click', submit);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    });
  }

  bindPalette();
  bindSavedTab();

  /**
   * An empty page opens with one empty slice already on it.
   *
   * Otherwise the first block dragged in conjures a slice out of nowhere, and
   * the thing the whole model rests on - that a page is a stack of slices and
   * content goes *inside* one - is never shown, only inferred. Deliberately
   * not marked dirty: opening a page must not change it, so this slice is
   * saved only once something is put in it.
   */
  if (!blocks.length) {
    var firstSlice = newSlice([]);
    blocks.push(firstSlice);
    // Selected, so the thing you are about to drop something into is visibly
    // the thing you are working in. Set rather than passed through select():
    // that would swap the panel to Properties, and the palette is what is
    // wanted next.
    selectedId = firstSlice.id;
  }

  render();
  // Say what the page's state is before anything is touched. Nothing said so
  // before, which is how "is any of this saved?" became a real question. The
  // pill and the bar arrive rendered; only the clock needs starting.
  setSaved(DATA.savedAt);
  watchSchedule(DATA.scheduledAt);
  returnToPlace();
})();
