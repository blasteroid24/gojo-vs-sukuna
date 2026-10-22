import { FRAME_META } from './frames.generated';

/**
 * Global tuning knobs. Everything that affects feel or performance lives here,
 * so the engine code never needs to change when you swap footage.
 */
export const settings = {
  /** Number of frames on disk. Comes from `npm run frames`; override if you trim the set. */
  frameCount: FRAME_META.count,
  frameSize: FRAME_META,

  /**
   * Height of the scroll-driven section, in viewport heights. The animation plays
   * over (scrollLengthVh - 100)vh of actual scrolling. Higher = slower, more cinematic.
   */
  scrollLengthVh: 750,

  /**
   * How quickly the displayed frame chases the scroll position, per 60fps tick.
   * 0.1 = buttery but slightly behind; 0.2 = snappier; 1 = no smoothing.
   */
  lerp: 0.1,

  /** Smooth-scroll inertia (Lenis). Lower = floatier. */
  lenisLerp: 0.09,

  /** Image focal point used by "cover" fitting (0..1 in frame space). */
  focus: { x: 0.5, y: 0.5 },

  /**
   * On portrait screens a 16:9 frame can't be cropped to fill without losing both
   * fighters, so the frame is shown as a wide band this tall (fraction of viewport
   * height) with a blurred extension of the same frame above and below. Those bands
   * are where mobile text lives, so it never sits on top of the characters.
   * Set to 1 to use plain full-screen cover on phones.
   */
  portraitFrameFill: 0.52,

  /**
   * Landscape screens: the footage is ~2.35:1, so filling a 16:9/16:10 screen means
   * cropping the sides. This caps the crop (fraction of frame width); beyond it the
   * full picture height is kept and a blurred ambient copy fills above/below.
   * 1 = always cover, 0 = never crop.
   */
  maxSideCrop: 0.16,

  /** Device-pixel-ratio ceiling for the canvas. */
  dprCap: 2,

  loading: {
    /** Frames that must be ready before the preloader exits. */
    initialBatch: 10,
    /** Parallel network requests for frames. */
    concurrency: 6,
    /**
     * Decoded ImageBitmaps are big (1280x720 = 3.7 MB each). Only frames within this
     * distance of the playhead stay decoded; the rest are kept as compressed blobs.
     */
    decodeRadius: { desktop: 36, mobile: 20 },
    /** Every Nth frame stays decoded permanently, so fast scrubs always have something close. */
    keyframeStride: 10,
  },

  /** Below this width (or on slow/save-data connections) the 960px mobile set is used. */
  mobileBreakpoint: 768,

  /** Frame shown (alone, with stacked text) when prefers-reduced-motion is on. Pick one with no characters. */
  reducedMotionFrame: 116,

  /**
   * Where frames live. `set` is "frames" or "frames-mobile"; `index` is 0-based.
   */
  frameUrl(set: FrameSet, index: number): string {
    return `${import.meta.env.BASE_URL}${set}/frame_${String(index + 1).padStart(4, '0')}.webp`;
  },
} as const;

export type FrameSet = 'frames' | 'frames-mobile';
