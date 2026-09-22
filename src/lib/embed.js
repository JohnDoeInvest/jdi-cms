/**
 * Third-party embeds.
 *
 * An embed takes a URL, not markup. Pasting arbitrary HTML or an arbitrary
 * `<iframe>` into a page would hand whoever writes the page the ability to run
 * script on the site's own origin, and page content is otherwise strictly
 * sanitised - this would be the one hole in it.
 *
 * So: a provider is recognised by its host, its id pulled out of the URL, and
 * the iframe built here from a shape this file controls. A URL that matches
 * nothing renders as a plain link, which is honest and still useful.
 *
 * Adding a provider is one entry. `hosts` is what the editor matches on to
 * label the card, and is shipped to it so the list is stated once.
 */
export const EMBED_PROVIDERS = [
  { id: 'youtube', name: 'YouTube', ratio: '16 / 9',
    hosts: ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com', 'youtube-nocookie.com'] },
  { id: 'vimeo', name: 'Vimeo', ratio: '16 / 9',
    hosts: ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'] },
  { id: 'maps', name: 'Google Maps', ratio: '4 / 3',
    hosts: ['google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl'] },
  { id: 'spotify', name: 'Spotify', ratio: '',
    hosts: ['open.spotify.com', 'spotify.com'] },
];

export const providerFor = (host) =>
  EMBED_PROVIDERS.find((p) => p.hosts.includes(String(host || '').toLowerCase())) || null;

/** The provider list as the editor needs it: enough to label a card. */
export const embedProviderList = () =>
  EMBED_PROVIDERS.map(({ id, name, hosts }) => ({ id, name, hosts }));

/**
 * The origins an embed's iframe is ever pointed at.
 *
 * Stated here rather than in the Content-Security-Policy, because this file
 * is what builds the src: a provider added above must not need a second edit
 * somewhere else to be allowed to draw, and a policy listing a host nobody
 * frames any more is a hole nobody notices.
 */
export const EMBED_FRAME_ORIGINS = [
  'https://www.youtube-nocookie.com',
  'https://player.vimeo.com',
  'https://open.spotify.com',
  'https://www.google.com',
];

/**
 * Parse an embed URL into what it takes to draw it.
 *
 * Returns `{ provider, src, ratio, title }`, or null when the URL is not
 * something this file knows how to frame. Never returns a src it did not
 * build itself.
 */
export function parseEmbed(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl || '').trim()); } catch { return null; }
  if (url.protocol !== 'https:') return null;      // no http, no javascript:, no data:

  const provider = providerFor(url.hostname);
  if (!provider) return null;

  const id = (value) => (/^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null);

  switch (provider.id) {
    case 'youtube': {
      // youtu.be/<id>, /watch?v=<id>, /embed/<id>, /shorts/<id>
      const path = url.pathname.split('/').filter(Boolean);
      const key = url.hostname.endsWith('youtu.be')
        ? path[0]
        : (url.searchParams.get('v') || (['embed', 'shorts', 'v'].includes(path[0]) ? path[1] : null));
      const videoId = id(key);
      if (!videoId) return null;
      // nocookie: an embed should not set a tracking cookie on a page visit.
      return { provider, src: `https://www.youtube-nocookie.com/embed/${videoId}`, ratio: provider.ratio };
    }

    case 'vimeo': {
      const path = url.pathname.split('/').filter(Boolean);
      const videoId = id(path[path.length - 1]);
      if (!videoId || !/^\d+$/.test(videoId)) return null;
      return { provider, src: `https://player.vimeo.com/video/${videoId}`, ratio: provider.ratio };
    }

    case 'spotify': {
      // /track/<id>, /album/<id>, /playlist/<id>, /episode/<id>, /show/<id>
      const [kind, key] = url.pathname.split('/').filter(Boolean).slice(-2);
      const allowed = ['track', 'album', 'playlist', 'episode', 'show', 'artist'];
      if (!allowed.includes(kind) || !id(key)) return null;
      return {
        provider,
        src: `https://open.spotify.com/embed/${kind}/${key}`,
        // Spotify's own player is a fixed height, not a ratio.
        height: kind === 'track' ? 152 : 352,
      };
    }

    case 'maps': {
      // Only Google's own embed URL, which already carries a key-scoped query.
      // A share link cannot be turned into one without calling their API.
      if (!url.pathname.startsWith('/maps/embed')) return null;
      return { provider, src: url.toString(), ratio: provider.ratio };
    }

    default:
      return null;
  }
}
