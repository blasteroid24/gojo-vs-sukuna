#!/usr/bin/env node
/**
 * Converts a folder of PNG/JPG frames into two WebP sets:
 *   public/frames/frame_0001.webp         (desktop, max 1920px wide, never upscaled)
 *   public/frames-mobile/frame_0001.webp  (mobile, 960px wide)
 * Also writes public/og.jpg and src/config/frames.generated.ts (frame count + sizes).
 *
 * Usage:
 *   node scripts/optimize-frames.mjs [--in ./frames] [--rotate -90] [--quality 75]
 *                                    [--max 1920] [--mobile 960] [--og 100]
 *
 * --rotate exists because the source export stores 16:9 frames rotated into a
 * 720x1280 container. Use --rotate 0 for frames that are already upright.
 *
 * --crop auto (default) detects letterbox/pillarbox bars baked into the footage
 * (rows/columns that are black in every sampled frame) and crops them off, so
 * "cover" fitting fills the screen with picture instead of black. Use --crop none to keep them.
 */
import sharp from 'sharp';
import { readdir, mkdir, rm, writeFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const IN = path.resolve(ROOT, args.in ?? 'frames');
const ROTATE = Number(args.rotate ?? -90);
const QUALITY = Number(args.quality ?? 75);
const MAX_W = Number(args.max ?? 1920);
const MOBILE_W = Number(args.mobile ?? 960);
const OG_FRAME = Number(args.og ?? 100);
const CROP = args.crop ?? 'auto';

const OUT_DESKTOP = path.join(ROOT, 'public/frames');
const OUT_MOBILE = path.join(ROOT, 'public/frames-mobile');

const files = (await readdir(IN))
  .filter((f) => /\.(png|jpe?g)$/i.test(f))
  .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0));

if (!files.length) {
  console.error(`No PNG/JPG frames found in ${IN}`);
  process.exit(1);
}

await rm(OUT_DESKTOP, { recursive: true, force: true });
await rm(OUT_MOBILE, { recursive: true, force: true });
await mkdir(OUT_DESKTOP, { recursive: true });
await mkdir(OUT_MOBILE, { recursive: true });

const name = (i) => `frame_${String(i + 1).padStart(4, '0')}.webp`;
const rotated = (file) => sharp(path.join(IN, file)).rotate(ROTATE || undefined);

/** Find the picture area: rows/cols whose brightest sampled value stays near black are bars. */
async function detectCrop() {
  const sample = files.filter((_, i) => i % Math.max(1, Math.floor(files.length / 40)) === 0);
  let rowMax, colMax, W, H;
  for (const f of sample) {
    const { data, info } = await rotated(f).greyscale().raw().toBuffer({ resolveWithObject: true });
    W = info.width;
    H = info.height;
    rowMax ??= new Float64Array(H);
    colMax ??= new Float64Array(W);
    for (let y = 0; y < H; y++) {
      let sum = 0;
      for (let x = 0; x < W; x++) sum += data[y * W + x];
      rowMax[y] = Math.max(rowMax[y], sum / W);
    }
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let y = 0; y < H; y++) sum += data[y * W + x];
      colMax[x] = Math.max(colMax[x], sum / H);
    }
  }
  const BAR = 12; // mean luminance (0-255) below which a line counts as bar
  const first = (arr) => arr.findIndex((v) => v > BAR);
  const last = (arr) => arr.length - 1 - [...arr].reverse().findIndex((v) => v > BAR);
  const inset = 2; // shave anti-aliased edge rows
  let top = first(rowMax) + inset;
  let bottom = last(rowMax) - inset;
  let left = first(colMax);
  let right = last(colMax);
  left = left > 4 ? left + inset : 0;
  right = W - 1 - right > 4 ? right - inset : W - 1;
  if (top <= inset + 4) top = 0;
  if (H - 1 - bottom <= inset + 4) bottom = H - 1;
  return { left, top, width: right - left + 1, height: bottom - top + 1, W, H };
}

const crop = CROP === 'none' ? null : await detectCrop();
if (crop) console.log(`  picture area: ${crop.width}x${crop.height} at ${crop.left},${crop.top} (of ${crop.W}x${crop.H})`);
const upright = (file) => (crop ? rotated(file).extract(crop) : rotated(file));

let desktopSize = { width: 0, height: 0 };
let mobileSize = { width: 0, height: 0 };
let bytes = { desktop: 0, mobile: 0 };

async function convert(file, i) {
  const webp = { quality: QUALITY, effort: 5, smartSubsample: true };
  const d = await upright(file)
    .resize({ width: MAX_W, withoutEnlargement: true })
    .webp(webp)
    .toFile(path.join(OUT_DESKTOP, name(i)));
  const m = await upright(file)
    .resize({ width: MOBILE_W, withoutEnlargement: true })
    .webp({ ...webp, quality: Math.max(QUALITY - 5, 50) })
    .toFile(path.join(OUT_MOBILE, name(i)));
  desktopSize = { width: d.width, height: d.height };
  mobileSize = { width: m.width, height: m.height };
  bytes.desktop += d.size;
  bytes.mobile += m.size;
}

// Simple worker pool so we use every core without spawning 230 pipelines at once.
const queue = files.map((f, i) => [f, i]);
let done = 0;
await Promise.all(
  Array.from({ length: Math.max(2, os.cpus().length) }, async () => {
    for (let job; (job = queue.shift()); ) {
      await convert(...job);
      if (++done % 20 === 0 || done === files.length) {
        process.stdout.write(`\r  converted ${done}/${files.length}`);
      }
    }
  })
);
process.stdout.write('\n');

// Open Graph image (1200x630) from a representative frame.
const ogSource = files[Math.min(files.length, Math.max(1, OG_FRAME)) - 1];
await upright(ogSource)
  .resize(1200, 630, { fit: 'cover' })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(path.join(ROOT, 'public/og.jpg'));

await writeFile(
  path.join(ROOT, 'src/config/frames.generated.ts'),
  `// Generated by scripts/optimize-frames.mjs. Do not edit by hand; re-run \`npm run frames\`.
export const FRAME_META = {
  count: ${files.length},
  desktop: { width: ${desktopSize.width}, height: ${desktopSize.height} },
  mobile: { width: ${mobileSize.width}, height: ${mobileSize.height} },
} as const;
`
);

const kb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const src = (await Promise.all(files.map((f) => stat(path.join(IN, f))))).reduce((a, s) => a + s.size, 0);
console.log(`  frames:  ${files.length}`);
console.log(`  desktop: ${desktopSize.width}x${desktopSize.height}  ${kb(bytes.desktop)}  (avg ${(bytes.desktop / files.length / 1024).toFixed(0)} KB)`);
console.log(`  mobile:  ${mobileSize.width}x${mobileSize.height}  ${kb(bytes.mobile)}  (avg ${(bytes.mobile / files.length / 1024).toFixed(0)} KB)`);
console.log(`  source:  ${kb(src)}`);
