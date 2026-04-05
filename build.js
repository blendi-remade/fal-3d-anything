const fs = require('fs');
const path = require('path');

const libsDir = path.join(__dirname, 'libs');
if (!fs.existsSync(libsDir)) fs.mkdirSync(libsDir);

// Copy model-viewer bundle to libs/
const mvSrc = path.join(__dirname, 'node_modules', '@google', 'model-viewer', 'dist', 'model-viewer.min.js');
const mvDest = path.join(libsDir, 'model-viewer.min.js');

if (fs.existsSync(mvSrc)) {
  fs.copyFileSync(mvSrc, mvDest);
  console.log('Copied model-viewer.min.js to libs/');
} else {
  console.warn('model-viewer not found in node_modules. Run npm install first.');
}

// Generate simple PNG icons if they don't exist
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

function createPNG(size) {
  // Minimal valid PNG: solid colored square
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c;
    }
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([len, typeAndData, crc]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT - raw image data with zlib wrapper
  const rawRows = [];
  for (let y = 0; y < size; y++) {
    rawRows.push(0); // filter byte: None
    for (let x = 0; x < size; x++) {
      // Gradient cube icon: teal to purple
      const t = x / size;
      const r = Math.floor(40 + t * 100);
      const g = Math.floor(180 - t * 80);
      const b = Math.floor(220 + t * 35);
      rawRows.push(r, g, b);
    }
  }
  const rawData = Buffer.from(rawRows);
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawData);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

[16, 48, 128].forEach(size => {
  const dest = path.join(iconsDir, `icon${size}.png`);
  if (!fs.existsSync(dest)) {
    fs.writeFileSync(dest, createPNG(size));
    console.log(`Generated icon${size}.png`);
  }
});

console.log('Build complete!');
