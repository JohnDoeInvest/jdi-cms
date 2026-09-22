/**
 * The CMS's own name and mark - the product, never the site it builds.
 *
 * Drawn inline in currentColor rather than shipped as light and dark image
 * files, so it follows the chrome's ink in either appearance with no second
 * copy to keep in step. The site's own logo is a setting, not this.
 */
export const PRODUCT = 'Slice';

/** Three bands, stacked: a page is a stack of slices. */
export const mark = (size = 32, className = '') =>
  `<svg${className ? ` class="${className}"` : ''} width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <rect x="5" y="6" width="22" height="5" rx="1.5" fill="currentColor"/>
    <rect x="5" y="13.5" width="22" height="5" rx="1.5" fill="currentColor" opacity=".55"/>
    <rect x="5" y="21" width="14" height="5" rx="1.5" fill="currentColor"/>
  </svg>`;

/** Mark and name together, as the rail and the sign-in screen show them. */
export const lockup = (size = 32) =>
  `${mark(size, 'brand__mark')}<span class="brand__name">${PRODUCT}</span>`;
