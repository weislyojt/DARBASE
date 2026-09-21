/* Minimal tar (ustar) writer.
   Deliberately dependency-free: adding an npm package to a live records
   system risks a failed build, and a backup tool must never be the thing
   that breaks the site. Output is piped through Node's built-in gzip, so
   the result is a standard .tar.gz that Windows 11, 7-Zip, macOS and Linux
   all open natively. */

const BLOCK = 512;

function octal(value, length) {
  // ustar numeric fields: zero-padded octal, then a NUL terminator.
  const s = value.toString(8);
  return s.padStart(length - 1, '0') + '\0';
}

function header(name, size, mtimeSeconds) {
  const buf = Buffer.alloc(BLOCK, 0);

  if (Buffer.byteLength(name) > 100) {
    throw new Error('Path too long for tar header: ' + name);
  }

  buf.write(name, 0, 100, 'utf8');
  buf.write(octal(0o644, 8), 100, 8);        // mode
  buf.write(octal(0, 8), 108, 8);            // uid
  buf.write(octal(0, 8), 116, 8);            // gid
  buf.write(octal(size, 12), 124, 12);       // size
  buf.write(octal(Math.floor(mtimeSeconds), 12), 136, 12); // mtime
  buf.write('        ', 148, 8);             // checksum placeholder (spaces)
  buf.write('0', 156, 1);                    // typeflag: normal file
  buf.write('ustar\0', 257, 6);              // magic
  buf.write('00', 263, 2);                   // version

  // Checksum = sum of every header byte, with the checksum field as spaces.
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += buf[i];
  buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);

  return buf;
}

function padding(size) {
  const remainder = size % BLOCK;
  return remainder === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOCK - remainder, 0);
}

/* Writes one file entry into a writable stream. */
function writeEntry(stream, name, contents, mtime) {
  const body = Buffer.isBuffer(contents) ? contents : Buffer.from(contents, 'utf8');
  stream.write(header(name, body.length, mtime || Date.now() / 1000));
  stream.write(body);
  const pad = padding(body.length);
  if (pad.length) stream.write(pad);
}

/* Two zero blocks mark the end of a tar archive. */
function writeEnd(stream) {
  stream.write(Buffer.alloc(BLOCK * 2, 0));
}

module.exports = { writeEntry, writeEnd };
