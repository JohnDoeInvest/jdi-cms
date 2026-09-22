import { html, redirect, parseForm, json } from '../../lib/http.js';
import { esc } from '../../lib/html.js';
import { icon } from '../../views/icons.js';
import { cmsLayout, cmsHead } from '../../views/cms/layout.js';
import {
  field, textarea, select, checkbox, emptyState, rowActions, dateCell,
} from '../../views/cms/parts.js';
import { editorPanel } from '../../views/cms/editor.js';
import { forms } from '../../models.js';
import {
  normalizeBlocks, wrapInSlice, FORM_OBJECT_ORDER, allowedInForm, BUTTON_SIZES,
} from '../../lib/objects.js';
import { theme } from '../../lib/theme.js';
import { countryOptions } from '../../lib/phone.js';
import * as settings from '../../lib/settings.js';
import { formFields } from '../../views/render.js';

/**
 * Forms: written on the same canvas everything else is.
 *
 * A form used to be page content - the fields lived inside a Form object in a
 * page's blocks - so the same contact form on three pages was three forms
 * that drifted. It exists once now and pages point at it.
 *
 * The screen is the page editor with the palette cut down to what belongs in
 * a form. Deliberately not a bespoke list of rows with its own label and
 * placeholder inputs: the elements to build a form were already in the page
 * editor, and rebuilding them here would have been a second, weaker editor
 * beside a good one - and a second answer to "how do I put a heading above
 * these fields", which is a Heading.
 */

const COLOUR_NONE = 'Plain — the theme’s default outline';

function formCard(colors, form) {
  const swatch = (colour) => {
    const on = (form.colour || '') === colour.id;
    return `<button class="swatch-pick${on ? ' is-on' : ''}" type="button"
      data-colour="${esc(colour.id)}" aria-pressed="${on ? 'true' : 'false'}"
      title="${esc(colour.name)}" aria-label="${esc(colour.name)}">
      <span class="swatch-pick__chip" style="background:${esc(colour.value)}"></span></button>`;
  };
  return `
    <section class="panel" style="margin-bottom:var(--ui-s-5)">
      <h2 class="h-section" style="margin-bottom:var(--ui-s-4)">Setup</h2>
      <div class="stack">
      ${field({ label: 'Send to', name: 'recipient', value: form.recipient,
        placeholder: 'Leave empty to use the site default',
        extra: 'data-form-field="recipient"' })}
      ${field({ label: 'Email subject', name: 'subject', value: form.subject,
        placeholder: form.name, extra: 'data-form-field="subject"' })}
      ${textarea({ label: 'Confirmation message', name: 'success_message', rows: 3,
        value: form.success_message, placeholder: 'Thank you for your message!',
        extra: 'data-form-field="success_message"' })}
      </div>
    </section>

    <section class="panel">
      <h2 class="h-section" style="margin-bottom:var(--ui-s-4)">Submit button</h2>
      <div class="stack">
      ${field({ label: 'Label', name: 'submit_label', value: form.submit_label,
        placeholder: 'Send', extra: 'data-form-field="submit_label"' })}
      <div class="field">
        <label>Colour</label>
        <div class="swatch-grid" data-colour-group>
          <button class="swatch-pick swatch-pick--none${form.colour ? '' : ' is-on'}" type="button"
            data-colour="" aria-pressed="${form.colour ? 'false' : 'true'}"
            title="${COLOUR_NONE}" aria-label="${COLOUR_NONE}">
            <span class="swatch-pick__chip swatch-pick__chip--none"></span></button>
          ${colors.map(swatch).join('')}
        </div>
      </div>
      ${checkbox({ label: 'Outline only', name: 'outline', checked: form.outline,
        extra: 'data-form-field="outline"' })}
      ${select({ label: 'Size', name: 'button_size', value: form.button_size,
        options: BUTTON_SIZES.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })),
        extra: 'data-form-field="button_size"' })}
      </div>
    </section>`;
}

