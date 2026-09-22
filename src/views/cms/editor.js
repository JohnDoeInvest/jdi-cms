import { esc } from '../../lib/html.js';
import { icon } from '../icons.js';
import { OBJECTS, OBJECT_ORDER } from '../../lib/objects.js';

const libItem = (kind) => `
  <div class="lib__item" draggable="true" data-object-kind="${esc(kind)}">
    ${icon(OBJECTS[kind].icon, 18)}<span>${esc(OBJECTS[kind].label)}</span>
  </div>`;

/**
 * Draggable palette of building blocks.
 *
 * Slice sits at the top, above a divider. It is a level up from everything
 * below it rather than one of them, but a page is built slice first and then
 * filled - so putting it where the hand already is beats putting it where the
 * hierarchy would.
 */
export const objectLibrary = ({ kinds = OBJECT_ORDER, slice = true } = {}) => `
  <div class="lib" data-object-lib>
    ${slice ? `<div class="lib__item lib__item--slice" draggable="true" data-object-kind="slice">
      ${icon('slices', 18)}<span>Slice</span>
    </div>
    <div class="lib__sep" role="separator"></div>` : ''}
    ${kinds.map(libItem).join('')}
  </div>`;

/** One saved slice, draggable onto the canvas. */
export const savedSliceItem = (slice) => `
  <div class="lib__item lib__item--saved" draggable="true" data-slice-id="${slice.id}">
    ${icon('slices', 18)}
    <span class="grow truncate">${esc(slice.name)}</span>
    <button class="icon-btn icon-btn--danger" type="button" data-delete-saved-slice="${slice.id}"
            data-title="${esc(slice.name)}" data-usage="${slice.usage ?? 0}"
            title="Delete slice">${icon('trash', 15)}</button>
  </div>`;

/**
 * The editor's right-hand column.
 *
 * Three tabs: context-sensitive properties for whatever is selected, the
 * saved slices, and the building blocks. Settings living here is what lets
 * the canvas show content and nothing else.
 */
export const editorPanel = ({ slices = [], kinds = null, saved = true, slice = true } = {}) => `
  <div class="panel-tabs" data-panel>
    <div class="panel-tabs__bar" role="tablist">
      <button class="panel-tabs__tab" role="tab" type="button" data-tab="props" aria-selected="false">
        ${icon('settings', 16)}<span>Properties</span>
      </button>
      ${saved ? `<button class="panel-tabs__tab" role="tab" type="button" data-tab="saved" aria-selected="false">
        ${icon('slices', 16)}<span>Saved</span>
      </button>` : ''}
      <button class="panel-tabs__tab is-active" role="tab" type="button" data-tab="blocks" aria-selected="true">
        ${icon('columns2', 16)}<span>Blocks</span>
      </button>
    </div>

    <section class="panel-tabs__pane" data-pane="props" hidden>
      <p class="tiny muted" data-props-empty>Select something on the canvas to edit its settings.</p>
      <div class="stack" data-props-body hidden></div>
    </section>

    ${saved ? `<section class="panel-tabs__pane" data-pane="saved" hidden>
      <p class="tiny muted" style="margin:0 0 var(--ui-s-3)">
        Drag a saved slice onto the canvas. Save new ones from a block's toolbar.</p>
      <div class="lib" data-slice-lib>
        ${slices.length
          ? slices.map(savedSliceItem).join('')
          : '<p class="tiny muted">No saved slices yet.</p>'}
      </div>
    </section>` : ''}

    <section class="panel-tabs__pane is-active" data-pane="blocks">
      <p class="tiny muted" style="margin:0 0 var(--ui-s-3)">
        Drag onto the canvas, or click one and press <kbd class="kbd">Enter</kbd> to place it.
        <kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> move through the list.</p>
      ${objectLibrary(kinds ? { kinds, slice } : { slice })}
    </section>
  </div>`;
