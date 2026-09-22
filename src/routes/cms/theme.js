import { html, redirect, parseForm } from '../../lib/http.js';
import { esc } from '../../lib/html.js';
import { icon } from '../../views/icons.js';
import { cmsLayout, cmsHead } from '../../views/cms/layout.js';
import { select, checkbox } from '../../views/cms/parts.js';
import {
  theme, saveTheme, LAYOUT_LIMITS, SCALE_LIMITS, TYPE_LIMITS, autoInk, fontStack,
} from '../../lib/theme.js';

/**
 * The face picker, over what is installed.
 *
 * Each option carries its own stack so the preview beside it can draw in the
 * face without asking anyone for it - the @font-face rules are already in
 * this page's head, because the CMS loads the site's theme to render the
 * canvas. Nothing here is fetched.
 */
function fontSelect(label, name, value, installed) {
  const options = installed.map((f) => `<option value="${esc(f.slug)}"`
    + ` data-stack="${esc(fontStack(f.slug, installed))}"`
    + `${f.slug === value ? ' selected' : ''}>${esc(f.name)}`
    + `${f.faces.length ? '' : ' — no files'}</option>`).join('');
  return `<div class="field">
    <label for="f-${esc(name)}">${esc(label)}</label>
    <select id="f-${esc(name)}" name="${esc(name)}">${options}</select>
  </div>`;
}

/** One editable colour. The id travels hidden so a rename keeps its CSS name. */
function colorRow(color = { id: '', name: '', value: '#ffffff', ink: '#1e1e1e' }) {
  return `<div class="swatch-row" data-color-row>
    <input type="hidden" name="color_id[]" value="${esc(color.id)}">
    <label class="swatch" title="Background">
      <input type="color" name="color_value[]" value="${esc(color.value)}" data-color-value>
      <span class="swatch__chip" style="background:${esc(color.value)}"></span>
    </label>
    <input class="swatch-row__name" type="text" name="color_name[]" value="${esc(color.name)}"
           placeholder="Name" maxlength="40" aria-label="Colour name">
    <label class="swatch swatch--ink" title="Text colour on this background">
      <input type="color" name="color_ink[]" value="${esc(color.ink)}" data-color-ink>
      <span class="swatch__chip" style="background:${esc(color.value)};color:${esc(color.ink)}">Aa</span>
    </label>
    <button class="icon-btn icon-btn--danger" type="button" data-remove-color
            title="Remove colour">${icon('trash', 15)}</button>
  </div>`;
}

const num = (label, name, value, [min, max], hint = '') => `
  <div class="field">
    <label for="l-${name}">${esc(label)}</label>
    <input id="l-${name}" type="number" name="${esc(name)}" value="${esc(String(value))}"
           min="${min}" max="${max}" step="1">
    ${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}
  </div>`;

/** One type size. No hint: the label is the word the panel uses for it. */
const typeNum = (label, name, value) => num(label, name, value, TYPE_LIMITS);

/**
 * The theme screen: the colours, faces and measures a site is built from.
 *
 * Deliberately the only place any of this is decided. A slice stores
 * "surface: ink", never a colour, so what "ink" looks like is changed here
 * once and the whole site follows - which is the difference between a theme
 * and a find-and-replace across every page.
 */
