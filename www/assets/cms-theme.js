/* ===================================================================
   Slice CMS - theme setup.

   Three jobs: keep the colour list editable, keep the preview honest,
   and pull a palette out of an image. All of it is local - the image
   is read through a canvas in this browser and never uploaded, which
   is both faster and one less thing to store.
   =================================================================== */
(function () {
  'use strict';

  var CMS = window.CMS;
  if (!CMS) return;

  var form = document.getElementById('theme-form');
  var list = document.querySelector('[data-color-list]');
  if (!form || !list) return;

  var MAX_COLORS = 24;
  var EXTRACT_COUNT = 8;

  /* --------------------------------------------------------- colour rows */

  /**
   * The row markup comes from the server rather than being written twice.
   * A second copy here would drift the moment a field is added to one.
   */
  function blankRow() {
    var host = document.createElement('div');
    host.innerHTML = (CMS.data.rowTemplate || '').trim();
    return host.firstElementChild;
  }

  function rows() { return Array.prototype.slice.call(list.querySelectorAll('[data-color-row]')); }

  /** Redraw one row's two chips from its own inputs. */
  function syncRow(row) {
    var bg = row.querySelector('[data-color-value]');
    var ink = row.querySelector('[data-color-ink]');
    if (!bg || !ink) return;
    var chips = row.querySelectorAll('.swatch__chip');
    if (chips[0]) chips[0].style.background = bg.value;
    if (chips[1]) {
      chips[1].style.background = bg.value;
      chips[1].style.color = ink.value;
    }
  }

  function syncAll() {
    rows().forEach(syncRow);
    drawPreview();
  }

  /* Relative luminance, the same formula the server uses to choose an ink. */
  function luminance(hex) {
    var v = String(hex || '#000000').replace('#', '');
    function channel(i) {
      var c = parseInt(v.substr(i * 2, 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  }

  var autoInk = function (bg) { return luminance(bg) > 0.42 ? '#1e1e1e' : '#ffffff'; };

  function addRow(color) {
    if (rows().length >= MAX_COLORS) {
      CMS.toast('A palette of more than ' + MAX_COLORS + ' colours is a colour picker, not a theme.', 'error');
      return null;
    }
    var row = blankRow();
    if (!row) return null;
    if (color) {
      row.querySelector('[data-color-value]').value = color.value;
      row.querySelector('[data-color-ink]').value = color.ink || autoInk(color.value);
      row.querySelector('[name="color_name[]"]').value = color.name || '';
    }
    list.appendChild(row);
    syncRow(row);
    return row;
  }

  form.addEventListener('click', function (event) {
    var add = event.target.closest('[data-add-color]');
    if (add) {
      var row = addRow(null);
      if (row) row.querySelector('[name="color_name[]"]').focus();
      drawPreview();
      return;
    }
    var remove = event.target.closest('[data-remove-color]');
    if (remove) {
      if (rows().length <= 1) {
        CMS.toast('A theme needs at least one colour.', 'error');
        return;
      }
      remove.closest('[data-color-row]').remove();
      drawPreview();
    }
  });

  /**
   * Changing a background re-picks the ink, but only while the author has
   * not chosen one: overwriting a deliberate choice would be worse than
   * leaving an unreadable pairing they can see and fix.
   */
  form.addEventListener('input', function (event) {
    var target = event.target;
    var row = target.closest && target.closest('[data-color-row]');
    if (row && target.matches('[data-color-ink]')) row.dataset.inkSet = '1';
    if (row && target.matches('[data-color-value]') && !row.dataset.inkSet) {
      row.querySelector('[data-color-ink]').value = autoInk(target.value);
    }
    if (row) syncRow(row);
    drawPreview();
  });

  /* ------------------------------------------------------------- preview */

  var surfaceHost = document.querySelector('[data-preview-surfaces]');
  var typeHost = document.querySelector('[data-preview-type]');

  /**
   * The stack for a chosen family, off the option itself.
   *
   * There was a fetch here: the preview asked fonts.googleapis.com for
   * whichever face was selected. It does not need to. Every installed family
   * is already in this page's head as an @font-face - the CMS carries the
   * site's theme so the editor canvas can look like the site - so the face is
   * loaded the moment it is named, and naming it is all this does.
   */
  function stackFor(id) {
    var option = form.querySelector('[name="font_body"] option[value="' + CSS.escape(id) + '"]')
      || form.querySelector('[name="font_heading"] option[value="' + CSS.escape(id) + '"]');
    return (option && option.dataset.stack)
      || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  }

  function drawPreview() {
    if (!surfaceHost) return;
    var html = '';
    rows().forEach(function (row) {
      var bg = row.querySelector('[data-color-value]').value;
      var ink = row.querySelector('[data-color-ink]').value;
      var name = row.querySelector('[name="color_name[]"]').value || 'Unnamed';
      html += '<div class="theme-preview__band" style="background:' + bg + ';color:' + ink + '">'
        + CMS.escapeHtml(name) + '</div>';
    });
    surfaceHost.innerHTML = html;

    if (!typeHost) return;
    var scale = Number(form.querySelector('[name="font_scale"]').value || 100) / 100;
    /* Large and Body, at the real numbers rather than at a pair of stand-ins:
       both fit the rail at any sensible value, so the preview can be the
       actual size instead of a proportion of one. The larger steps are not
       shown - a display heading does not fit a 300px panel, and pretending it
       does would be the panel lying about the number underneath it. */
    var px = function (name, fallback) {
      var field = form.querySelector('[name="' + name + '"]');
      var n = Number(field && field.value);
      return (n > 0 ? n : fallback) * scale;
    };
    var heading = typeHost.querySelector('.theme-preview__h');
    var body = typeHost.querySelector('.theme-preview__b');
    heading.style.fontFamily = stackFor(form.querySelector('[name="font_heading"]').value);
    heading.style.fontSize = px('h_large', 30).toFixed(1) + 'px';
    body.style.fontFamily = stackFor(form.querySelector('[name="font_body"]').value);
    body.style.fontSize = px('t_body', 17).toFixed(1) + 'px';
  }

  form.addEventListener('change', drawPreview);

  /* ------------------------------------------------- palette from an image */

  var fileInput = document.querySelector('[data-palette-image]');
  var pickButton = document.querySelector('[data-pick-from-image]');

  if (pickButton && fileInput) {
    pickButton.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (file) extractPalette(file);
      fileInput.value = '';
    });
  }

  /**
   * The eight most prominent colours in an image.
   *
   * Pixels are binned into a coarse RGB cube and the fullest bins win. Coarse
   * on purpose: a photograph has thousands of near-identical shades, and
   * counting them exactly returns eight versions of the same beige. Bins are
   * then kept apart by a minimum distance so the result is a palette rather
   * than a gradient.
   */
  function extractPalette(file) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      try {
        var side = 160;                       // enough to be representative, fast to scan
        var scale = Math.min(side / img.width, side / img.height, 1);
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        var data = ctx.getImageData(0, 0, w, h).data;
        applyPalette(quantise(data));
      } catch (err) {
        CMS.toast('That image could not be read.', 'error');
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      CMS.toast('That file is not an image the browser can open.', 'error');
    };
    img.src = url;
  }

  function quantise(data) {
    var STEP = 24;                            // bin width per channel
    var bins = {};
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;        // ignore transparent pixels
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var key = Math.floor(r / STEP) + ',' + Math.floor(g / STEP) + ',' + Math.floor(b / STEP);
      var bin = bins[key] || (bins[key] = { n: 0, r: 0, g: 0, b: 0 });
      bin.n++; bin.r += r; bin.g += g; bin.b += b;
    }

    var ordered = Object.keys(bins).map(function (key) {
      var bin = bins[key];
      return { n: bin.n, r: bin.r / bin.n, g: bin.g / bin.n, b: bin.b / bin.n };
    }).sort(function (a, b) { return b.n - a.n; });

    // Keep entries apart, so eight bins of nearly the same brown become one.
    var MIN_DISTANCE = 60;
    var chosen = [];
    for (var j = 0; j < ordered.length && chosen.length < EXTRACT_COUNT; j++) {
      var candidate = ordered[j];
      var tooClose = chosen.some(function (kept) {
        return Math.sqrt(Math.pow(kept.r - candidate.r, 2)
          + Math.pow(kept.g - candidate.g, 2)
          + Math.pow(kept.b - candidate.b, 2)) < MIN_DISTANCE;
      });
      if (!tooClose) chosen.push(candidate);
    }
    return chosen.map(function (c) { return toHex(c.r, c.g, c.b); });
  }

  function toHex(r, g, b) {
    function pair(n) {
      var v = Math.max(0, Math.min(255, Math.round(n))).toString(16);
      return v.length === 1 ? '0' + v : v;
    }
    return '#' + pair(r) + pair(g) + pair(b);
  }

  /**
   * A palette pulled from a photograph is all midtones: it has no near-white
   * to set text on and no near-black to set text in. Both are added when the
   * image did not supply them, because a theme without them cannot build a
   * readable page whatever the art direction.
   */
  function applyPalette(colors) {
    if (!colors.length) {
      CMS.toast('No usable colours came out of that image.', 'error');
      return;
    }
    var lums = colors.map(luminance);
    var extra = [];
    if (Math.max.apply(null, lums) < 0.75) extra.push('#fafafa');
    if (Math.min.apply(null, lums) > 0.15) extra.push('#1e1e1e');

    var found = colors.concat(extra);
    var swatches = found.map(function (hex) {
      return '<span class="swatch__chip" style="background:' + hex + '"></span>';
    }).join('');

    // Shown before it is applied, because replacing a palette someone has
    // already named is the one destructive thing this screen can do.
    var overlay = CMS.showDialog(
      '<h2>Replace the palette?</h2>'
      + '<p class="dialog__note">The image gave ' + colors.length + ' colour'
      + (colors.length === 1 ? '' : 's')
      + (extra.length ? ', plus ' + extra.length + ' neutral'
        + (extra.length === 1 ? '' : 's') + ' so text has somewhere to sit' : '')
      + '. Your current colours will be replaced.</p>'
      + '<div class="swatch-preview">' + swatches + '</div>'
      + '<div class="dialog__actions">'
      + '<button class="btn" type="button" data-cancel>Cancel</button>'
      + '<button class="btn btn--accent grow" type="button" data-apply>Replace</button>'
      + '</div>');

    overlay.querySelector('[data-apply]').addEventListener('click', function () {
      list.innerHTML = '';
      found.forEach(function (hex, i) {
        addRow({ value: hex, ink: autoInk(hex), name: 'Colour ' + (i + 1) });
      });
      drawPreview();
      CMS.closeDialog();
      CMS.toast('Palette taken from the image. Name the colours before saving.');
    });
  }

  syncAll();
}());
