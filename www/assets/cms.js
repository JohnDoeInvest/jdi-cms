/* ===================================================================
   Slice CMS - shared client behaviour.
   No dependencies; every helper is exposed on window.CMS for the
   page-specific scripts (cms-editor.js, cms-menus.js).
   =================================================================== */
(function () {
  'use strict';

  var DATA = {};
  try { DATA = JSON.parse(document.getElementById('cms-data').textContent || '{}'); } catch (e) {}

  /* ------------------------------------------------------------ toasts */

  var toastHost = document.getElementById('toasts');
  function toast(message, kind) {
    if (!toastHost) return;
    var el = document.createElement('div');
    el.className = 'toast' + (kind === 'error' ? ' toast--error' : ' toast--ok');
    el.textContent = message;
    toastHost.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .25s';
      setTimeout(function () { el.remove(); }, 260);
    }, kind === 'error' ? 5200 : 2600);
  }

  /* ----------------------------------------------------------- dialogs */

  var dialogRoot = document.getElementById('dialog-root');
  var openDialog = null;

  function closeDialog() {
    if (!openDialog) return;
    openDialog.remove();
    openDialog = null;
    document.removeEventListener('keydown', onDialogKey);
  }

  function onDialogKey(event) {
    if (event.key === 'Escape') closeDialog();
  }

  /** Show an overlay containing `innerHtml`; resolves with whatever
      `resolveWith(rootElement)` returns when a [data-confirm] is clicked. */
  function showDialog(innerHtml, options) {
    options = options || {};
    closeDialog();
    var overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = '<div class="dialog ' + (options.className || '') + '" role="dialog" aria-modal="true">'
      + innerHtml + '</div>';
    dialogRoot.appendChild(overlay);
    openDialog = overlay;
    document.addEventListener('keydown', onDialogKey);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeDialog();
    });
    overlay.querySelectorAll('[data-cancel]').forEach(function (btn) {
      btn.addEventListener('click', closeDialog);
    });
    var focusTarget = overlay.querySelector('[autofocus], input, button');
    if (focusTarget) setTimeout(function () { focusTarget.focus(); }, 20);
    return overlay;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Flow 5 confirmation dialogue: title, "cannot be undone", a subject card
   * and an optional warning block with a replacement select.
   */
  function confirmDelete(opts) {
    var warning = '';
    if (opts.warning) {
      warning = '<div class="dialog__warning">'
        + '<span>' + escapeHtml(opts.warning.text) + '</span>'
        + (opts.warning.options && opts.warning.options.length
          ? '<select name="' + escapeHtml(opts.warning.name || 'replace_with') + '">'
            + opts.warning.options.map(function (o) {
              return '<option value="' + escapeHtml(o.id) + '">' + escapeHtml(o.name) + '</option>';
            }).join('')
            + '</select>'
            /* Some replacements are a choice and some are compulsory. A menu
               item can be left pointing nowhere; a page's children have to
               land somewhere, so there is nothing to opt out of and no
               checkbox to offer. */
            + (opts.warning.applyLabel === false ? ''
              : '<label class="check"><input type="checkbox" name="apply_replace" value="1" checked>'
                + '<span>' + escapeHtml(opts.warning.applyLabel || 'Replace on delete') + '</span></label>')
          : '')
        + '</div>';
    }

    var thumb = opts.image
      ? '<div class="dialog__subject-thumb"><img src="' + escapeHtml(opts.image) + '" alt=""></div>'
      : '<div class="dialog__subject-thumb">' + (opts.initials
        ? '<span class="strong">' + escapeHtml(opts.initials) + '</span>'
        : (opts.icon || '')) + '</div>';

    var overlay = showDialog(
      '<h2>' + escapeHtml(opts.title) + '</h2>'
      + '<p class="dialog__note">This cannot be undone.'
      + (opts.altAction ? ' <a class="linkish" href="' + escapeHtml(opts.altAction.href) + '">'
        + escapeHtml(opts.altAction.label) + '</a>' : '') + '</p>'
      + '<div class="dialog__subject">' + thumb
      + '<div class="grow" style="min-width:0">'
      + '<div class="strong truncate">' + escapeHtml(opts.subject) + '</div>'
      + '<div class="tiny muted truncate">' + escapeHtml(opts.meta || '') + '</div>'
      + '</div></div>'
      + warning
      + '<form method="post" action="' + escapeHtml(opts.action) + '" class="dialog__actions">'
      + '<button class="btn" type="button" data-cancel>Cancel</button>'
      + '<button class="btn btn--danger grow" type="submit">Confirm delete</button>'
      + '</form>');

    // Move the replacement controls into the form so they post along.
    var form = overlay.querySelector('form');
    overlay.querySelectorAll('.dialog__warning select, .dialog__warning input').forEach(function (control) {
      var hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = control.name;
      form.appendChild(hidden);
      function sync() {
        hidden.value = control.type === 'checkbox' ? (control.checked ? '1' : '') : control.value;
      }
      control.addEventListener('change', sync);
      sync();
    });
    return overlay;
  }

  /* -------------------------------------------------------------- fetch */

  function postForm(url, payload) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) throw new Error(body.error || ('Server error ' + res.status));
        return body;
      });
    });
  }

  function getJson(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) throw new Error(body.error || ('Server error ' + res.status));
        return body;
      });
    });
  }

  /* ------------------------------------------------------- media picker */

  var mediaCache = null;

  /** Opens the library as a chooser and resolves with the selected item. */
  function pickMedia() {
    return new Promise(function (resolve) {
      var overlay = showDialog(
        '<div class="spread" style="margin-bottom:var(--ui-s-4)">'
        + '<h2>Choose media</h2>'
        + '<button class="icon-btn" type="button" data-cancel aria-label="Close">✕</button></div>'
        + '<div class="row" style="margin-bottom:var(--ui-s-4)">'
        + '<div class="field grow"><input type="search" placeholder="Search media" data-picker-search autocomplete="off"></div>'
        + '<label class="btn" style="cursor:pointer">Upload'
        + '<input type="file" hidden multiple data-picker-upload accept="image/*,video/*,application/pdf"></label>'
        + '</div>'
        + '<div class="dialog__body"><div class="media-grid" data-picker-grid></div></div>',
        { className: 'dialog--wide' });

      var grid = overlay.querySelector('[data-picker-grid]');
      var search = overlay.querySelector('[data-picker-search]');
      var upload = overlay.querySelector('[data-picker-upload]');

      function render(items) {
        if (!items.length) {
          grid.innerHTML = '<p class="muted small" style="grid-column:1/-1;text-align:center;padding:var(--ui-s-6)">'
            + 'No files. Upload something.</p>';
          return;
        }
        grid.innerHTML = items.map(function (item) {
          /* Tiles are small: take the thumbnail variant, not the full image. */
          var preview = item.kind === 'image'
            ? '<img src="' + escapeHtml(item.thumb || item.url) + '" alt="" loading="lazy">'
            : '<span class="muted small">' + escapeHtml(item.kind.toUpperCase()) + '</span>';
          return '<article class="media-item" data-id="' + item.id + '" tabindex="0" role="button">'
            + '<div class="media-item__preview">' + preview + '</div>'
            + '<div class="media-item__name truncate">' + escapeHtml(item.name) + '</div>'
            + '<div class="media-item__meta">'
            + (item.width ? item.width + '×' + item.height : escapeHtml(item.mime)) + '</div>'
            + '</article>';
        }).join('');
        grid.querySelectorAll('.media-item').forEach(function (card) {
          function choose() {
            var picked = items.filter(function (i) { return String(i.id) === card.dataset.id; })[0];
            closeDialog();
            resolve(picked || null);
          }
          card.addEventListener('click', choose);
          card.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
          });
        });
      }

      function load(query) {
        getJson('/cms/api/media?q=' + encodeURIComponent(query || ''))
          .then(function (data) { mediaCache = data.items; render(data.items); })
          .catch(function (err) { toast(err.message, 'error'); });
      }

      var timer;
      search.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { load(search.value); }, 180);
      });

      upload.addEventListener('change', function () {
        if (!upload.files.length) return;
        var body = new FormData();
        Array.prototype.forEach.call(upload.files, function (file) { body.append('files', file); });
        grid.innerHTML = '<p class="muted small" style="grid-column:1/-1;text-align:center;padding:var(--ui-s-6)">Uploading…</p>';
        fetch('/cms/media/upload', { method: 'POST', body: body, headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            /* A refusal now says which file and why - "check the file type
               and size" told you where to look and nothing else. */
            var refused = (data.refused || []).map(function (r) {
              return r.name + ' (' + r.detail + ')';
            });
            if (data.items && data.items.length) {
              closeDialog();
              resolve(data.items[0]);
              toast(data.items.length + ' file(s) uploaded');
              if (refused.length) toast('Not added: ' + refused.join(' · '), 'error');
            } else {
              toast(refused.length ? 'Not added: ' + refused.join(' · ') : 'Upload failed.', 'error');
              load('');
            }
          })
          .catch(function (err) { toast(err.message, 'error'); load(''); });
      });

      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) resolve(null);
      });
      load('');
    });
  }

  /* Wire every [data-media-picker] block on the page. */
  document.querySelectorAll('[data-media-picker]').forEach(function (widget) {
    var input = widget.querySelector('[data-value]');
    var preview = widget.querySelector('[data-preview]');
    var clear = widget.querySelector('[data-clear]');

    var emptyMarkup = preview ? preview.innerHTML : '';

    widget.querySelectorAll('[data-pick]').forEach(function (button) {
      button.addEventListener('click', function () {
        pickMedia().then(function (item) {
          if (!item) return;
          input.value = item.id;
          preview.innerHTML = item.kind === 'image'
            ? '<img src="' + escapeHtml(item.url) + '" alt="">'
            : '<span class="picker__name">' + escapeHtml(item.name) + '</span>';
          preview.title = 'Replace image';
          if (clear) clear.hidden = false;
          /* Setting .value in script fires nothing, so anything watching this
             hidden input - the page editor's autosave, for one - never heard
             that a share image had been chosen. */
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    });
    if (clear) {
      clear.addEventListener('click', function (event) {
        event.stopPropagation();
        input.value = '';
        preview.innerHTML = emptyMarkup;
        preview.title = 'Add image';
        clear.hidden = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  });

  /* ------------------------------------------------------ delete wiring */

  function onClick(selector, handler) {
    document.addEventListener('click', function (event) {
      var el = event.target.closest ? event.target.closest(selector) : null;
      if (el) { event.preventDefault(); handler(el, event); }
    });
  }

  onClick('[data-delete-user]', function (el) {
    var id = el.dataset.deleteUser;
    getJson('/cms/api/users/' + id).then(function (data) {
      confirmDelete({
        title: 'Delete user:',
        subject: data.full_name || data.email,
        meta: data.email,
        image: data.image,
        initials: data.image ? null : data.initials,
        action: '/cms/users/' + id + '/delete',
      });
    }).catch(function (err) { toast(err.message, 'error'); });
  });

  onClick('[data-delete-media]', function (el) {
    var id = el.dataset.deleteMedia;
    getJson('/cms/api/media/' + id + '/usage').then(function (data) {
      var used = data.usage.length;
      confirmDelete({
        title: 'Delete media:',
        subject: data.item.name,
        meta: data.item.width ? data.item.width + '×' + data.item.height : data.item.mime,
        image: data.item.kind === 'image' ? (data.item.thumb || data.item.url) : null,
        altAction: { href: '/cms/media?edit=' + id, label: 'Replace the file instead?' },
        warning: used ? { text: used + ' place(s) use this file. It will disappear from those too.' } : null,
        action: '/cms/media/' + id + '/delete',
      });
    }).catch(function (err) { toast(err.message, 'error'); });
  });

  onClick('[data-delete-category]', function (el) {
    var id = el.dataset.deleteCategory;
    getJson('/cms/api/categories/' + id + '/usage').then(function (data) {
      confirmDelete({
        title: 'Delete category:',
        subject: data.category.name,
        meta: data.count ? data.count + ' articles' : 'Unused',
        action: '/cms/categories/' + id + '/delete',
        warning: data.count ? {
          text: data.count + ' articles use this category. Replace with:',
          options: data.alternatives,
          applyLabel: 'Reassign category on delete',
        } : null,
      });
    }).catch(function (err) { toast(err.message, 'error'); });
  });

  /* A copy of a whole page. Always a draft, so duplicating never publishes,
     and the copy opens straight away - the point of it is to edit it. */
  onClick('[data-duplicate-page]', function (el) {
    var id = el.dataset.duplicatePage;
    postForm('/cms/pages/' + id + '/duplicate', {}).then(function (data) {
      toast('Copied as "' + data.title + '"');
      window.location.href = '/cms/pages/' + data.id + '/edit';
    }).catch(function (err) { toast(err.message, 'error'); });
  });

  onClick('[data-delete-page]', function (el) {
    var id = el.dataset.deletePage;
    getJson('/cms/api/pages/' + id + '/usage').then(function (data) {
      var kids = data.children || [];
      /* Pages sitting under this one come first. A menu left pointing at a
         gone page is a broken link; a child left pointing *through* one is a
         page nobody can reach by its own address, so it is the more urgent of
         the two and the only one that must be answered. */
      var warning = kids.length ? {
        text: kids.length === 1
          ? '“' + kids[0].name + '” sits under this page. Move it to:'
          : kids.length + ' pages sit under this page. Move them to:',
        options: [{ id: '', name: 'Site root' }].concat(data.parents || []),
        name: 'reparent_to',
        applyLabel: false,
      } : (data.menus.length ? {
        text: data.menus.length + ' menu(s) link to this page. Replace with:',
        options: data.alternatives,
        applyLabel: 'Reassign page on delete',
      } : null);

      confirmDelete({
        title: 'Delete page:',
        subject: data.page.title,
        meta: data.page.status === 'published' ? 'Page is live' : 'Draft',
        action: '/cms/pages/' + id + '/delete',
        warning: warning,
      });
    }).catch(function (err) { toast(err.message, 'error'); });
  });

  onClick('[data-delete-form]', function (el) {
    var used = Number(el.dataset.usage) || 0;
    confirmDelete({
      title: 'Delete form:',
      subject: el.dataset.title,
      meta: used
        ? 'On ' + used + ' page' + (used === 1 ? '' : 's') + ' — they will lose it'
        : 'Not on any page',
      action: '/cms/forms/' + el.dataset.deleteForm + '/delete',
    });
  });

  /* The form screen's colour picker. The same swatches the editor panel uses,
     but on a plain screen rather than in the panel, so the pressed state is
     swapped here and the editor's autosave reads it back off the DOM. */
  onClick('[data-colour-group] .swatch-pick', function (el) {
    el.closest('[data-colour-group]').querySelectorAll('.swatch-pick').forEach(function (b) {
      b.classList.toggle('is-on', b === el);
      b.setAttribute('aria-pressed', b === el ? 'true' : 'false');
    });
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  onClick('[data-delete-menu]', function (el) {
    confirmDelete({
      title: 'Delete menu:',
      subject: el.dataset.name,
      meta: el.dataset.live ? 'Menu is live' : 'Menu is unused',
      action: '/cms/menus/' + el.dataset.deleteMenu + '/delete',
    });
  });

  onClick('[data-delete-article]', function (el) {
    confirmDelete({
      title: 'Delete article:',
      subject: el.dataset.title,
      meta: '',
      action: '/cms/articles/' + el.dataset.deleteArticle + '/delete',
    });
  });

  onClick('[data-delete-template]', function (el) {
    confirmDelete({
      title: 'Delete page template:',
      subject: el.dataset.title,
      meta: '',
      action: '/cms/templates/' + el.dataset.deleteTemplate + '/delete',
    });
  });

  /* -------------------------------------------------------- copy links */

  onClick('[data-copy]', function (el) {
    var value = el.dataset.copy;
    var done = function () { toast('Link copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(function () { fallbackCopy(value, done); });
    } else {
      fallbackCopy(value, done);
    }
  });

  function fallbackCopy(value, done) {
    var input = document.createElement('textarea');
    input.value = value;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('Could not copy', 'error'); }
    input.remove();
  }

  /* --------------------------------------------------------- list rows */

  /**
   * The whole row goes where its title goes.
   *
   * Every list row already carried a link on its title and nothing else, so a
   * click three pixels lower did nothing - the row highlights under the
   * cursor, invites the click, and then swallows it. The destination is read
   * off that link rather than repeated on the row, so a row cannot end up
   * pointing somewhere its own title does not.
   *
   * The controls keep their own jobs, and a click that finished a text
   * selection is not a click on the row.
   */
  function rowTarget(event) {
    var row = event.target.closest ? event.target.closest('.table tbody tr') : null;
    if (!row) return null;
    if (event.target.closest('a, button, input, select, textarea, label, [contenteditable]')) return null;
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.anchorNode && row.contains(sel.anchorNode)) return null;
    return row.querySelector('a.cell-link');
  }

  document.addEventListener('click', function (event) {
    var link = rowTarget(event);
    if (!link) return;
    // Shift is left alone: it extends a selection far more often than it
    // means "open this".
    if (event.shiftKey) return;
    event.preventDefault();
    if (event.metaKey || event.ctrlKey) window.open(link.href, '_blank', 'noopener');
    else window.location.href = link.href;
  });

  // Middle-click opens a tab, as it would on the link itself.
  document.addEventListener('auxclick', function (event) {
    if (event.button !== 1) return;
    var link = rowTarget(event);
    if (!link) return;
    event.preventDefault();
    window.open(link.href, '_blank', 'noopener');
  });

  /* ------------------------------------------------------- live search */

  function liveSearch(input, param) {
    var timer;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var url = new URL(window.location.href);
        if (input.value) url.searchParams.set(param, input.value);
        else url.searchParams.delete(param);
        url.searchParams.delete('edit');
        window.location.href = url.toString();
      }, 320);
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
  }
  document.querySelectorAll('[data-list-search], [data-media-search]').forEach(function (input) {
    liveSearch(input, input.name || 'q');
  });

  /* ---------------------------------------- media library extra wiring */

  var grid = document.querySelector('[data-media-grid]');
  if (grid) {
    grid.addEventListener('click', function (event) {
      var card = event.target.closest('.media-item');
      if (!card || event.target.closest('[data-copy], [data-delete-media]')) return;
      var url = new URL(window.location.href);
      url.searchParams.set('edit', card.dataset.mediaId);
      window.location.href = url.toString();
    });

    var dropzone = document.querySelector('[data-dropzone]');
    var uploadInput = document.querySelector('[data-upload-input]');
    document.querySelectorAll('[data-upload-trigger]').forEach(function (btn) {
      btn.addEventListener('click', function () { uploadInput.click(); });
    });
    if (uploadInput) {
      uploadInput.addEventListener('change', function () {
        if (uploadInput.files.length) uploadInput.form.submit();
      });
    }
    if (dropzone) {
      ['dragenter', 'dragover'].forEach(function (type) {
        dropzone.addEventListener(type, function (e) { e.preventDefault(); dropzone.classList.add('is-over'); });
      });
      ['dragleave', 'drop'].forEach(function (type) {
        dropzone.addEventListener(type, function (e) { e.preventDefault(); dropzone.classList.remove('is-over'); });
      });
      dropzone.addEventListener('drop', function (event) {
        var files = event.dataTransfer && event.dataTransfer.files;
        if (!files || !files.length) return;
        var body = new FormData();
        Array.prototype.forEach.call(files, function (f) { body.append('files', f); });
        toast('Uploading ' + files.length + ' fil(er)…');
        fetch('/cms/media/upload', { method: 'POST', body: body, headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json(); })
          .then(function () { window.location.reload(); })
          .catch(function (err) { toast(err.message, 'error'); });
      });
    }

    var loadMore = document.querySelector('[data-load-more]');
    if (loadMore) {
      loadMore.addEventListener('click', function () {
        var offset = Number(loadMore.dataset.offset);
        var query = (DATA.search || '');
        getJson('/cms/api/media?offset=' + offset + '&q=' + encodeURIComponent(query))
          .then(function (data) {
            data.items.forEach(function (item) {
              var el = document.createElement('article');
              el.className = 'media-item';
              el.dataset.mediaId = item.id;
              el.innerHTML = '<div class="media-item__preview">'
                + (item.kind === 'image' ? '<img src="' + escapeHtml(item.thumb || item.url) + '" alt="" loading="lazy">'
                  : '<span class="muted small">' + escapeHtml(item.kind.toUpperCase()) + '</span>')
                + '</div><div class="media-item__name truncate">' + escapeHtml(item.name) + '</div>'
                + '<div class="media-item__meta">'
                + (item.width ? item.width + '×' + item.height : escapeHtml(item.mime)) + '</div>';
              grid.appendChild(el);
            });
            loadMore.dataset.offset = String(offset + data.pageSize);
            if (offset + data.pageSize >= data.total) loadMore.remove();
          })
          .catch(function (err) { toast(err.message, 'error'); });
      });
    }
  }

  /* ------------------------------------------------------- rich editors */

  /* A page can hold many rich-text areas but only one toolbar. The toolbar is
     bound once and always acts on whichever editor last had focus. */
  var activeEditor = null;

  function syncEditor(editor) {
    if (!editor) return;
    var hidden = document.querySelector('[data-rich-value="' + editor.dataset.rich + '"]');
    if (hidden) hidden.value = editor.innerHTML;
  }

  /**
   * The active editor is what every toolbar command acts on. It used to be set
   * on focus and never cleared, so after touching one text block the bar kept
   * acting on it - select an image, press Centre, and the text moved. Clearing
   * it here, and hiding a contextual bar with it, keeps the bar's reach
   * visible: if it is on screen, there is a caret for it to work on.
   */
  function setActiveEditor(editor) {
    activeEditor = editor || null;
    document.querySelectorAll('[data-toolbar][data-contextual]').forEach(function (bar) {
      bar.hidden = !activeEditor;
      if (!activeEditor) return;
      floatToolbar(bar, activeEditor);
      refreshToolbar(bar);
    });
    trackFloating();
  }

  /**
   * A contextual bar is taken out of flow and parked against the block it
   * edits. In flow it would shove the whole canvas down the moment a caret
   * landed, and sitting against its own text says what it acts on better than
   * a bar pinned to the top of the pane could.
   *
   * It is positioned inside the scrolling pane rather than fixed to the
   * viewport, so scrolling carries it along with the block for free - no
   * scroll handler to fire, lag behind, or leak.
   */
  function floatToolbar(bar, editor) {
    var pane = bar.offsetParent;
    if (!pane) return;
    var p = pane.getBoundingClientRect();
    var r = editor.getBoundingClientRect();
    var gap = 8;
    // Offsets within the pane's scrollable content, not the viewport.
    var top = (r.top - p.top) + pane.scrollTop - bar.offsetHeight - gap;
    var left = (r.left - p.left) + pane.scrollLeft;
    // No room above - a block at the very top of the content - so sit under it.
    // The test is against the content, not the scroll offset: the bar travels
    // with the block, so where the pane happens to be scrolled is irrelevant.
    if (top < 0) top = (r.bottom - p.top) + pane.scrollTop + gap;
    bar.style.top = Math.round(top) + 'px';
    bar.style.left = Math.round(Math.max(0,
      Math.min(left, pane.clientWidth - bar.offsetWidth))) + 'px';
  }

  /** Layout changes move the block under the bar; scrolling does not. */
  var floatingBound = false;
  function trackFloating() {
    if (floatingBound) return;
    floatingBound = true;
    window.addEventListener('resize', function () {
      if (!activeEditor) return;
      document.querySelectorAll('[data-toolbar][data-contextual]').forEach(function (bar) {
        if (!bar.hidden) floatToolbar(bar, activeEditor);
      });
    });
  }
  /** Run a formatting command from outside the bar, e.g. the properties panel. */
  /**
   * The editor the caret is actually in.
   *
   * `activeEditor` is set on focus, but a canvas re-render clears it while the
   * caret can still be sitting in an editable - so trusting it alone left the
   * toolbar refusing to act on text that was plainly being edited. The DOM's
   * own answer is the fallback, narrowed to editors this file set up.
   */
  function currentEditor() {
    if (activeEditor && activeEditor.isConnected) return activeEditor;
    var el = document.activeElement;
    return el && el.isContentEditable && el.dataset.richBound === '1' ? el : null;
  }

  function applyRichCommand(cmd) {
    var editor = currentEditor();
    if (!editor) return;
    setActiveEditor(editor);
    editor.focus();
    applyCommand(cmd, editor);
    syncEditor(editor);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function bindToolbar(toolbar) {
    if (!toolbar || toolbar.dataset.bound === '1') return;
    toolbar.dataset.bound = '1';
    toolbar.querySelectorAll('[data-cmd]').forEach(function (button) {
      // mousedown default would blur the editor and drop the selection.
      button.addEventListener('mousedown', function (e) { e.preventDefault(); });
      button.addEventListener('click', function () {
        if (activeEditor) activeEditor.focus();
        applyCommand(button.dataset.cmd, activeEditor);
        syncEditor(activeEditor);
        if (activeEditor) {
          activeEditor.dispatchEvent(new Event('input', { bubbles: true }));
        }
        refreshToolbar(toolbar);
      });
    });
  }

  /** Wire a contenteditable to the shared toolbar and keep its input in sync. */
  function initRichEditor(editor, toolbar) {
    if (editor.dataset.richBound === '1') return;
    editor.dataset.richBound = '1';
    var sync = function () { syncEditor(editor); };

    editor.addEventListener('input', sync);
    editor.addEventListener('blur', sync);
    if (editor.closest('form')) editor.closest('form').addEventListener('submit', sync);

    // Paste as plain text so foreign markup never enters the document.
    editor.addEventListener('paste', function (event) {
      event.preventDefault();
      var text = (event.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
      sync();
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });

    ['focus', 'keyup', 'mouseup'].forEach(function (type) {
      editor.addEventListener(type, function () { setActiveEditor(editor); });
    });
    // Toolbar and panel buttons cancel mousedown, so focus never leaves for
    // them and this only fires when the caret has genuinely gone elsewhere.
    editor.addEventListener('blur', function () {
      if (activeEditor === editor) setActiveEditor(null);
    });
    bindToolbar(toolbar);
  }

  var COMMANDS = {
    bold: function () { document.execCommand('bold'); },
    italic: function () { document.execCommand('italic'); },
    ul: function () { document.execCommand('insertUnorderedList'); },
    h2: function () { toggleBlock('h2'); },
    h3: function () { toggleBlock('h3'); },
    /* blockquote was already allowed by the sanitiser and already styled in
       the editor - it simply had no way to be asked for. */
    quote: function () { toggleBlock('blockquote'); },
    left: function () { document.execCommand('justifyLeft'); },
    center: function () { document.execCommand('justifyCenter'); },
    right: function () { document.execCommand('justifyRight'); },
    link: function (editor) { openLinkPopover(editor); },
  };

  /* ------------------------------------------------------- link popover */

  /**
   * Choosing a link, rather than typing one into a browser prompt.
   *
   * The same list the menu editor and the properties panel offer: every page,
   * and under each the sections of it marked as link targets. A prompt could
   * only ever take a string typed from memory, which is how a link ends up
   * pointing at a page that was renamed months ago.
   *
   * The selection is captured before anything is drawn and restored on apply.
   * Clicking into the popover blurs the editor and destroys the live
   * selection, so the range has to be held rather than looked up again.
   */
  var linkPop = null;

  function closeLinkPopover() {
    if (linkPop) linkPop.remove();
    linkPop = null;
    document.removeEventListener('mousedown', onLinkOutside, true);
    document.removeEventListener('keydown', onLinkKey, true);
  }

  function onLinkOutside(event) {
    if (linkPop && !linkPop.contains(event.target)) closeLinkPopover();
  }
  function onLinkKey(event) {
    if (event.key === 'Escape') { closeLinkPopover(); }
  }

  /** The <a> the selection sits inside, if any. */
  function anchorAround(node) {
    var el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    return el ? el.closest('a') : null;
  }

  function openLinkPopover(editor) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0).cloneRange();
    if (!editor.contains(range.commonAncestorContainer)) return;

    var existing = anchorAround(range.commonAncestorContainer);
    var current = existing ? existing.getAttribute('href') || '' : '';
    var chosen = range.toString();
    var options = DATA.linkOptions || '';
    var known = !!current && options.indexOf('value="' + escapeHtml(current) + '"') >= 0;

    closeLinkPopover();
    linkPop = document.createElement('div');
    linkPop.className = 'link-pop';
    linkPop.innerHTML =
      '<div class="field"><label>Link to</label>'
      + '<select data-pick><option value="">Custom link\u2026</option>' + options + '</select></div>'
      + '<div class="field"' + (known ? ' hidden' : '') + ' data-custom>'
      + '<input type="text" data-url value="' + escapeHtml(current) + '"'
      + ' placeholder="https://\u2026, /page, mailto:\u2026"></div>'
      + (chosen ? '' : '<div class="field"><label>Text</label>'
        + '<input type="text" data-text placeholder="The words to link"></div>')
      + '<div class="link-pop__actions">'
      + (existing ? '<button class="btn btn--danger" type="button" data-unlink>Remove</button>' : '')
      + '<button class="btn" type="button" data-cancel>Cancel</button>'
      + '<button class="btn btn--accent grow" type="button" data-apply>Apply</button>'
      + '</div>';
    document.body.appendChild(linkPop);

    /* A collapsed range at the very start of an empty block measures as
       nothing, which would pin the popover to the corner of the window. The
       editor's own box is the honest fallback: still beside the text. */
    var box = range.getBoundingClientRect();
    if (!box.width && !box.height) box = editor.getBoundingClientRect();
    var top = box.bottom + 8;
    var left = Math.min(box.left, window.innerWidth - linkPop.offsetWidth - 12);
    if (top + linkPop.offsetHeight > window.innerHeight) top = Math.max(8, box.top - linkPop.offsetHeight - 8);
    linkPop.style.top = Math.max(8, top) + 'px';
    linkPop.style.left = Math.max(8, left) + 'px';

    var pick = linkPop.querySelector('[data-pick]');
    var url = linkPop.querySelector('[data-url]');
    var custom = linkPop.querySelector('[data-custom]');
    var text = linkPop.querySelector('[data-text]');
    pick.value = known ? current : '';
    pick.addEventListener('change', function () {
      custom.hidden = !!pick.value;
      if (pick.value) url.value = pick.value;
    });
    (pick.value ? pick : url).focus();

    var restore = function () {
      editor.focus();
      var live = window.getSelection();
      live.removeAllRanges();
      live.addRange(range);
    };
    var done = function () {
      closeLinkPopover();
      syncEditor(editor);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    };

    linkPop.querySelector('[data-cancel]').addEventListener('click', closeLinkPopover);
    if (existing) {
      linkPop.querySelector('[data-unlink]').addEventListener('click', function () {
        restore();
        document.execCommand('unlink');
        done();
      });
    }
    linkPop.querySelector('[data-apply]').addEventListener('click', function () {
      var href = (url.value || '').trim();
      if (!href) return toast('Choose a page or type an address.', 'error');
      // A bare domain is meant as a web address, not a path on this site.
      if (!/^(https?:|mailto:|tel:|[/#])/i.test(href)) href = 'https://' + href;
      restore();
      if (range.collapsed) {
        var label = ((text && text.value) || '').trim() || href;
        document.execCommand('insertHTML', false,
          '<a href="' + escapeHtml(href) + '">' + escapeHtml(label) + '</a>');
      } else {
        document.execCommand('createLink', false, href);
      }
      done();
    });

    document.addEventListener('mousedown', onLinkOutside, true);
    document.addEventListener('keydown', onLinkKey, true);
  }

  function toggleBlock(tag) {
    var current = document.queryCommandValue('formatBlock');
    document.execCommand('formatBlock', false,
      String(current).toLowerCase() === tag ? 'p' : tag);
  }

  function applyCommand(cmd, editor) {
    // Formatting only, and only ever on a focused editor.
    if (COMMANDS[cmd] && editor) COMMANDS[cmd](editor);
  }

  /*
   * The bar answered only when an editor was focused and after a click of its
   * own, so moving the caret from a paragraph into a heading left it still
   * describing the paragraph. A frame's worth of coalescing keeps this off
   * the typing path - selectionchange fires on every keystroke.
   */
  var refreshQueued = false;
  document.addEventListener('selectionchange', function () {
    if (!activeEditor || refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(function () {
      refreshQueued = false;
      document.querySelectorAll('[data-toolbar]').forEach(function (bar) {
        if (!bar.hidden) refreshToolbar(bar);
      });
    });
  });

  /** Which block command a formatBlock answer belongs to. */
  var BLOCK_CMD = { h2: 'h2', h3: 'h3', quote: 'blockquote' };

  /**
   * What the bar shows as switched on.
   *
   * A heading is bold, so the browser answers yes to queryCommandState('bold')
   * with the caret inside one. That lit **Bold** the moment you pressed H2 -
   * and since the heading button itself showed nothing, the whole thing read
   * as "the H2 button turns on bold and does nothing else". It does neither.
   * Block commands answer for themselves now, and Bold is only about bold.
   */
  function refreshToolbar(toolbar) {
    var states = { bold: 'bold', italic: 'italic', ul: 'insertUnorderedList' };
    var block = '';
    try { block = String(document.queryCommandValue('formatBlock')).toLowerCase(); } catch (e) {}
    var inHeading = block === 'h2' || block === 'h3' || block === 'h4';

    toolbar.querySelectorAll('[data-cmd]').forEach(function (button) {
      var cmd = button.dataset.cmd;
      if (BLOCK_CMD[cmd]) {
        button.classList.toggle('is-active', block === BLOCK_CMD[cmd]);
        return;
      }
      var q = states[cmd];
      if (!q) return;
      var on = false;
      try { on = document.queryCommandState(q); } catch (e) {}
      button.classList.toggle('is-active', on && !(q === 'bold' && inHeading));
    });
  }

  document.querySelectorAll('[data-rich]').forEach(function (editor) {
    var container = editor.closest('.field') || editor.parentElement;
    initRichEditor(editor, container.querySelector('[data-toolbar]'));
  });

  /* ------------------------------------------------- navigation rail */

  (function navRail() {
    var shell = document.querySelector('.cms');
    var pin = document.querySelector('[data-nav-pin]');
    if (!shell || !pin) return;

    var pinned = false;
    try { pinned = localStorage.getItem('sm_nav_pinned') === '1'; } catch (e) {}
    apply(pinned);

    function apply(state) {
      shell.setAttribute('data-nav', state ? 'pinned' : 'rail');
      pin.setAttribute('aria-pressed', String(state));
      pin.title = state ? 'Unpin menu' : 'Keep menu open';
      var label = pin.querySelector('.cms-nav__label');
      if (label) label.textContent = state ? 'Unpin menu' : 'Pin menu';
    }

    pin.addEventListener('click', function () {
      pinned = !pinned;
      apply(pinned);
      try { localStorage.setItem('sm_nav_pinned', pinned ? '1' : '0'); } catch (e) {}
    });
  })();

  /* ------------------------------------------------------ appearance */

  /* One button, three settings, in a fixed order. Whichever of light and
     dark matches the system is a click with nothing visible happening, so
     the label says what it is set to and the title says what comes next.
     cms-appearance.js owns the setting; this only asks it to move on. */
  (function appearanceSwitch() {
    var toggle = document.querySelector('[data-appearance-toggle]');
    var api = window.CMSAppearance;
    if (!toggle || !api) return;

    var NEXT = { system: 'dark', dark: 'light', light: 'system' };
    var WORDS = { system: 'Match system', dark: 'Dark mode', light: 'Light mode' };
    var THEN = { system: 'Click for dark mode', dark: 'Click for light mode', light: 'Click to match the system' };

    function describe(choice) {
      var label = toggle.querySelector('.cms-nav__label');
      if (label) label.textContent = WORDS[choice];
      toggle.title = 'Appearance: ' + WORDS[choice] + '. ' + THEN[choice] + '.';
      toggle.setAttribute('aria-label', 'Appearance: ' + WORDS[choice]);
    }

    describe(api.get());
    toggle.addEventListener('click', function () { api.set(NEXT[api.get()]); });
    // Also when another tab changed it.
    document.addEventListener('cms:appearance', function (event) { describe(event.detail.choice); });
  })();

  /* --------------------------------------------------------- shortcuts */

  document.addEventListener('keydown', function (event) {
    // `event.target` is the document itself when nothing is focused, and a
    // document has no .matches - which threw here and took the shortcut
    // with it. A non-element target is not a text field, so carry on.
    var target = event.target;
    if (target && target.matches && target.matches('input, textarea, select, [contenteditable]')) return;
    if (event.shiftKey && (event.key === 'N' || event.key === 'n') && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      window.location.href = '/cms/articles/new';
    }
  });

  /* Flash a toast when a save round-tripped through a redirect. */
  if (new URLSearchParams(window.location.search).get('saved')) {
    toast('Saved');
    var clean = new URL(window.location.href);
    clean.searchParams.delete('saved');
    window.history.replaceState({}, '', clean.toString());
  }

  window.CMS = {
    data: DATA,
    toast: toast,
    showDialog: showDialog,
    closeDialog: closeDialog,
    confirmDelete: confirmDelete,
    pickMedia: pickMedia,
    postForm: postForm,
    getJson: getJson,
    escapeHtml: escapeHtml,
    initRichEditor: initRichEditor,
    onClick: onClick,
    applyRichCommand: applyRichCommand,
    clearRichFocus: function () { setActiveEditor(null); },
    /* A re-render detaches whatever had the caret without firing blur, so the
       reference outlives the node. Left unchecked this reads as "still
       typing" forever, and every keyboard shortcut in the editor stops. */
    hasRichFocus: function () { return !!currentEditor(); },
  };
})();
