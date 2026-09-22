---
name: dark-mode-profile
description: Dark-mode colour profile for application interfaces - neutral greys measured from Adobe Photoshop's dark UI, each with a role and a contrast figure, plus accent and state colours tuned for dark panels, in hex and OKLCH. Use it whenever a UI needs a dark mode or dark theme.
---

# Dark mode colour profile

Neutral greys measured pixel by pixel from Adobe Photoshop's dark
interface, plus the colours Photoshop's greys lack (accent, error,
warning, success), lifted until they read on a dark panel. First used in
the Slice CMS, September 2026.

Every colour has one **role**. Map a light UI onto the roles, not onto the
nearest grey: the same light white is a panel in one place and the page
behind it in another, and a dark mode has to tell those apart.

Contrast figures are WCAG ratios against the panel `#323232` and the
workspace `#191919`. Hex is the source; the OKLCH values are optional
equivalents, rounded so each one converts back to exactly the same hex.

## Surfaces

| Role      | Hex       | OKLCH               | Use |
|-----------|-----------|---------------------|-----|
| Workspace | `#191919` | `oklch(21.34% 0 0)` | App background and the main work area behind panels |
| Edge      | `#212121` | `oklch(24.78% 0 0)` | Seam between two panes |
| Sunken    | `#212121` | `oklch(24.78% 0 0)` | A track things sit in: tab strip, disabled field |
| Field     | `#292929` | `oklch(28.09% 0 0)` | Inputs, selects, text areas - darker than their panel |
| List      | `#2b2b2b` | `oklch(28.91% 0 0)` | List or card area inside a panel, empty states |
| Panel     | `#323232` | `oklch(31.71% 0 0)` | Sidebars, top and bottom bars, dialogs, cards, menus |
| Raised    | `#535353` | `oklch(44.23% 0 0)` | Toasts, and the ground under image thumbnails |

## Lines

| Role   | Hex       | OKLCH               | Use |
|--------|-----------|---------------------|-----|
| Border | `#474747` | `oklch(39.79% 0 0)` | Fields, cards, list items, dashed placeholders |
| Rule   | `#2b2b2b` | `oklch(28.91% 0 0)` | Hairline between rows |

## Text

| Role      | Hex       | OKLCH               | Panel  | Workspace | Use |
|-----------|-----------|---------------------|--------|-----------|-----|
| Primary   | `#e7e7e7` | `oklch(92.8% 0 0)`  | 10.4:1 | 14.2:1 | Body text, headings, values in fields |
| Secondary | `#d6d6d6` | `oklch(87.61% 0 0)` | 8.8:1  | 12.1:1 | Navigation, field labels, icons |
| Muted     | `#adadad` | `oklch(74.76% 0 0)` | 5.7:1  | 7.8:1  | Hints, table headers, dates, meta |
| Faint     | `#808080` | `oklch(59.99% 0 0)` | 3.2:1  | 4.5:1  | Placeholders, disabled, decorative icons - not for reading |
| On fill   | `#ffffff` | `oklch(100% 0 0)`   | 12.8:1 | -      | Text on the selected fill and on accent or red fills |

## Interaction

| Role         | Value                   | OKLCH                        | Use |
|--------------|-------------------------|------------------------------|-----|
| Hover        | `rgba(255,255,255,.07)` | `oklch(100% 0 0 / 0.07)`     | Hover and subtle fills; a wash, so it is the same step up on any surface |
| Hover strong | `rgba(255,255,255,.14)` | `oklch(100% 0 0 / 0.14)`     | Hover on something already filled |
| Selected     | `#4a4a4a`               | `oklch(40.91% 0 0)`          | Current nav item, pressed segment or tool, selected row - with white text (8.9:1) |
| Shade        | `rgba(255,255,255,.06)` | `oklch(100% 0 0 / 0.06)`     | Code chips, chequerboards |
| Float        | `rgba(50,50,50,.94)`    | `oklch(31.71% 0 0 / 0.94)`   | A button floating over an image |
| Backdrop     | `rgba(0,0,0,.6)`        | `oklch(0% 0 0 / 0.6)`        | Behind a dialog |

## Accent and states

