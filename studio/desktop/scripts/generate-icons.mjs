#!/usr/bin/env node
/**
 * Generate app icons for macOS (.icns), Windows (.ico), and Linux (.png).
 *
 * Requires a 1024x1024 source PNG at assets/icon-1024.png
 * If absent, falls back to generating a minimal placeholder via sips (macOS)
 * or warns and skips.
 *
 * Usage: node scripts/generate-icons.mjs [--source path/to/icon.png]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, "..", "assets");
const args = process.argv.slice(2);

const sourceArg = args.indexOf("--source");
const srcPath =
  sourceArg >= 0
    ? path.resolve(args[sourceArg + 1])
    : path.join(assetsDir, "icon-1024.png");

fs.mkdirSync(assetsDir, { recursive: true });

function run(cmd, opts) {
  console.log(`  $ ${cmd}`);
  return execSync(cmd, { stdio: "inherit", ...opts });
}

function ensureSource() {
  if (fs.existsSync(srcPath)) {
    console.log(`[icons] Using source: ${srcPath}`);
    return srcPath;
  }

  console.log("[icons] No icon-1024.png found, generating placeholder...");

  // Try ImageMagick first, then sips
  try {
    run(
      `convert -size 1024x1024 xc:'#1a1a2e' -fill '#7c3aed' -gravity center -pointsize 200 -annotate 0 'S' ${srcPath}`,
    );
    console.log("[icons] Generated placeholder via ImageMagick");
    return srcPath;
  } catch {}

  try {
    // macOS sips — create a 1x1 PNG then resize (hacky but works)
    const tmp = path.join(assetsDir, "_tmp_1x1.png");
    // Create a minimal PNG via Python (always available on macOS)
    run(
      `python3 -c "
import struct, zlib
def create_png(w, h, r, g, b):
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    raw = b''
    for y in range(h):
        raw += b'\\x00' + bytes([r, g, b]) * w
    return b'\\x89PNG\\r\\n\\x1a\\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
with open('${tmp}', 'wb') as f:
    f.write(create_png(1, 1, 124, 58, 237))
"`,
    );
    run(`sips -z 1024 1024 '${tmp}' --out '${srcPath}'`);
    fs.unlinkSync(tmp);
    console.log("[icons] Generated placeholder via sips");
    return srcPath;
  } catch (e) {
    console.error("[icons] Could not generate placeholder icon:", e.message);
    console.error(
      "[icons] Provide a 1024x1024 PNG at assets/icon-1024.png or use --source",
    );
    process.exit(1);
  }
}

function generateMacIcon(source) {
  const iconset = path.join(assetsDir, "icon.iconset");
  fs.mkdirSync(iconset, { recursive: true });

  const sizes = [
    { name: "icon_16x16.png", size: 16 },
    { name: "icon_16x16@2x.png", size: 32 },
    { name: "icon_32x32.png", size: 32 },
    { name: "icon_32x32@2x.png", size: 64 },
    { name: "icon_128x128.png", size: 128 },
    { name: "icon_128x128@2x.png", size: 256 },
    { name: "icon_256x256.png", size: 256 },
    { name: "icon_256x256@2x.png", size: 512 },
    { name: "icon_512x512.png", size: 512 },
    { name: "icon_512x512@2x.png", size: 1024 },
  ];

  for (const { name, size } of sizes) {
    run(`sips -z ${size} ${size} '${source}' --out '${path.join(iconset, name)}'`);
  }

  run(`iconutil -c icns '${iconset}' -o '${path.join(assetsDir, "icon.icns")}'`);
  fs.rmSync(iconset, { recursive: true, force: true });
  console.log(`[icons] Generated icon.icns`);
}

function generateWinIcon(source) {
  // Generate ICO with multiple sizes via sips + python
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngs = [];

  for (const size of sizes) {
    const out = path.join(assetsDir, `_ico_${size}.png`);
    run(`sips -z ${size} ${size} '${source}' --out '${out}'`);
    pngs.push({ size, path: out });
  }

  // Build ICO via Python (size 256 → 0 in ICO header byte)
  const icoPath = path.join(assetsDir, "icon.ico");
  run(
    `python3 -c "
import struct
pngs = [${pngs.map((p) => `(${p.size}, open('${p.path}', 'rb').read())`).join(",")}]
with open('${icoPath}', 'wb') as f:
    f.write(struct.pack('<HHH', 0, 1, len(pngs)))
    offset = 6 + 16 * len(pngs)
    for sz, data in pngs:
        sz_byte = 0 if sz >= 256 else sz
        f.write(struct.pack('<BBBBHHII', sz_byte, sz_byte, 0, 0, 1, 32, len(data), offset))
        offset += len(data)
    for _, data in pngs:
        f.write(data)
"`,
  );

  for (const p of pngs) fs.unlinkSync(p.path);
  console.log(`[icons] Generated icon.ico`);
}

function generateLinuxIcon(source) {
  const out = path.join(assetsDir, "icon.png");
  run(`sips -z 512 512 '${source}' --out '${out}'`);
  console.log(`[icons] Generated icon.png`);
}

// ── Main ────────────────────────────────────────────────────────────────────
const source = ensureSource();

if (process.platform === "darwin") {
  try {
    generateMacIcon(source);
  } catch (e) {
    console.warn("[icons] macOS icon generation skipped:", e.message);
  }
  try {
    generateWinIcon(source);
  } catch (e) {
    console.warn("[icons] Windows icon generation skipped:", e.message);
  }
  generateLinuxIcon(source);
} else {
  console.log(
    "[icons] On non-macOS, generate icons on macOS or manually convert.",
  );
  console.log("[icons] macOS:  iconutil -c icns icon.iconset");
  console.log("[icons] Windows: convert icon-1024.png -define icon:auto-resize icon.ico");
  console.log("[icons] Linux:  cp icon-1024.png icon.png");
}

console.log("[icons] Done. Files in assets/:");
for (const f of fs.readdirSync(assetsDir)) {
  if (f.startsWith("icon.") || f.startsWith("_"))
    console.log(`  ${f} (${fs.statSync(path.join(assetsDir, f)).size} bytes)`);
}