export function registerForms(router, guard) {
  router.get('/cms/forms', guard((req, res, { user }) => {
    const list = forms.list();

    const rows = list.map((f) => {
      const count = formFields(f).length;
      const used = forms.usage(f.id);
      return `<tr>
        <td><a class="cell-link truncate" href="/cms/forms/${f.id}/edit">${esc(f.name)}</a>
          <div class="tiny muted">${esc(f.recipient || 'Site default recipient')}</div></td>
        <td class="col-narrow"><span class="pill">${count} field${count === 1 ? '' : 's'}</span></td>
        <td class="col-narrow"><span class="small muted">${
          used.length ? `On ${used.length} page${used.length === 1 ? '' : 's'}` : 'Not placed yet'}</span></td>
        <td class="col-narrow">${dateCell(f.updated_at)}</td>
        <td class="actions">${rowActions({
          editHref: `/cms/forms/${f.id}/edit`,
          deleteAction: `data-delete-form="${f.id}" data-title="${esc(f.name)}" data-usage="${used.length}"`,
        })}</td>
      </tr>`;
    }).join('');

    const center = `
      ${cmsHead('Forms', `
        <form method="post" action="/cms/forms" class="row" style="gap:var(--ui-s-2)">
          <input type="text" name="name" placeholder="Form name" required style="max-width:220px">
          <button class="btn btn--primary" type="submit">${icon('plus', 17)} Create</button>
        </form>`)}
      <hr class="rule">
      <p class="muted" style="max-width:640px;margin-bottom:var(--ui-s-5)">
        A form lives here and pages point at it, so the same form on three
        pages stays one form — one recipient, one set of fields, one place to
        change them. Place one on a page with the <strong>Form</strong> block.</p>
      ${list.length ? `<table class="table">
        <thead><tr><th>Name</th><th>Fields</th><th>Used</th><th>Changed</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table>` : emptyState('No forms yet. Create one above.')}`;

    html(res, cmsLayout({
      title: 'Forms', user, path: '/cms/forms', center,
      data: { page: 'forms' },
    }));
  }, 'editor'));

  router.post('/cms/forms', guard(async (req, res) => {
    const { fields } = await parseForm(req);
    const form = forms.create(fields.name);
    redirect(res, `/cms/forms/${form.id}/edit`);
  }, 'editor'));

  router.post('/cms/forms/:id/delete', guard(async (req, res, { params }) => {
    forms.remove(params.id);
    redirect(res, '/cms/forms');
  }, 'editor'));

  /* --------------------------------------------------------------- editor */

  router.get('/cms/forms/:id/edit', guard((req, res, { user, params }) => {
    const form = forms.byId(params.id);
    if (!form) return redirect(res, '/cms/forms');
    const used = forms.usage(form.id);

    const center = `
      <nav class="crumbs" style="margin-bottom:var(--ui-s-3)">
        <a class="crumbs__step" href="/cms/forms">Forms</a>
        <span class="crumbs__sep">${icon('chevronRight', 14)}</span>
        <span class="crumbs__here">${esc(form.name)}</span>
      </nav>
      <div class="cms-head">
        <input class="grow" type="text" value="${esc(form.name)}" maxlength="80" aria-label="Form name"
               data-form-field="name"
               style="font-size:var(--ui-fs-xl);font-weight:700;letter-spacing:var(--ui-tracking-tight);border:0;background:none;padding:0;height:auto">
        <span class="pill pill--saved" data-save-state></span>
      </div>
      <p class="tiny muted" style="margin:0 0 var(--ui-s-5)">
        ${used.length
          ? `On ${used.map((p) => `<a href="/cms/pages/${p.id}/edit">${esc(p.title)}</a>`).join(', ')}.`
          : 'Not on any page yet — place it with the Form block in the page editor.'}</p>

      ${formCard(theme().colors, form)}

      <h2 class="h-section" style="margin:var(--ui-s-6) 0 var(--ui-s-3)">Fields</h2>
      <div class="canvas canvas--flat" data-canvas>
        <div class="canvas__hint" data-canvas-hint>Drag fields here from the panel on the right.</div>
      </div>
      <button class="btn btn--full" type="button" data-add-block style="margin-top:var(--ui-s-3)">
        ${icon('plus', 17)} Add field</button>`;

    html(res, cmsLayout({
      title: form.name, user, path: '/cms/forms', center,
      /* No Slice: a form is a set, so a band is not something it can hold. */
      right: editorPanel({ kinds: FORM_OBJECT_ORDER, saved: false, slice: false }),
      /* Autosaves like every other canvas, but the button is here anyway:
         with no Publish beside it the screen read as though nothing could be
         saved at all, which is worse than a button nobody needs to press. */
      footer: `<span class="cms-actions__status">Saves as you work.</span>
        <button class="btn btn--accent" type="button" data-save="">Save now</button>`,
      scripts: ['/assets/cms-editor.js'],
      data: {
        page: 'form-editor',
        mode: 'form',
        savedAt: form.updated_at,
        /* Wrapped in one slice for the canvas, which is built around blocks,
           and unwrapped again on save. A form is a flat set: no slice chrome
           is drawn, no Slice is in the palette, and nothing about a band -
           background, padding, width - is offered on this screen.
           Built by `wrapInSlice` rather than by hand, because the canvas
           addresses a drop target by its slice's id and a hand-built wrapper
           had none: `data-owner` came out empty, the drop looked up a slice
           that did not exist, and dragging a field in did nothing at all. */
        blocks: [wrapInSlice(form.objects)],
        flat: true,
        media: {},
        slices: [],
        colors: theme().colors,
        /* The prefix list and the country a new phone field starts on, so the
           canvas and the panel read the same list the site renders from. */
        countries: countryOptions(),
        country: settings.get('site_country') || '',
        frame: 'default',
        trail: [],
        embedProviders: [],
        objectKinds: FORM_OBJECT_ORDER,
        linkOptions: [],
        saveUrl: `/cms/api/forms/${form.id}`,
      },
    }));
  }, 'editor'));

  /**
   * The canvas save, and the settings with it.
   *
   * One endpoint, because a form has one save: no draft and no publish, so
   * what the screen shows is what the site draws. A menu earns that pair
   * because it is composed over sittings; a form is a short list with a
   * destination and is closer to Settings.
   */
  router.post('/cms/api/forms/:id', guard(async (req, res, { params }) => {
    const { fields } = await parseForm(req);
    const form = forms.byId(params.id);
    if (!form) return json(res, { error: 'That form does not exist' }, 404);

    const data = {};
    if (fields.blocks !== undefined) {
      /* Flattened back out of the canvas's single slice, and filtered: the
         palette is in the browser, so the server refuses what it does not
         offer - the same rule an article follows. A form carrying a table or
         an article feed would be a form the editor cannot show you. */
      data.objects = normalizeBlocks(fields.blocks || [])
        .flatMap((block) => block.columns.flatMap((col) => col.objects))
        .filter((obj) => allowedInForm(obj.kind));
    }
    for (const key of ['name', 'recipient', 'subject', 'success_message', 'submit_label',
      'colour', 'button_size']) {
      if (fields[key] !== undefined) data[key] = fields[key];
    }
    if (fields.outline !== undefined) data.outline = !!fields.outline && fields.outline !== 'false';

    const saved = forms.update(params.id, data);
    json(res, { ok: true, savedAt: saved.updated_at });
  }, 'editor'));

  /** What a form is on, asked before it is deleted. */
  router.get('/cms/api/forms/:id/usage', guard((req, res, { params }) => {
    json(res, { pages: forms.usage(params.id) });
  }, 'editor'));

  /** The forms a page editor can offer, for the Form block's picker. */
  router.get('/cms/api/forms', guard((req, res) => {
    json(res, {
      forms: forms.list().map((f) => ({
        id: f.id, name: f.name, fields: formFields(f).length,
      })),
    });
  }, 'editor'));
}
