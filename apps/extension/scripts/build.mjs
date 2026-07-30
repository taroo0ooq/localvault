import * as esbuild from "esbuild";
import { mkdir, cp, writeFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c;
}

function chunk(type, data) {
  const typeB = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeB, data])) >>> 0, 0);
  return Buffer.concat([len, typeB, data, crc]);
}

function solidPng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const i = row + 1 + x * 4;
      raw[i] = rgba[0];
      raw[i + 1] = rgba[1];
      raw[i + 2] = rgba[2];
      raw[i + 3] = rgba[3];
    }
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function ensureIcons() {
  const dir = join(dist, "icons");
  await mkdir(dir, { recursive: true });
  for (const size of [16, 48, 128]) {
    await writeFile(join(dir, `icon${size}.png`), solidPng(size, size, [45, 212, 191, 255]));
  }
}

async function walkSize(d) {
  let total = 0;
  for (const name of await readdir(d)) {
    const p = join(d, name);
    const s = await stat(p);
    total += s.isDirectory() ? await walkSize(p) : s.size;
  }
  return total;
}

async function build() {
  await mkdir(dist, { recursive: true });
  await ensureIcons();
  const common = {
    bundle: true,
    format: "esm",
    target: "chrome114",
    sourcemap: true,
    logLevel: "info",
    platform: "browser",
  };
  await esbuild.build({
    ...common,
    entryPoints: [join(root, "src/background/service-worker.ts")],
    outfile: join(dist, "background.js"),
  });
  await esbuild.build({
    ...common,
    entryPoints: [join(root, "src/content/content.ts")],
    outfile: join(dist, "content.js"),
  });
  await esbuild.build({
    ...common,
    entryPoints: [join(root, "src/popup/popup.ts")],
    outfile: join(dist, "popup.js"),
  });
  await cp(join(root, "src/popup/popup.html"), join(dist, "popup.html"));
  await cp(join(root, "src/popup/popup.css"), join(dist, "popup.css"));
  await cp(join(root, "src/manifest.json"), join(dist, "manifest.json"));

  const total = await walkSize(dist);
  const mb = total / (1024 * 1024);
  console.log(`extension dist size: ${mb.toFixed(2)} MB (budget 5 MB)`);
  if (mb > 5) {
    console.error("FAIL: extension exceeds 5 MB unpacked budget");
    process.exit(1);
  }
}

await build();