| Role         | Value                    | OKLCH                                  | Use |
|--------------|--------------------------|----------------------------------------|-----|
| Accent       | `#3ba1f8` (4.7:1 on panel) | `oklch(69.1% 0.1581 248.38)`         | Focus, selection, links, checked boxes - or keep your own brand blue if it passes |
| Accent text  | `#7cc0fb` (6.6:1)        | `oklch(78.53% 0.1092 245.95)`          | Accent-coloured text on an accent tint |
| Accent tint  | `rgba(59,161,248,.16)`   | `oklch(69.1% 0.1581 248.38 / 0.16)`    | Selected table row, info pills, drop targets |
| Focus ring   | `rgba(59,161,248,.4)`, 3px spread | `oklch(69.1% 0.1581 248.38 / 0.4)` | |
| Danger       | `#ff7b72` (5.1:1)        | `oklch(73.45% 0.1626 25.78)`           | Error text, destructive links and icons |
| Danger fill  | `#c9443a`                | `oklch(57.24% 0.1707 27.98)`           | Red buttons, error toasts - white text 4.8:1 |
| Danger hover | `#b33b32`                | `oklch(52.43% 0.1573 28.02)`           | A red button under the pointer |
| Danger tint  | `rgba(255,123,114,.14)`  | `oklch(73.45% 0.1626 25.78 / 0.14)`    | Error message background |
| Warning      | `#e3b341` (6.6:1)        | `oklch(79.04% 0.1386 85.24)`           | Warning text, draft badges |
| Warning tint | `rgba(227,179,65,.14)`   | `oklch(79.04% 0.1386 85.24 / 0.14)`    | |
| Success      | `#5cc98a` (6.2:1)        | `oklch(75.54% 0.1365 155.68)`          | Saved, live, success text |
| Success tint | `rgba(92,201,138,.14)`   | `oklch(75.54% 0.1365 155.68 / 0.14)`   | |

## Depth

| Role      | Value                          | OKLCH colour |
|-----------|--------------------------------|--------------|
| Shadow sm | `0 1px 2px rgba(0,0,0,.4)`     | `oklch(0% 0 0 / 0.4)` |
| Shadow    | `0 4px 16px rgba(0,0,0,.45)`   | `oklch(0% 0 0 / 0.45)` |
| Shadow lg | `0 18px 48px rgba(0,0,0,.55)`  | `oklch(0% 0 0 / 0.55)` |
| Dialog    | `0 24px 64px rgba(0,0,0,.6)`   | `oklch(0% 0 0 / 0.6)` |

## From a light UI

| Light UI element                      | Dark role |
|---------------------------------------|-----------|
| Page or app background                | Workspace |
| White sidebar, bar, card, dialog      | Panel |
| White input                           | Field |
| Off-white card or empty state         | List |
| Light grey border / row hairline      | Border / Rule |
| Light grey hover                      | Hover |
| Black text / dark grey text           | Primary / Secondary |
| Grey hint / placeholder               | Muted / Faint |
| Black "selected" fill with white text | Selected |
| Black primary button                  | Inverted: fill Primary `#e7e7e7`, text Panel `#323232`, hover Secondary `#d6d6d6` |
| White outline button                  | Panel fill, Primary border and text |
| Pale blue / red / amber / green tint  | The matching tint above |

## Rules

- Layer as Photoshop does: workspace darkest, panels lighter on top of it,
  fields recessed below the panel they sit in, borders lighter than both.
- Selection is a lighter grey with white text, not a bright inverted fill.
- Text on accent and red fills stays white. Red *as text* is the lifted
  `#ff7b72`, never the fill red.
- Anything that previews content with its own look - a page canvas, an
  email, a document - keeps its own colours: a light sheet in a dark room.
- Image thumbnails sit on Raised `#535353`, where black artwork reads at
  2.7:1 and white at 7.7:1; on a panel, black artwork all but vanishes.
- Set `color-scheme: dark` so native controls and scrollbars follow, and
  redraw custom select arrows in Muted `#adadad`.
- A dark-lettered logo needs a light variant; do not invert a coloured one.

## Tokens

