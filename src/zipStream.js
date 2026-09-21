/* Minimal ZIP writer (deflate), dependency-free.

   ZIP rather than tar because the people using this are on Windows, where
   .zip opens with a double-click. Each document is under the 25MB upload
   limit, so we compress one file at a time in memory and therefore know the
   sizes up front — which means no data descriptors and a much simpler file. */

const zlib = require('zlib');

/* ---- CRC-32 (required by the ZIP spec) ---- */
const CRC_TABLE = (function () {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

/* ---- DOS timestamp ---- */
function dosTime(date) {
  return ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() / 2)) & 0xFFFF;
}
function dosDate(date) {
  return (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xFFFF;
}

/* Collects entries, then writes a complete archive to a stream. */
function createZip() {
  const entries = [];

  function add(name, contents, date) {
    const body = Buffer.isBuffer(contents) ? contents : Buffer.from(String(contents), 'utf8');
    const deflated = zlib.deflateRawSync(body, { level: 6 });
    // If compression made it bigger (already-compressed PDFs, JPEGs), store it raw.
    const useDeflate = deflated.length < body.length;
    entries.push({
      name: name,
      crc: crc32(body),
      compressed: useDeflate ? deflated : body,
      compressedSize: useDeflate ? deflated.length : body.length,
      uncompressedSize: body.length,
      method: useDeflate ? 8 : 0,
      date: date || new Date()
    });
  }

  function localHeader(e, nameBuf) {
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);          // version needed
    h.writeUInt16LE(0x0800, 6);      // UTF-8 filename flag
    h.writeUInt16LE(e.method, 8);
    h.writeUInt16LE(dosTime(e.date), 10);
    h.writeUInt16LE(dosDate(e.date), 12);
    h.writeUInt32LE(e.crc, 14);
    h.writeUInt32LE(e.compressedSize, 18);
    h.writeUInt32LE(e.uncompressedSize, 22);
    h.writeUInt16LE(nameBuf.length, 26);
    h.writeUInt16LE(0, 28);          // extra field length
    return h;
  }

  function centralHeader(e, nameBuf, offset) {
    const h = Buffer.alloc(46);
    h.writeUInt32LE(0x02014b50, 0);
    h.writeUInt16LE(20, 4);          // version made by
    h.writeUInt16LE(20, 6);          // version needed
    h.writeUInt16LE(0x0800, 8);
    h.writeUInt16LE(e.method, 10);
    h.writeUInt16LE(dosTime(e.date), 12);
    h.writeUInt16LE(dosDate(e.date), 14);
    h.writeUInt32LE(e.crc, 16);
    h.writeUInt32LE(e.compressedSize, 20);
    h.writeUInt32LE(e.uncompressedSize, 24);
    h.writeUInt16LE(nameBuf.length, 28);
    h.writeUInt16LE(0, 30);          // extra
    h.writeUInt16LE(0, 32);          // comment
    h.writeUInt16LE(0, 34);          // disk number
    h.writeUInt16LE(0, 36);          // internal attrs
    // JS bitwise operators are signed 32-bit, so this shift overflows into a
    // negative number without the >>> 0 to coerce it back to unsigned.
    h.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attrs
    h.writeUInt32LE(offset, 42);
    return h;
  }

  function finish(stream) {
    let offset = 0;
    const central = [];

    entries.forEach(function (e) {
      const nameBuf = Buffer.from(e.name, 'utf8');
      const lh = localHeader(e, nameBuf);
      stream.write(lh);
      stream.write(nameBuf);
      stream.write(e.compressed);
      central.push(centralHeader(e, nameBuf, offset));
      central.push(nameBuf);
      offset += lh.length + nameBuf.length + e.compressedSize;
    });

    const centralStart = offset;
    let centralSize = 0;
    central.forEach(function (buf) {
      stream.write(buf);
      centralSize += buf.length;
    });

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralSize, 12);
    eocd.writeUInt32LE(centralStart, 16);
    eocd.writeUInt16LE(0, 20);
    stream.write(eocd);
  }

  return { add: add, finish: finish, count: function () { return entries.length; } };
}

module.exports = { createZip, crc32 };
