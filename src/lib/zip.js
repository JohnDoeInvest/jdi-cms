import zlib from 'node:zlib';

/**
 * A ZIP writer, in Node's own library.
 *
 * Here rather than as a dependency because three packages is the whole list
 * and this is the part of an archive that is not already in `node:zlib`: the
 * container, and a CRC32. `deflateRawSync` does the compression.
 *
 * Deliberately small. It writes stored or deflated entries, UTF-8 names, and
 * nothing else - no encryption, no Zip64, no reader. Anything that needs
 * those is a different problem and probably wants a different answer.
 *
 * **It builds the whole archive in memory**, so it is bounded by what the
 * process can hold. That is fine for a site's media folder and wrong for a
 * library of video; the fix, when it bites, is streaming the entries out as
 * they are made rather than concatenating at the end.
 */

/* The standard CRC-32 table, built once. The polynomial is the reversed
   0x04C11DB7 every ZIP implementation uses; a mismatch here is an archive
   that unpacks and then reports itself corrupt. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

export function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/*
 * DOS date and time, which is what the format stores. Two 16-bit fields,
 * seconds in units of two, and years counted from 1980 - so anything before
 * that cannot be represented and is clamped rather than wrapped into a date
 * that looks real.
 */
function dosStamp(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * Build a ZIP from `[{ name, data, date }]`.
 *
 * `name` is the path inside the archive, `/`-separated whatever the host
 * uses. Compression is attempted and abandoned per entry: a WebP or a woff2
 * comes out larger deflated than it went in, and storing it saves the time as
 * well as the bytes.
 */
export function zip(entries, { now = new Date() } = {}) {
  const parts = [];
  const directory = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(String(entry.name).replace(/\\/g, '/'), 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const stamp = dosStamp(entry.date || now);
    const sum = crc32(data);

    const deflated = data.length ? zlib.deflateRawSync(data, { level: 6 }) : Buffer.alloc(0);
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const method = stored ? 0 : 8;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // local file header
    local.writeUInt16LE(20, 4);           // version needed: 2.0
    local.writeUInt16LE(0x0800, 6);       // flags: name is UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory header
    central.writeUInt16LE(20, 4);         // made by
    central.writeUInt16LE(20, 6);         // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);    // where this entry's local header is
    directory.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const dir = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);       // end of central directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...parts, dir, end]);
}
