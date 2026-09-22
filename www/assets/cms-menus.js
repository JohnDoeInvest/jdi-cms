/* ===================================================================
   Slice CMS - menu setup (Frame 4.7).

   Rows are kept flat with a depth value. Dragging vertically reorders;
   dragging sideways changes depth. The first row is always top level,
   and nesting stops at two sub levels. Changes autosave as a draft and
   only reach the live site when Publish is pressed.
   =================================================================== */
(function () {
  'use strict';

  var CMS = window.CMS;
  if (!CMS) return;
  var esc = CMS.escapeHtml;
  var INDENT_PX = 28;
  var MAX_DEPTH = 2;

  document.querySelectorAll('[data-menu]').forEach(setupMenu);

  function setupMenu(section) {
    var menuId = section.dataset.menu;
    var itemsHost = section.querySelector('[data-menu-items]');
    var nameInput = section.querySelector('[data-menu-name]');
    var mainRadio = section.querySelector('[data-main]');
    var publishBtn = section.querySelector('[data-publish]');
    var dirtyPill = section.querySelector('[data-dirty-pill]');
    var stateEl = section.querySelector('[data-save-state]');
    var saveTimer = null;

    /* ------------------------------------------------------- reading */

    function readRows() {
      return Array.prototype.map.call(itemsHost.querySelectorAll('[data-menu-item]'), function (row) {
        var select = row.querySelector('[data-target]');
        var custom = row.querySelector('[data-href]');
        /* Which page, not which path. A path is a snapshot and goes stale the
           moment the page moves; the id is the page. A custom link has no
           option behind it and keeps carrying its address, which is all it
           ever was. */
        var picked = select.selectedOptions && select.selectedOptions[0];
        return {
          label: row.querySelector('[data-label]').value,
          href: select.value || custom.value,
          pageId: picked && picked.dataset.page ? Number(picked.dataset.page) : null,
          anchor: (picked && picked.dataset.anchor) || '',
          depth: Number(row.dataset.depth) || 0,
        };
      }).filter(function (r) { return r.label.trim(); });
    }

    function normalizeDepths() {
      var rows = itemsHost.querySelectorAll('[data-menu-item]');
      var previous = -1;
      rows.forEach(function (row, index) {
        var depth = Number(row.dataset.depth) || 0;
        // A row can only ever be one level deeper than the row above it.
        if (index === 0) depth = 0;
        else depth = Math.max(0, Math.min(depth, previous + 1, MAX_DEPTH));
        row.dataset.depth = String(depth);
        previous = depth;
      });
    }

    /* -------------------------------------------------------- saving */

    function queueSave() {
      clearTimeout(saveTimer);
      if (stateEl) stateEl.textContent = 'Saving…';
      saveTimer = setTimeout(doSave, 500);
    }

    function doSave() {
      normalizeDepths();
      CMS.postForm('/cms/api/menus/' + menuId, {
        name: nameInput.value,
        rows: readRows(),
        isMain: mainRadio && mainRadio.checked ? 1 : 0,
      }).then(function (res) {
        if (stateEl) stateEl.textContent = 'Draft saved';
        setDirty(res.dirty);
      }).catch(function (err) {
        if (stateEl) stateEl.textContent = 'Could not save';
        CMS.toast(err.message, 'error');
      });
    }

    function setDirty(isDirty) {
      if (publishBtn) publishBtn.disabled = !isDirty;
      if (dirtyPill) {
        dirtyPill.className = 'pill ' + (isDirty ? 'pill--draft' : 'pill--live');
        dirtyPill.textContent = isDirty ? 'Ej publicerad' : 'Published';
      }
    }

    /* --------------------------------------------------------- rows */

    function rowHtml(label, href, depth) {
      /* Every page, and under each one any section of it carrying an anchor.
         The list is built once on the server and shipped, so what this offers
         and what the rows rendered there offer cannot drift apart. Selection
         is set on the element afterwards rather than baked into the string. */
      var options = CMS.data.linkOptions || '';
      var known = options.indexOf('value="' + esc(href) + '"') >= 0;

      return '<div class="menu-item" data-menu-item data-depth="' + (depth || 0) + '" draggable="true">'
        + '<span class="menu-item__handle" data-handle title="Drag to move">'
        + '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
        + '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/>'
        + '<circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>'
        + '</svg></span>'
        + '<input type="text" class="grow" data-label value="' + esc(label) + '" placeholder="Menu label">'
        + '<div class="menu-item__target"><select data-target>'
        + '<option value="">Custom link…</option>' + options + '</select></div>'
        + '<input type="text" data-href value="' + esc(href) + '" placeholder="/adress" style="flex:0 0 150px"'
        + (known ? ' hidden' : '') + '>'
        + '<button class="icon-btn icon-btn--danger" type="button" data-remove title="Remove">'
        + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"'
        + ' stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/>'
        + '<path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'
        + '<path d="M6 7v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7"/><path d="M10 11v5M14 11v5"/></svg>'
        + '</button></div>';
    }

    function addRow(label, href, depth) {
      var wrapper = document.createElement('div');
      wrapper.innerHTML = rowHtml(label, href || '', depth || 0);
      var row = wrapper.firstChild;
      // The shipped option list carries no selection, so set it here.
      var target = row.querySelector('[data-target]');
      if (target) target.value = href || '';
      itemsHost.appendChild(row);
      bindRow(row);
      queueSave();
      return row;
    }

    function bindRow(row) {
      row.querySelector('[data-remove]').addEventListener('click', function () {
        row.remove();
        queueSave();
      });
      row.querySelector('[data-target]').addEventListener('change', function (event) {
        // Selecting "Custom link…" reveals the free-text field.
        row.querySelector('[data-href]').hidden = !!event.target.value;
        if (event.target.value) row.querySelector('[data-href]').value = event.target.value;
        queueSave();
      });
      row.querySelectorAll('input').forEach(function (input) {
        input.addEventListener('input', queueSave);
      });
      // Tab / Shift+Tab in the label field indents and outdents.
      row.querySelector('[data-label]').addEventListener('keydown', function (event) {
        if (event.key !== 'Tab') return;
        var rows = Array.prototype.slice.call(itemsHost.querySelectorAll('[data-menu-item]'));
        if (rows.indexOf(row) === 0 && !event.shiftKey) return;   // first row stays top level
        event.preventDefault();
        var depth = Number(row.dataset.depth) || 0;
        row.dataset.depth = String(event.shiftKey
          ? Math.max(0, depth - 1)
          : Math.min(MAX_DEPTH, depth + 1));
        normalizeDepths();
        queueSave();
      });
      bindDrag(row);
    }

    /* --------------------------------------------------------- drag */

    var dragging = null;
    var dragStartX = 0;
    var dragStartDepth = 0;

    function bindDrag(row) {
      row.addEventListener('dragstart', function (event) {
        // Only the handle initiates a drag, so text selection still works.
        dragging = row;
        dragStartX = event.clientX;
        dragStartDepth = Number(row.dataset.depth) || 0;
        row.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        try { event.dataTransfer.setData('text/plain', 'row'); } catch (e) {}
      });
      row.addEventListener('dragend', function () {
        row.classList.remove('is-dragging');
        clearMarks();
        dragging = null;
        normalizeDepths();
        queueSave();
      });
      row.addEventListener('dragover', function (event) {
        if (!dragging && !window.__menuPageDrag) return;
        event.preventDefault();
        clearMarks();
        var box = row.getBoundingClientRect();
        row.classList.add(event.clientY < box.top + box.height / 2 ? 'is-drop-before' : 'is-drop-after');
      });
      row.addEventListener('drop', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var box = row.getBoundingClientRect();
        var before = event.clientY < box.top + box.height / 2;
        clearMarks();

        if (window.__menuPageDrag) {
          var page = window.__menuPageDrag;
          window.__menuPageDrag = null;
          var fresh = addRow(page.label, page.href, Number(row.dataset.depth) || 0);
          row.parentNode.insertBefore(fresh, before ? row : row.nextSibling);
          normalizeDepths();
          queueSave();
          return;
        }
        if (!dragging) return;
        // Dropping a row on itself is how you indent without reordering.
        if (dragging !== row) {
          row.parentNode.insertBefore(dragging, before ? row : row.nextSibling);
        }
        applyHorizontalDepth(event.clientX);
        normalizeDepths();
        queueSave();
      });
    }

    function applyHorizontalDepth(clientX) {
      if (!dragging) return;
      var shift = Math.round((clientX - dragStartX) / INDENT_PX);
      var depth = Math.max(0, Math.min(MAX_DEPTH, dragStartDepth + shift));
      dragging.dataset.depth = String(depth);
    }

    function clearMarks() {
      itemsHost.querySelectorAll('.is-drop-before, .is-drop-after').forEach(function (n) {
        n.classList.remove('is-drop-before', 'is-drop-after');
      });
    }

    /* Dropping onto the empty area appends. */
    itemsHost.addEventListener('dragover', function (event) {
      if (dragging || window.__menuPageDrag) event.preventDefault();
    });
    itemsHost.addEventListener('drop', function (event) {
      if (window.__menuPageDrag) {
        event.preventDefault();
        var page = window.__menuPageDrag;
        window.__menuPageDrag = null;
        addRow(page.label, page.href, 0);
        return;
      }
      if (dragging) {
        event.preventDefault();
        itemsHost.appendChild(dragging);
        applyHorizontalDepth(event.clientX);
        normalizeDepths();
        queueSave();
      }
    });

    itemsHost.querySelectorAll('[data-menu-item]').forEach(bindRow);

    /* ------------------------------------------------------ controls */

    var addInput = section.querySelector('[data-new-item]');
    var addButton = section.querySelector('[data-add-item]');
    function addFromInput() {
      var label = addInput.value.trim();
      if (!label) return;
      addRow(label, '', 0);
      addInput.value = '';
      addInput.focus();
    }
    if (addButton) addButton.addEventListener('click', addFromInput);
    if (addInput) {
      addInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); addFromInput(); }
      });
    }

    nameInput.addEventListener('input', queueSave);
    if (mainRadio) {
      mainRadio.addEventListener('change', function () {
        clearTimeout(saveTimer);
        doSave();
        CMS.toast('Main menu updated');
      });
    }

    if (publishBtn) {
      publishBtn.addEventListener('click', function () {
        clearTimeout(saveTimer);
        CMS.postForm('/cms/api/menus/' + menuId, {
          name: nameInput.value,
          rows: readRows(),
          isMain: mainRadio && mainRadio.checked ? 1 : 0,
        })
          .then(function () { return CMS.postForm('/cms/api/menus/' + menuId + '/publish', {}); })
          .then(function (res) {
            setDirty(res.dirty);
            if (stateEl) stateEl.textContent = 'Published';
            CMS.toast('Menu published');
          })
          .catch(function (err) { CMS.toast(err.message, 'error'); });
      });
    }

    var duplicate = section.querySelector('[data-duplicate]');
    if (duplicate) {
      duplicate.addEventListener('click', function () {
        var form = document.createElement('form');
        form.method = 'post';
        form.action = '/cms/menus/' + menuId + '/duplicate';
        document.body.appendChild(form);
        form.submit();
      });
    }
  }

  /* Pages dragged in from the right-hand list. */
  document.querySelectorAll('[data-page]').forEach(function (item) {
    item.addEventListener('dragstart', function (event) {
      window.__menuPageDrag = { label: item.dataset.label, href: item.dataset.href };
      event.dataTransfer.effectAllowed = 'copy';
      try { event.dataTransfer.setData('text/plain', item.dataset.href); } catch (e) {}
    });
    item.addEventListener('dragend', function () {
      setTimeout(function () { window.__menuPageDrag = null; }, 60);
    });
  });
})();
