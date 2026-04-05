const fs = require('fs');
const path = require('path');

const libsDir = path.join(__dirname, 'libs');
if (!fs.existsSync(libsDir)) fs.mkdirSync(libsDir);

// ── Bundle Three.js viewer with esbuild ──

async function bundleViewer() {
  try {
    const esbuild = require('esbuild');
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'viewer', 'viewer.src.js')],
      bundle: true,
      minify: true,
      format: 'iife',
      outfile: path.join(libsDir, 'viewer.bundle.js'),
      target: ['chrome110'],
      sourcemap: false,
      treeShaking: true,
    });
    console.log('Bundled Three.js viewer → libs/viewer.bundle.js');
  } catch (e) {
    console.error('Failed to bundle viewer:', e.message);
    process.exit(1);
  }
}

// ── Generate placeholder PNG icons ──

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

// Generate fal logo PNGs from the actual SVG using sharp
const FAL_LOGO_SVG = `<svg viewBox="0 0 624 624" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" clip-rule="evenodd" fill="#6d28d9"
    d="M402.365 0C413.17 0.000231771 421.824 8.79229 422.858 19.5596C432.087 115.528 508.461 191.904 604.442 201.124C615.198 202.161 624 210.821 624 221.638V402.362C624 413.179 615.198 421.839 604.442 422.876C508.461 432.096 432.087 508.472 422.858 604.44C421.824 615.208 413.17 624 402.365 624H221.635C210.83 624 202.176 615.208 201.142 604.44C191.913 508.472 115.538 432.096 19.5576 422.876C8.80183 421.839 0 413.179 0 402.362V221.638C0 210.821 8.80183 202.161 19.5576 201.124C115.538 191.904 191.913 115.528 201.142 19.5596C202.176 8.79215 210.83 0 221.635 0H402.365ZM312 124C208.17 124 124 208.17 124 312C124 415.83 208.17 500 312 500C415.83 500 500 415.83 500 312C500 208.17 415.83 124 312 124Z"/>
</svg>`;

async function generateIcons() {
  const sharp = require('sharp');
  for (const size of [16, 48, 128]) {
    const dest = path.join(iconsDir, `icon${size}.png`);
    await sharp(Buffer.from(FAL_LOGO_SVG))
      .resize(size, size)
      .png()
      .toFile(dest);
    console.log(`Generated fal logo icon${size}.png`);
  }
}

Promise.all([bundleViewer(), generateIcons()]).then(() => console.log('Build complete!'));
