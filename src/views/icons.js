/**
 * Inline SVG icons. Stroke-based, 24x24 grid, sized by the caller so they
 * inherit colour from surrounding text.
 */
const PATHS = {
  home:        '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.5"/>',
  chevronRight:'<path d="m9 5 7 7-7 7"/>',
  chevronDown: '<path d="m5 9 7 7 7-7"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  dashboard:   '<rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  plus:        '<path d="M12 5v14M5 12h14"/>',
  pages:       '<path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h4"/>',
  articles:    '<path d="M4 5h16v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  media:       '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5L20 17"/>',
  template:    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
  slices:      '<rect x="3" y="4" width="18" height="5" rx="1.5"/><rect x="3" y="12" width="18" height="8" rx="1.5"/>',
  // Three equal bars, wider than the 4..20 most icons use: this is the site's
  // hamburger and wants to read as one, not as the short-last-line house style
  // that `articles` and friends share.
  menu:        '<path d="M3 6h18M3 12h18M3 18h18"/>',
  table:       '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9.5h18M3 15h18M9 4v16M15 4v16"/>',
  categories:  '<path d="M4 7h7l2 2h7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/>',
  users:       '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6"/><path d="M17.5 14.4A6 6 0 0 1 21 20"/>',
  user:        '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  trash:       '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7"/><path d="M10 11v5M14 11v5"/>',
  pencil:      '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14.5 6.5 3 3"/>',
  copy:        '<rect x="9" y="9" width="11" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  drag:        '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
  image:       '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5L20 17"/>',
  heading:     '<path d="M5 5v14M13 5v14M5 12h8"/><path d="M17 19v-7l3-1.5"/>',
  subheading:  '<path d="M5 6v12M12 6v12M5 12h7"/><path d="M16 18h4M16 18c0-2 3.6-2.4 3.6-4.2A1.9 1.9 0 0 0 16.2 13"/>',
  paragraph:   '<path d="M5 5h14M5 10h14M5 15h9M5 20h6"/>',
  list:        '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.6" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.6" cy="18" r="1.3" fill="currentColor" stroke="none"/>',
  bold:        '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7Zm0 7h7a3.5 3.5 0 0 1 0 7H7Z"/>',
  italic:      '<path d="M15 5h-5M14 19H9M13.5 5 10.5 19"/>',
  alignLeft:   '<path d="M4 6h16M4 11h10M4 16h14M4 21h8"/>',
  alignCenter: '<path d="M4 6h16M7 11h10M5 16h14M8 21h8"/>',
  alignRight:  '<path d="M4 6h16M10 11h10M6 16h14M12 21h8"/>',
  link:        '<path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5"/><path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5L12.5 17"/>',
  button:      '<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M8.5 12h7"/>',
  quote:       '<path d="M9 6.5C6.5 8 5 10.2 5 13v4.5h5.5V12H8c0-1.6.6-3 2-4Z"/><path d="M19 6.5c-2.5 1.5-4 3.7-4 6.5v4.5h5.5V12H18c0-1.6.6-3 2-4Z"/>',
  divider:     '<path d="M3 12h18"/><path d="M7 7h10M7 17h10" opacity=".35"/>',
  // Arrows out to two walls: how wide a thing draws, not how it moves.
  expand:      '<path d="M3 5v14M21 5v14"/><path d="M7 12h10"/><path d="m10 9-3 3 3 3M14 9l3 3-3 3"/>',
  columns2:    '<rect x="3" y="5" width="8" height="14" rx="1.5"/><rect x="13" y="5" width="8" height="14" rx="1.5"/>',
  columns3:    '<rect x="2.5" y="5" width="5.5" height="14" rx="1.5"/><rect x="9.5" y="5" width="5" height="14" rx="1.5"/><rect x="16" y="5" width="5.5" height="14" rx="1.5"/>',
  form:        '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h5"/>',
  close:       '<path d="M6 6l12 12M18 6 6 18"/>',
  search:      '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  radio:       '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>',
  check:       '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  upload:      '<path d="M12 16V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  logout:      '<path d="M14 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8"/><path d="M17 8.5 20.5 12 17 15.5M10 12h10"/>',
  eye:         '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  linkedin:    '<path d="M5.5 9v10M5.5 5.2v.1M10 19V9m0 4.2c0-2 1.3-3.4 3.2-3.4S17 11 17 13.6V19" />',
  instagram:   '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17.1" cy="6.9" r="1" fill="currentColor" stroke="none"/>',
  settings:    '<circle cx="12" cy="12" r="3"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1Z"/>',
  articlesFeed:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
  mail:        '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>',
  phone:       '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18.5h2"/>',
  external:    '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  save:        '<path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M8 4v5h7V4M8 20v-5h8v5"/>',
  video:       '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3Z"/>',
  pdf:         '<path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h4"/><path d="M8 14h8M8 17.5h5"/>',
  file:        '<path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h4"/>',
  warning:     '<path d="M12 4 2.8 20h18.4L12 4Z"/><path d="M12 10v4.5M12 17.4v.1"/>',
  pin:         '<path d="M9 4h6l-1 6 3.5 3v2H6.5v-2L10 10Z"/><path d="M12 15v5"/>',
  breadcrumbs: '<path d="M3 12h4"/><path d="m9 8 4 4-4 4"/><path d="M15 12h6"/>',
  code:        '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m13.5 6-3 12"/>',
  embed:       '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="m10.5 9 4 3-4 3Z"/><path d="M8 21h8"/>',
  palette:     '<path d="M12 3a9 9 0 0 0 0 18c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.5-1.1a1.6 1.6 0 0 1 1.2-2.7h1.9A4.8 4.8 0 0 0 21 10.8C21 6.5 17 3 12 3Z"/><circle cx="7.5" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="9.8" cy="7.8" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.4" cy="7.5" r="1.1" fill="currentColor" stroke="none"/>',
  spacer:      '<path d="M5 4h14M5 20h14"/><path d="M12 8v8"/><path d="m9 11 3-3 3 3M9 13l3 3 3-3"/>',
  formField:   '<rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 12h6"/>',
  parent:      '<path d="M12 19V7"/><path d="m7 11 5-5 5 5"/>',
  clock:       '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  sun:         '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon:        '<path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7Z"/>',
  // Half light, half dark: whatever the system is set to.
  appearance:  '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none"/>',
};

/** Render an icon. `icon('trash', 16)` -> inline <svg>. */
export function icon(name, size = 20, extraClass = '') {
  const body = PATHS[name] || PATHS.file;
  return `<svg class="icon${extraClass ? ' ' + extraClass : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" `
    + `fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" `
    + `aria-hidden="true" focusable="false">${body}</svg>`;
}

export const hasIcon = (name) => Object.hasOwn(PATHS, name);
