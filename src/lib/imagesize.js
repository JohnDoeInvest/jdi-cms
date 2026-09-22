/**
 * Header probing for uploaded images.
 *
 * Everything here reads the first few hundred bytes of a file and never
 * decodes pixels, so it costs nothing on upload. `images.js` leans on the
 * flatness test to decide how a file should be encoded; sharp reads the
 * rest for itself.
 */

/** Read intrinsic pixel size straight from the file header. Null when unknown. */
export function imageSize(buf, mime = '') {
  try {
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {          // PNG
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf.length > 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) { // GIF
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return jpegSize(buf);
    if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      return webpSize(buf);
    }
    if (mime === 'image/svg+xml' || buf.toString('utf8', 0, 200).includes('<svg')) return svgSize(buf);
  } catch { /* fall through to null */ }
  return null;
}

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF15, skipping the DHT/JPG/DAC markers that share the range.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

function webpSize(buf) {
  const fmt = buf.toString('ascii', 12, 16);
  if (fmt === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (fmt === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (fmt === 'VP8X') {
    const w = buf[24] | (buf[25] << 8) | (buf[26] << 16);
    const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
    return { width: w + 1, height: h + 1 };
  }
  return null;
}

function svgSize(buf) {
  const head = buf.toString('utf8', 0, 2000);
  const w = /\bwidth\s*=\s*["']([\d.]+)/i.exec(head);
  const h = /\bheight\s*=\s*["']([\d.]+)/i.exec(head);
  if (w && h) return { width: Math.round(+w[1]), height: Math.round(+h[1]) };
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(head);
  if (vb) return { width: Math.round(+vb[1]), height: Math.round(+vb[2]) };
  return null;
}

/* ------------------------------------------------------- EXIF orientation */

/**
 * The EXIF orientation tag (0x0112) of a JPEG, 1..8, defaulting to 1.
 *
 * A converted upload is turned upright by sharp, so this matters only for a
 * JPEG stored as it came: the browser honours the tag, and knowing it lets
 * the caller swap the stored width/height for the quarter-turn cases.
 */
export function jpegOrientation(buf) {
  try {
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return 1;
    let i = 2;
    while (i < buf.length - 4) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      if (marker === 0xda) break;                       // start of scan: no more metadata
      const len = buf.readUInt16BE(i + 2);
      if (marker === 0xe1 && buf.toString('ascii', i + 4, i + 10) === 'Exif\0\0') {
        const found = readExifOrientation(buf, i + 10, Math.min(i + 2 + len, buf.length));
        if (found) return found;
      }
      i += 2 + len;
    }
  } catch { /* malformed EXIF simply means "no rotation" */ }
  return 1;
}

/** Walk a TIFF header at `tiff` looking for tag 0x0112 in IFD0. */
function readExifOrientation(buf, tiff, end) {
  const order = buf.toString('ascii', tiff, tiff + 2);
  if (order !== 'II' && order !== 'MM') return 0;
  const le = order === 'II';
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));

  const ifd0 = tiff + u32(tiff + 4);
  if (ifd0 + 2 > end) return 0;
  const count = u16(ifd0);
  for (let e = 0; e < count; e++) {
    const entry = ifd0 + 2 + e * 12;
    if (entry + 12 > end) break;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 0;
    }
  }
  return 0;
}

/** True when the orientation is a quarter turn, i.e. width and height swap. */
export const orientationSwapsAxes = (orientation) => orientation >= 5 && orientation <= 8;

/* ------------------------------------------------ encoding-strategy probes */

/** True when a PNG can carry transparency (greyscale+alpha, RGBA, or palette+tRNS). */
export function pngHasAlpha(buf) {
  try {
    if (buf.length < 26 || buf.readUInt32BE(0) !== 0x89504e47) return false;
    const colorType = buf[25];
    if (colorType === 4 || colorType === 6) return true;
    return colorType === 3 && buf.includes(Buffer.from('tRNS', 'ascii'));
  } catch { return false; }
}

/**
 * Rough "is this a photograph?" test, used to pick lossy versus near-lossless.
 *
 * Flat artwork - logos, diagrams, screenshots - compresses hard under PNG's own
 * filters, so it lands well under a byte per pixel. Photographs never do. The
 * distinction matters because lossy WebP rings badly around the hard edges and
 * text that flat artwork is made of.
 */
export function looksPhotographic(buf, mime, size) {
  if (mime === 'image/jpeg') return true;               // JPEG is only ever used for photos
  if (!size?.width || !size?.height) return true;       // unknown: the safer default is lossy
  return buf.length / (size.width * size.height) >= 1.0;
}