```css
:root[data-appearance="dark"] {
  color-scheme: dark;

  /* surfaces */
  --workspace: #191919;
  --edge:      #212121;
  --sunken:    #212121;
  --field:     #292929;
  --list:      #2b2b2b;
  --panel:     #323232;
  --raised:    #535353;

  /* lines */
  --border: #474747;
  --rule:   #2b2b2b;

  /* text */
  --text:           #e7e7e7;
  --text-secondary: #d6d6d6;
  --text-muted:     #adadad;
  --text-faint:     #808080;
  --text-on-fill:   #ffffff;

  /* interaction */
  --hover:        rgba(255, 255, 255, .07);
  --hover-strong: rgba(255, 255, 255, .14);
  --selected:     #4a4a4a;
  --shade:        rgba(255, 255, 255, .06);
  --float:        rgba(50, 50, 50, .94);
  --backdrop:     rgba(0, 0, 0, .6);

  /* accent: keep the brand blue, lighten its text */
  --accent-text: #7cc0fb;
  --accent-tint: rgba(59, 161, 248, .16);
  --ring:        0 0 0 3px rgba(59, 161, 248, .4);

  /* states */
  --danger:            #ff7b72;
  --danger-fill:       #c9443a;
  --danger-fill-hover: #b33b32;
  --danger-tint:       rgba(255, 123, 114, .14);
  --warning:           #e3b341;
  --warning-tint:      rgba(227, 179, 65, .14);
  --success:           #5cc98a;
  --success-tint:      rgba(92, 201, 138, .14);

  /* depth */
  --shadow-sm:     0 1px 2px rgba(0, 0, 0, .4);
  --shadow:        0 4px 16px rgba(0, 0, 0, .45);
  --shadow-lg:     0 18px 48px rgba(0, 0, 0, .55);
  --shadow-dialog: 0 24px 64px rgba(0, 0, 0, .6);
}
```

### The same tokens in OKLCH

For projects that write colour in OKLCH (supported by every current
browser). Identical colours to the block above.

```css
:root[data-appearance="dark"] {
  color-scheme: dark;

  /* surfaces */
  --workspace: oklch(21.34% 0 0);
  --edge:      oklch(24.78% 0 0);
  --sunken:    oklch(24.78% 0 0);
  --field:     oklch(28.09% 0 0);
  --list:      oklch(28.91% 0 0);
  --panel:     oklch(31.71% 0 0);
  --raised:    oklch(44.23% 0 0);

  /* lines */
  --border: oklch(39.79% 0 0);
  --rule:   oklch(28.91% 0 0);

  /* text */
  --text:           oklch(92.8% 0 0);
  --text-secondary: oklch(87.61% 0 0);
  --text-muted:     oklch(74.76% 0 0);
  --text-faint:     oklch(59.99% 0 0);
  --text-on-fill:   oklch(100% 0 0);

  /* interaction */
  --hover:        oklch(100% 0 0 / 0.07);
  --hover-strong: oklch(100% 0 0 / 0.14);
  --selected:     oklch(40.91% 0 0);
  --shade:        oklch(100% 0 0 / 0.06);
  --float:        oklch(31.71% 0 0 / 0.94);
  --backdrop:     oklch(0% 0 0 / 0.6);

  /* accent: keep the brand blue, lighten its text */
  --accent-text: oklch(78.53% 0.1092 245.95);
  --accent-tint: oklch(69.1% 0.1581 248.38 / 0.16);
  --ring:        0 0 0 3px oklch(69.1% 0.1581 248.38 / 0.4);

  /* states */
  --danger:            oklch(73.45% 0.1626 25.78);
  --danger-fill:       oklch(57.24% 0.1707 27.98);
  --danger-fill-hover: oklch(52.43% 0.1573 28.02);
  --danger-tint:       oklch(73.45% 0.1626 25.78 / 0.14);
  --warning:           oklch(79.04% 0.1386 85.24);
  --warning-tint:      oklch(79.04% 0.1386 85.24 / 0.14);
  --success:           oklch(75.54% 0.1365 155.68);
  --success-tint:      oklch(75.54% 0.1365 155.68 / 0.14);

  /* depth */
  --shadow-sm:     0 1px 2px oklch(0% 0 0 / 0.4);
  --shadow:        0 4px 16px oklch(0% 0 0 / 0.45);
  --shadow-lg:     0 18px 48px oklch(0% 0 0 / 0.55);
  --shadow-dialog: 0 24px 64px oklch(0% 0 0 / 0.6);
}
```
