import type { Drawable } from './frameLoader';

export interface FrameRect {
  /** Drawn frame position/size in CSS pixels, relative to the viewport. */
  x: number;
  y: number;
  w: number;
  h: number;
  viewportW: number;
  viewportH: number;
  /** Portrait layout: frame shown as a band, text goes in the space above/below it. */
  banded: boolean;
  /** Frame doesn't reach the top/bottom of the viewport, so the ambient backdrop is drawn. */
  ambient: boolean;
}

export interface RendererOptions {
  frameWidth: number;
  frameHeight: number;
  dprCap: number;
  focus: { x: number; y: number };
  portraitFrameFill: number;
  maxSideCrop: number;
}

/** Canvas fill for areas outside the frame; matches --bg in tokens.css. */
const BACKDROP_TINT = 'rgba(4, 6, 12, 0.62)';
const FEATHER_CSS_PX = 48;

export class CanvasRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly opts: RendererOptions;
  private readonly tiny: HTMLCanvasElement;
  private readonly tinyCtx: CanvasRenderingContext2D;
  private scale = 1; // backing pixels per CSS pixel
  private layout: FrameRect = { x: 0, y: 0, w: 0, h: 0, viewportW: 0, viewportH: 0, banded: false, ambient: false };

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions) {
    this.canvas = canvas;
    this.opts = opts;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas not supported');
    this.ctx = ctx;

    // A 32x18 copy of the frame, scaled back up, is a free "blur" for the portrait backdrop.
    this.tiny = document.createElement('canvas');
    this.tiny.width = 32;
    this.tiny.height = 18;
    this.tinyCtx = this.tiny.getContext('2d', { alpha: false })!;
  }

  get rect(): FrameRect {
    return this.layout;
  }

  /** Re-measure the canvas. Returns true if the backing store changed. */
  resize(focusX = this.opts.focus.x): boolean {
    const vw = this.canvas.clientWidth;
    const vh = this.canvas.clientHeight;
    if (!vw || !vh) return false;

    const { frameWidth: fw, frameHeight: fh, portraitFrameFill: fill, maxSideCrop } = this.opts;
    const banded = vw / vh < 1 && fill < 1;
    // Landscape: zoom to cover, but never crop more than `maxSideCrop` of the frame's width;
    // past that, keep the full height of the picture and let the ambient backdrop fill the rest.
    const s = banded
      ? Math.max((vh * fill) / fh, vw / fw)
      : Math.max(vw / fw, Math.min(vh / fh, vw / (fw * (1 - maxSideCrop))));
    const w = fw * s;
    const h = fh * s;
    const ambient = h < vh - 0.5;

    // Rendering above the source resolution adds cost and no detail.
    const dpr = Math.min(window.devicePixelRatio || 1, this.opts.dprCap);
    const scale = Math.min(dpr, Math.max(1, fw / w));

    this.layout = {
      x: (vw - w) * focusX,
      y: (vh - h) * (ambient ? 0.5 : this.opts.focus.y),
      w,
      h,
      viewportW: vw,
      viewportH: vh,
      banded,
      ambient,
    };

    const bw = Math.round(vw * scale);
    const bh = Math.round(vh * scale);
    if (bw === this.canvas.width && bh === this.canvas.height && scale === this.scale) return false;
    this.scale = scale;
    this.canvas.width = bw;
    this.canvas.height = bh;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    return true;
  }

  draw(image: Drawable, focusX: number): void {
    const { ctx, scale, layout } = this;
    const { viewportW: vw, viewportH: vh } = layout;
    if (!vw) return;

    const x = (vw - layout.w) * focusX;
    layout.x = x;

    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    if (layout.ambient) {
      this.tinyCtx.drawImage(image, 0, 0, this.tiny.width, this.tiny.height);
      const bs = Math.max(vw / 32, vh / 18);
      ctx.drawImage(this.tiny, (vw - 32 * bs) / 2, (vh - 18 * bs) / 2, 32 * bs, 18 * bs);
      ctx.fillStyle = BACKDROP_TINT;
      ctx.fillRect(0, 0, vw, vh);
    }

    ctx.drawImage(image, x, layout.y, layout.w, layout.h);

    if (layout.ambient) {
      // Feather the band edges into the backdrop so there is no hard seam.
      const top = layout.y;
      const bottom = layout.y + layout.h;
      const f = Math.min(FEATHER_CSS_PX, layout.h * 0.15);
      let g = ctx.createLinearGradient(0, top, 0, top + f);
      g.addColorStop(0, 'rgba(4,6,12,0.9)');
      g.addColorStop(1, 'rgba(4,6,12,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, top, vw, f);
      g = ctx.createLinearGradient(0, bottom - f, 0, bottom);
      g.addColorStop(0, 'rgba(4,6,12,0)');
      g.addColorStop(1, 'rgba(4,6,12,0.9)');
      ctx.fillStyle = g;
      ctx.fillRect(0, bottom - f, vw, f);
    }
  }
}
