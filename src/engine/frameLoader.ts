/**
 * Two-tier frame cache:
 *  - network tier: every frame is fetched once and kept as a compressed Blob (~50 KB)
 *  - decode tier:  only frames near the playhead (plus sparse keyframes) are held as
 *                  ImageBitmaps, because a decoded 1280x720 frame costs ~3.7 MB and
 *                  230 of them would be ~850 MB.
 * Both tiers are scheduled by distance to the playhead, so whatever the user is
 * looking at (or about to scroll into) always wins.
 */

export type Drawable = ImageBitmap | HTMLImageElement;

export interface FrameLoaderOptions {
  count: number;
  urlFor(index: number): string;
  concurrency: number;
  decodeRadius: number;
  keyframeStride: number;
}

const DECODE_CONCURRENCY = 3;
const MAX_RETRIES = 2;

const supportsBitmap = typeof createImageBitmap === 'function';

async function decode(blob: Blob): Promise<Drawable> {
  if (supportsBitmap) return createImageBitmap(blob);
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  return img;
}

export class FrameLoader {
  private readonly opts: FrameLoaderOptions;
  private readonly blobs: (Blob | undefined)[];
  private readonly bitmaps: (Drawable | undefined)[];
  private readonly fetching = new Set<number>();
  private readonly decoding = new Set<number>();
  private readonly retries = new Map<number, number>();
  private readonly dead = new Set<number>();
  private cursor = 0;
  private direction = 1;
  private fetched = 0;
  /** While the first batch loads, nothing beyond it is requested, so it gets all the bandwidth. */
  private gate = Infinity;
  private listeners = new Set<() => void>();

  constructor(opts: FrameLoaderOptions) {
    this.opts = opts;
    this.blobs = new Array(opts.count);
    this.bitmaps = new Array(opts.count);
  }

  /** Fraction of frames downloaded (0..1). */
  get progress(): number {
    return this.fetched / this.opts.count;
  }

  /** Begin loading. Resolves once frames [0, n) are decoded; `onProgress` gets 0..1. */
  start(n: number, onProgress?: (p: number) => void): Promise<void> {
    const batch = Math.min(n, this.opts.count);
    this.gate = batch;
    return new Promise((resolve) => {
      const check = () => {
        let ready = 0;
        for (let i = 0; i < batch; i++) if (this.bitmaps[i] || this.dead.has(i)) ready++;
        onProgress?.(ready / batch);
        if (ready === batch) {
          this.listeners.delete(check);
          this.openGate();
          resolve();
        }
      };
      this.listeners.add(check);
      this.pump();
      check();
    });
  }

  /** Allow background loading beyond the first batch (called automatically once it's ready). */
  openGate(): void {
    if (this.gate === Infinity) return;
    this.gate = Infinity;
    // Background loading starts once the browser is idle (first paint, intro, etc.).
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
    idle(() => this.pump());
  }

  /** Tell the loader where the playhead is, so it can reprioritise and evict. */
  setCursor(index: number): void {
    const i = Math.round(index);
    if (i === this.cursor) return;
    this.direction = i > this.cursor ? 1 : -1;
    this.cursor = i;
    this.evict();
    this.pump();
  }

  /** The decoded frame closest to `index` (exact match first). Never undefined once anything has loaded. */
  nearest(index: number): { index: number; image: Drawable } | undefined {
    const { count } = this.opts;
    const i = Math.min(Math.max(Math.round(index), 0), count - 1);
    for (let d = 0; d < count; d++) {
      const a = this.bitmaps[i - d];
      if (a) return { index: i - d, image: a };
      const b = this.bitmaps[i + d];
      if (b) return { index: i + d, image: b };
      if (i - d < 0 && i + d >= count) break;
    }
    return undefined;
  }

  get(index: number): Drawable | undefined {
    return this.bitmaps[index];
  }

  // ---------------------------------------------------------------------------

  private isKeyframe(i: number): boolean {
    return i % this.opts.keyframeStride === 0;
  }

  private inWindow(i: number, slack = 1): boolean {
    return Math.abs(i - this.cursor) <= this.opts.decodeRadius * slack;
  }

  /** Lower score = more urgent. Frames ahead of the scroll direction and keyframes jump the queue. */
  private score(i: number): number {
    const delta = (i - this.cursor) * this.direction;
    let s = delta >= 0 ? delta : -delta * 1.6;
    if (this.isKeyframe(i)) s *= 0.35;
    return s;
  }

  private pick(predicate: (i: number) => boolean): number {
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < this.opts.count; i++) {
      if (!predicate(i)) continue;
      const s = this.score(i);
      if (s < bestScore) {
        bestScore = s;
        best = i;
      }
    }
    return best;
  }

  private pump(): void {
    while (this.fetching.size < this.opts.concurrency) {
      const i = this.pick((k) => k < this.gate && !this.blobs[k] && !this.fetching.has(k) && !this.dead.has(k));
      if (i < 0) break;
      void this.fetchFrame(i);
    }
    while (this.decoding.size < DECODE_CONCURRENCY) {
      const i = this.pick(
        (k) =>
          !!this.blobs[k] &&
          !this.bitmaps[k] &&
          !this.decoding.has(k) &&
          (this.inWindow(k) || this.isKeyframe(k))
      );
      if (i < 0) break;
      void this.decodeFrame(i);
    }
  }

  private async fetchFrame(i: number): Promise<void> {
    this.fetching.add(i);
    try {
      const init: RequestInit & { priority?: 'high' | 'low' | 'auto' } = {
        priority: this.gate !== Infinity || Math.abs(i - this.cursor) < 6 ? 'high' : 'low',
      };
      const res = await fetch(this.opts.urlFor(i), init);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.blobs[i] = await res.blob();
      this.fetched++;
    } catch (err) {
      const n = (this.retries.get(i) ?? 0) + 1;
      this.retries.set(i, n);
      if (n > MAX_RETRIES) {
        this.dead.add(i);
        console.warn(`[frames] giving up on frame ${i + 1}`, err);
        this.notify();
      } else {
        await new Promise((r) => setTimeout(r, 400 * n));
      }
    } finally {
      this.fetching.delete(i);
      this.pump();
    }
  }

  private async decodeFrame(i: number): Promise<void> {
    const blob = this.blobs[i];
    if (!blob) return;
    this.decoding.add(i);
    try {
      const image = await decode(blob);
      // The playhead may have moved away while we were decoding.
      if (this.inWindow(i, 1.25) || this.isKeyframe(i) || i < 2) this.bitmaps[i] = image;
      else release(image);
    } catch (err) {
      this.dead.add(i);
      console.warn(`[frames] could not decode frame ${i + 1}`, err);
    } finally {
      this.decoding.delete(i);
      this.notify();
      this.pump();
    }
  }

  /** Drop decoded frames well outside the window (hysteresis avoids thrash at the edge). */
  private evict(): void {
    for (let i = 0; i < this.opts.count; i++) {
      const img = this.bitmaps[i];
      if (img && !this.isKeyframe(i) && !this.inWindow(i, 1.25)) {
        release(img);
        this.bitmaps[i] = undefined;
      }
    }
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}

function release(img: Drawable): void {
  if ('close' in img) img.close();
  else URL.revokeObjectURL(img.src);
}
