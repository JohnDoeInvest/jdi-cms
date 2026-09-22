# Typefaces

Every face this site draws with is a file in this directory, served from this
machine. Nothing is fetched from Google Fonts or any other font service — not
by the public site, not by the CMS, not by the sign-in screen. That is the
point: a page that pulls its faces from a CDN hands every visitor's address,
browser and current URL to a third party in order to render, which is exactly
what a server standing in your own building is meant to avoid.

## What ships here

Inter, as a variable font covering weights 100–900, in two subset files:

| file | characters | size |
|---|---|---|
| `inter-variable.woff2` | Latin — English, Swedish, most of Western Europe | 48 KB |
| `inter-variable-latin-ext.woff2` | Latin Extended — Polish, Czech, Romanian, Hungarian… | 85 KB |

Two files rather than one because each declares a `unicode-range`, so a page
fetches only what it actually contains. A Swedish page pays 48 KB and never
asks for the second file; a page carrying a name like *Șerban* or *Ćwikła*
fetches it and draws that name in Inter rather than in whatever the reader's
machine substitutes.

Licensed under the [SIL Open Font License 1.1](https://openfontlicense.org),
which permits redistribution; see `inter-LICENSE.txt`.

It is here so a fresh install has something to draw with. It is not special
otherwise — once a second family is installed, Inter can be removed like any
other. The only rule is that the last remaining family stays, because a site
with no typeface installed draws in whatever the visitor's browser keeps for
last resort.

## Adding your own

Through the CMS: **Theme → Add or remove typefaces**. Everything else in this
directory is uploaded there and is not tracked by git, the same way uploaded
media is not.

Prefer **woff2** — roughly a quarter the size of the same face as `.ttf`.
`.woff`, `.ttf` and `.otf` are accepted too. A variable font is one file for
every weight; set its weight to *Variable* so the browser uses the real
weights rather than synthesising a fake bold.

Upload every file of a family at once. Families are commonly distributed split
across character sets — `inter-latin-400-normal.woff2` and
`inter-latin-ext-400-normal.woff2` are two files of the same weight — and the
**Characters** setting on each face is what keeps them apart. Left as
*Everything in the file*, two faces of the same weight and style are the same
declaration twice and the second replaces the first. It is read from the
filename on upload and can be corrected.

Files are validated by what they actually contain, not by their extension, and
stored under a name of the CMS's own making.
