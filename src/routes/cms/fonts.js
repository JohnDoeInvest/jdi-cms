import { html, redirect, parseForm } from '../../lib/http.js';
import { esc } from '../../lib/html.js';
import { icon } from '../../views/icons.js';
import { cmsLayout, cmsHead } from '../../views/cms/layout.js';
import { formatBytes } from '../../views/helpers.js';
import {
  list, byId, create, addFaces, setFaces, removeFace, remove, rename,
  storeFontFile, guessFace, stackFor, WEIGHTS, STYLES, FALLBACKS, CHARSETS,
} from '../../lib/fonts.js';

/**
 * Typefaces: the screen where a font arrives.
 *
 * Its own screen rather than a panel on Theme, for the same reason the media
 * library is not part of the page editor: installing an asset and choosing
 * one are different jobs, done at different times, by someone in a different
 * frame of mind. Theme decides which face; this decides what there is.
 */

const pick = (name, value, options, label) => `
  <label class="tiny muted" style="display:block">${esc(label)}
    <select name="${esc(name)}" style="display:block;margin-top:2px">
      ${options.map(([v, l]) =>
        `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}
    </select>
  </label>`;

/** One face: what it is, and the two controls that fix a wrong guess. */
function faceRow(font, face) {
  return `<div class="row" style="gap:var(--ui-s-3);padding:var(--ui-s-2) 0;border-top:1px solid var(--ui-line-soft)">
    <input type="hidden" name="filename[]" value="${esc(face.filename)}">
    ${pick('weight[]', face.weight, WEIGHTS, 'Weight')}
    ${pick('style[]', face.style, STYLES, 'Style')}
    ${pick('charset[]', face.charset || '', CHARSETS, 'Characters')}
    <span class="tiny muted grow truncate" title="${esc(face.filename)}">
      ${esc(face.filename)} · ${esc(face.format)} · ${formatBytes(face.bytes)}</span>
    <button class="icon-btn icon-btn--danger" type="submit" title="Remove this face"
            formaction="/cms/theme/fonts/${font.id}/face/delete"
            name="drop" value="${esc(face.filename)}">${icon('trash', 15)}</button>
  </div>`;
}

/**
 * One installed family.
 *
 * The specimen is drawn in the face itself, which costs nothing: the CMS
 * already carries every installed @font-face in its head so the editor canvas
 * can look like the site. So the list shows the thing rather than its name.
 */
function fontCard(font, { onlyOne }) {
  const specimen = font.faces.length
    ? `<p style="font-family:${esc(stackFor(font))};font-size:30px;margin:var(--ui-s-3) 0 0;line-height:1.2">
         Handgjord mat — 0123</p>`
    : `<p class="tiny" style="color:var(--ui-warning);margin:var(--ui-s-3) 0 0">
         No files yet, so this family draws as its fallback. Add one below.</p>`;

  return `<section class="panel" style="margin-bottom:var(--ui-s-5)">
    <form method="post" action="/cms/theme/fonts/${font.id}" class="stack">
      <div class="row">
        <input class="grow" type="text" name="name" value="${esc(font.name)}" maxlength="60"
               aria-label="Family name" style="font-weight:600">
        ${pick('fallback', font.fallback, FALLBACKS, 'Falls back to')}
        ${font.builtin ? '<span class="tiny muted">Shipped</span>' : ''}
      </div>
      ${specimen}

      ${font.faces.length ? font.faces.map((f) => faceRow(font, f)).join('') : ''}

      <div class="row" style="margin-top:var(--ui-s-3)">
        <button class="btn btn--primary" type="submit">Save</button>
        <span class="grow"></span>
        ${onlyOne
          ? `<span class="tiny muted">The only typeface installed — upload another
               before removing this one, or the site would have none.</span>`
          : `<button class="btn btn--danger" type="submit"
                     formaction="/cms/theme/fonts/${font.id}/delete"
                     data-confirm="Remove ${esc(font.name)} and its files?">Remove</button>`}
      </div>
    </form>

    <form method="post" action="/cms/theme/fonts/${font.id}/upload"
          enctype="multipart/form-data" class="row"
          style="margin-top:var(--ui-s-4);padding-top:var(--ui-s-4);border-top:1px solid var(--ui-line)">
      <input type="file" name="files" multiple accept=".woff2,.woff,.ttf,.otf">
      <button class="btn" type="submit">${icon('plus', 16)} Add a face</button>
    </form>
  </section>`;
}

export function registerFonts(router, guard) {
  router.get('/cms/theme/fonts', guard((req, res, { user, url }) => {
    const fonts = list();
    const note = url.searchParams.get('note') || '';

    const center = `
      ${cmsHead('Typefaces')}
      <hr class="rule">

      <p class="muted" style="max-width:640px;margin-bottom:var(--ui-s-5)">
        Every face this site draws with is a file on this machine. Nothing is
        fetched from a font service, which means no visitor's address, browser
        or current page is handed to one in order to render a page — the whole
        point of running the server yourself.
        <br><br>
        The trade is that you supply the files. Download an open licensed
        family (Google Fonts, Fontsource and the foundries' own sites all offer
        the files directly), then add it here. <strong>woff2</strong> is the
        format to prefer — it is a quarter the size of the same face as .ttf —
        but .woff, .ttf and .otf all work.
      </p>

      ${note ? `<p class="notice notice--warn">${esc(note)}</p>` : ''}

      ${fonts.map((f) => fontCard(f, { onlyOne: fonts.length === 1 })).join('')}

      <section class="panel">
        <h2 class="h-section" style="margin-bottom:var(--ui-s-2)">Add a typeface</h2>
        <p class="tiny muted" style="margin:0 0 var(--ui-s-4)">
          Name it as the family is named — that name is what the browser is
          asked for. Weight, style and character set are read from each
          filename and can be corrected afterwards. Upload every file of the
          family at once; a family split across several subsets
          (<code>latin</code>, <code>latin-ext</code>…) is normal, and saying
          which is which is what keeps them from replacing each other.</p>
        <form method="post" action="/cms/theme/fonts" enctype="multipart/form-data" class="stack">
          <div class="field-row">
            <div class="field">
              <label for="new-name">Family name</label>
              <input id="new-name" type="text" name="name" placeholder="Söhne" maxlength="60" required>
            </div>
            ${pick('fallback', 'sans', FALLBACKS, 'Falls back to')}
          </div>
          <div class="field">
            <label for="new-files">Font files</label>
            <input id="new-files" type="file" name="files" multiple required
                   accept=".woff2,.woff,.ttf,.otf">
          </div>
          <div class="row"><button class="btn btn--primary" type="submit">Add typeface</button></div>
        </form>
      </section>`;

    html(res, cmsLayout({ title: 'Typefaces', user, path: '/cms/theme', center }));
  }, 'admin'));

  /* Files arrive as bytes and are trusted as nothing else: what a file *is*
     decides where it lands and what it is called, never what it was named. */
  const facesFrom = (files) => files
    .filter((f) => f.data?.length)
    .map((file) => {
      const stored = storeFontFile(file);
      return stored && { ...stored, ...guessFace(file.filename) };
    })
    .filter(Boolean);

  const refusedNote = (files, kept) => {
    const dropped = files.length - kept;
    if (dropped < 1) return '';
    return dropped === 1
      ? 'One file was not a font and was ignored — a name ending in .woff2 is '
        + 'not enough, the file has to be one.'
      : `${dropped} files were not fonts and were ignored — a name ending in `
        + '.woff2 is not enough, the file has to be one.';
  };

  router.post('/cms/theme/fonts', guard(async (req, res) => {
    const { fields, files } = await parseForm(req);
    const faces = facesFrom(files);
    const font = create({ name: fields.name, fallback: fields.fallback, faces });
    const note = refusedNote(files.filter((f) => f.data?.length), faces.length);
    redirect(res, `/cms/theme/fonts${note ? `?note=${encodeURIComponent(note)}` : `#f${font.id}`}`);
  }, 'admin'));

  router.post('/cms/theme/fonts/:id/upload', guard(async (req, res, { params }) => {
    const { files } = await parseForm(req);
    const faces = facesFrom(files);
    addFaces(params.id, faces);
    const note = refusedNote(files.filter((f) => f.data?.length), faces.length);
    redirect(res, `/cms/theme/fonts${note ? `?note=${encodeURIComponent(note)}` : ''}`);
  }, 'admin'));

  /* Renaming and correcting the faces are one form, because they are one
     thought: this is what the family is and this is what is in it. */
  router.post('/cms/theme/fonts/:id', guard(async (req, res, { params }) => {
    const { fields } = await parseForm(req);
    const asList = (key) => {
      const value = fields[key];
      return Array.isArray(value) ? value : (value === undefined ? [] : [value]);
    };
    const filenames = asList('filename');
    const weights = asList('weight');
    const styles = asList('style');
    const charsets = asList('charset');
    rename(params.id, { name: fields.name, fallback: fields.fallback });
    setFaces(params.id, filenames.map((filename, i) => ({
      filename, weight: weights[i], style: styles[i], charset: charsets[i],
    })));
    redirect(res, '/cms/theme/fonts');
  }, 'admin'));

  router.post('/cms/theme/fonts/:id/face/delete', guard(async (req, res, { params }) => {
    const { fields } = await parseForm(req);
    removeFace(params.id, fields.drop);
    redirect(res, '/cms/theme/fonts');
  }, 'admin'));

  router.post('/cms/theme/fonts/:id/delete', guard(async (req, res, { params }) => {
    const font = byId(params.id);
    const result = remove(params.id);
    /* Refusing to remove the last one is not an error to hide: it is the rule
       that keeps a site from having no typeface at all, and the only way past
       it is to add the replacement first. */
    const note = result.ok ? '' : (result.why === 'last'
      ? `${font ? font.name : 'That typeface'} is the only one installed, so it stays `
        + 'until another is added. A site with no typeface draws in whatever the '
        + 'visitor’s browser keeps for last resort.'
      : 'That typeface is no longer here.');
    redirect(res, `/cms/theme/fonts${note ? `?note=${encodeURIComponent(note)}` : ''}`);
  }, 'admin'));
}
