/*
 * A .zip writer in node:zlib alone - PROTOTYPE, not wired to anything.
 *
 * Kept because it answers the only open question in the backup/restore note
 * in NOTES.md ("Backup and restore from the CMS itself"): whether an archive
 * can be produced without a fourth npm package. It can, in about this much
 * code - local file headers, a central directory, an end record and a CRC32,
 * with `deflateRawSync` doing the compression.
 *
 * Verified on 2026-09-24: the archive it writes passes `unzip -t`, and a
 * SQLite database round-trips through it with `PRAGMA integrity_check` clean.
 *
 * What it is NOT: streaming (it builds the whole archive in memory), and it
 * has no reader. A real backup feature wants both - see the note.
 *
 *   node docs/prototypes/zip-writer.mjs out.zip some.db
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 6 });
    const useStore = deflated.length >= data.length;
    const body = useStore ? data : deflated;
    const method = useStore ? 0 : 8;
    const sum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);     local.writeUInt16LE(method, 8);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);     dir.writeUInt16LE(method, 10);
    dir.writeUInt32LE(sum, 16);
    dir.writeUInt32LE(body.length, 20); dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28); dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }
  const dirBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, dirBuf, end]);
}

/* A demonstration, not an interface: every file named after the output path
   goes in under its basename, plus a manifest of the kind a real archive
   would carry. */
const [out, ...files] = process.argv.slice(2);
if (!out) {
  console.error('usage: node docs/prototypes/zip-writer.mjs out.zip [file ...]');
  process.exit(1);
}
const entries = files.map((f) => ({ name: path.basename(f), data: fs.readFileSync(f) }));
entries.push({
  name: 'manifest.json',
  data: Buffer.from(JSON.stringify({ made: new Date().toISOString(), entries: entries.length }, null, 2)),
});
fs.writeFileSync(out, zip(entries));
console.log('wrote', out, fs.statSync(out).size, 'bytes from', entries.length, 'entries');
