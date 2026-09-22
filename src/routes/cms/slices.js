import { redirect, parseForm, json } from '../../lib/http.js';
import { slices, media } from '../../models.js';
import { sliceDefinition, walkObjects } from '../../lib/objects.js';
import { publicMedia } from './media.js';

/**
 * Slice storage.
 *
 * There is no separate Slice designer screen any more: slices are built in
 * the page editor and saved from a block's own tool row, then dragged back in
 * from the panel's "Saved" tab. These endpoints are what that talks to.
 */
export function registerSlices(router, guard) {
  /** List, for refreshing the panel after a save. */
  router.get('/cms/api/slices', guard((req, res) => {
    json(res, {
      items: slices.list().map((s) => ({
        id: s.id, name: s.name, usage: slices.usage(s.id).length,
      })),
    });
  }));

  /** Create, or overwrite an existing slice when `id` is supplied. */
  router.post('/cms/api/slices', guard(async (req, res, { user }) => {
    const { fields } = await parseForm(req);
    const name = String(fields.name || '').trim();
    if (!name) return json(res, { error: 'Give the slice a name first.' }, 400);

    // A slice definition is the slice itself: its layout and its columns.
    const definition = sliceDefinition(fields.definition || {});
    const empty = definition.columns.every((col) => !col.objects.length);
    if (empty) return json(res, { error: 'That slice is empty.' }, 400);

    const id = Number(fields.id) || null;
    const saved = id ? slices.update(id, name, definition) : slices.create(name, definition, user.id);
    if (!saved) return json(res, { error: 'That slice does not exist' }, 404);
    json(res, { ok: true, id: saved.id, name: saved.name, updated: !!id });
  }, 'editor'));

  /** Read one slice plus the media it references, for dropping onto a page. */
  router.get('/cms/api/slices/:id', guard((req, res, { params }) => {
    const slice = slices.byId(Number(params.id));
    if (!slice) return json(res, { error: 'That slice does not exist' }, 404);
    const ids = [];
    for (const obj of walkObjects([slice.definition])) {
      if (obj.props?.media) ids.push(obj.props.media);
    }
    json(res, {
      id: slice.id,
      name: slice.name,
      definition: slice.definition,
      media: Object.fromEntries([...media.byIds(ids)].map(([mid, m]) => [mid, publicMedia(m)])),
    });
  }));

  router.post('/cms/slices/:id/delete', guard((req, res, { params }) => {
    slices.remove(Number(params.id));
    redirect(res, req.headers.referer || '/cms/pages');
  }, 'editor'));
}