export function registerTheme(router, guard) {
  router.get('/cms/theme', guard((req, res, { user }) => {
    const current = theme();

    const center = `
      ${cmsHead('Theme')}
      <hr class="rule">
      <form method="post" action="/cms/theme" id="theme-form" class="stack" style="max-width:640px">

        <section class="panel">
          <h2 class="h-section" style="margin-bottom:var(--ui-s-2)">Colours</h2>
          <p class="tiny muted" style="margin:0 0 var(--ui-s-4)">
            The whole palette. Every colour is offered as a slice background and as a
            text colour, and each carries the text colour that reads on it — so picking
            a dark background gives light text without a second decision.</p>

          <div class="swatch-list" data-color-list>
            ${current.colors.map(colorRow).join('')}
          </div>

          <div class="row" style="margin-top:var(--ui-s-4);gap:var(--ui-s-3)">
            <button class="btn" type="button" data-add-color>${icon('plus', 16)} Add colour</button>
            <button class="btn" type="button" data-pick-from-image>${icon('image', 16)} Pick from an image</button>
            <input type="file" accept="image/*" hidden data-palette-image>
          </div>
          <p class="tiny muted" style="margin:var(--ui-s-3) 0 0">
            Picking from an image reads the eight most prominent colours out of it. The
            file is never uploaded — it is read in your browser and discarded.</p>
        </section>

        <section class="panel">
          <h2 class="h-section" style="margin-bottom:var(--ui-s-4)">Typography</h2>
          <div class="field-row">
            ${fontSelect('Headings', 'font_heading', current.fonts.heading, current.installed)}
            ${fontSelect('Body text', 'font_body', current.fonts.body, current.installed)}
          </div>
          ${num('Size', 'font_scale', current.fonts.scale, SCALE_LIMITS,
            'Percent. Scales every step of the type scale at once.')}
          <p class="tiny muted" style="margin:var(--ui-s-4) 0 0">
            ${current.installed.length === 1 ? 'One typeface is installed' : `${current.installed.length} typefaces are installed`},
            and this list is all of them — every face is served from this
            machine, so nothing is fetched from a font service and no visitor's
            address leaves the building to draw a page.
            <a href="/cms/theme/fonts">Add or remove typefaces →</a></p>
        </section>

        <details class="panel" data-type-sizes>
          <summary class="row" style="cursor:pointer;list-style:none;margin:0">
            ${icon('chevronRight', 16)}<span class="h-section" style="margin:0">Advanced type sizes</span>
          </summary>
          <p class="tiny muted" style="margin:var(--ui-s-3) 0 var(--ui-s-4)">
            What each name in an object’s Size menu measures, in pixels at full
            width. Nothing here needs touching to build a site — it is for when
            a step lands wrong against the ones either side of it. Phones take a
            share of the larger steps automatically, so these are the full-width
            numbers.</p>

          <h3 class="label" style="margin-bottom:var(--ui-s-2)">Heading</h3>
          <div class="field-row">
            ${typeNum('Small', 'h_small', current.type.hSmall)}
            ${typeNum('Medium', 'h_medium', current.type.hMedium)}
            ${typeNum('Large', 'h_large', current.type.hLarge)}
          </div>
          <div class="field-row" style="margin-top:var(--ui-s-3)">
            ${typeNum('Extra large', 'h_xlarge', current.type.hXlarge)}
            ${typeNum('Display', 'h_display', current.type.hDisplay)}
          </div>

          <h3 class="label" style="margin:var(--ui-s-5) 0 var(--ui-s-2)">Text</h3>
          <div class="field-row">
            ${typeNum('Small', 't_small', current.type.tSmall)}
            ${typeNum('Body', 't_body', current.type.tBody)}
          </div>
          <div class="field-row" style="margin-top:var(--ui-s-3)">
            ${typeNum('Large', 't_large', current.type.tLarge)}
            ${typeNum('Extra large', 't_xlarge', current.type.tXlarge)}
          </div>
        </details>

        <section class="panel">
          <h2 class="h-section" style="margin-bottom:var(--ui-s-2)">Measures</h2>
          <p class="tiny muted" style="margin:0 0 var(--ui-s-4)">
            How wide content draws, in pixels. A slice stores which of these it wants,
            not a measurement, so changing one here moves every page that uses it.</p>
          <div class="field-row">
            ${num('Narrow', 'w_narrow', current.layout.narrow, LAYOUT_LIMITS.narrow, 'Reading measure.')}
            ${num('Body', 'w_body', current.layout.body, LAYOUT_LIMITS.body, 'The default column.')}
          </div>
          <div class="field-row">
            ${num('Wide', 'w_wide', current.layout.wide, LAYOUT_LIMITS.wide, 'Wide bands, and the top bar the menu has to fit inside.')}
            ${num('Gutter', 'w_gutter', current.layout.gutter, LAYOUT_LIMITS.gutter, 'Space at the window edge.')}
          </div>
          ${checkbox({
            label: 'Centre an article\u2019s reading column', name: 'center_text',
            checked: !!current.layout.centerText,
            hint: 'The column moves to the middle of the page. The words inside it stay left-aligned.',
          })}
        </section>
      </form>`;

    const footer = `
      <span class="cms-actions__status">Changes take effect immediately, on every page.</span>
      <button class="btn btn--accent" type="submit" form="theme-form">Save theme</button>`;

    // The preview is scoped to its own element so the live theme in the head
    // keeps styling the rest of the CMS's canvas while this shows the edit.
    const right = `
      <h2 class="h-tool" style="margin-bottom:var(--ui-s-4)">Preview</h2>
      <div class="theme-preview" data-theme-preview>
        <div class="theme-preview__surfaces" data-preview-surfaces></div>
        <div class="theme-preview__type" data-preview-type>
          <p class="theme-preview__h">Heading</p>
          <p class="theme-preview__b">Body text at the chosen face and size, long enough
            to show how the two faces sit together.</p>
        </div>
      </div>
      <p class="tiny muted" style="margin-top:var(--ui-s-4)">
        Measures are shown as proportions — the panel is narrower than any real page.
        The two type sizes above are real: Heading large and Body, at the numbers
        set for them.</p>`;

    html(res, cmsLayout({
      title: 'Theme', user, path: '/cms/theme', center, right, footer,
      scripts: ['/assets/cms-theme.js'],
      data: { page: 'theme', rowTemplate: colorRow({ id: '', name: '', value: '#cccccc', ink: '#1e1e1e' }) },
    }));
  }, 'admin'));

  router.post('/cms/theme', guard(async (req, res) => {
    const { fields } = await parseForm(req);
    const list = (key) => {
      const value = fields[key];
      return Array.isArray(value) ? value : (value === undefined ? [] : [value]);
    };
    const names = list('color_name');
    const values = list('color_value');
    const inks = list('color_ink');
    const ids = list('color_id');

    const colors = names.map((name, i) => ({
      // A blank id means a row added in the browser: derive it from the name.
      id: String(ids[i] || '').trim() || String(name || ''),
      name,
      value: values[i],
      ink: inks[i] || autoInk(values[i]),
    // A row with neither name nor colour is one the author emptied, not a colour.
    })).filter((c) => String(c.name || '').trim() || String(c.id || '').trim());

    saveTheme({
      colors,
      fonts: { body: fields.font_body, heading: fields.font_heading, scale: fields.font_scale },
      layout: {
        narrow: fields.w_narrow, body: fields.w_body,
        wide: fields.w_wide, gutter: fields.w_gutter,
        // An unticked checkbox posts nothing, so absent has to mean off here
        // - unlike the article form's parent, where absent means "unsaid".
        centerText: !!fields.center_text,
      },
      type: {
        hSmall: fields.h_small, hMedium: fields.h_medium, hLarge: fields.h_large,
        hXlarge: fields.h_xlarge, hDisplay: fields.h_display,
        tSmall: fields.t_small, tBody: fields.t_body,
        tLarge: fields.t_large, tXlarge: fields.t_xlarge,
      },
    });
    redirect(res, '/cms/theme?saved=1');
  }, 'admin'));

}
