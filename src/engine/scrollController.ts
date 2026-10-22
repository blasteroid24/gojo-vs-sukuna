import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import type { FrameLoader } from './frameLoader';
import type { CanvasRenderer, FrameRect } from './canvasRenderer';
import type { Pacing } from './pacing';

gsap.registerPlugin(ScrollTrigger);

export interface ScrollControllerOptions {
  section: HTMLElement;
  loader: FrameLoader;
  renderer: CanvasRenderer;
  pacing: Pacing;
  lerp: number;
  lenisLerp: number;
  /** Desired horizontal focal point for a (fractional) frame. */
  focusFor(frame: number, banded: boolean): number;
  /** Called whenever the smoothed playhead moves. `frame` is fractional and 0-based. */
  onFrame(frame: number): void;
  onResize(rect: FrameRect): void;
}

/**
 * Scroll -> targetFrame (via ScrollTrigger + pacing map), then every tick the
 * displayed frame eases toward it. One loop (gsap.ticker) drives Lenis, the
 * canvas and the text timeline, so they can never drift apart.
 */
export class ScrollController {
  readonly lenis: Lenis;
  private readonly o: ScrollControllerOptions;
  private target = 0;
  private current = 0;
  private focus: number;
  private drawnIndex = -1;
  private drawnFocus = -1;
  private settled = false;
  private needsEmit = true;
  private trigger: ScrollTrigger;

  constructor(o: ScrollControllerOptions) {
    this.o = o;
    this.focus = o.focusFor(0, o.renderer.rect.banded);

    this.lenis = new Lenis({ lerp: o.lenisLerp, smoothWheel: true, autoRaf: false });
    this.lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(this.tick);
    gsap.ticker.lagSmoothing(0);

    this.trigger = ScrollTrigger.create({
      trigger: o.section,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        this.target = o.pacing.frameAt(self.progress);
      },
      onRefresh: (self) => {
        this.target = o.pacing.frameAt(self.progress);
        // On first layout (or reload mid-page) jump straight there instead of animating from 0.
        if (!this.settled) {
          this.current = this.target;
          this.needsEmit = true;
        }
      },
    });

    let t = 0;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = window.setTimeout(this.resize, 150);
    });
  }

  /** Smooth-scroll so that `frame` (0-based) is on screen. */
  scrollToFrame(frame: number, duration = 1.8): void {
    const { start, end } = this.trigger;
    const y = start + this.o.pacing.progressAt(frame) * (end - start);
    this.lenis.scrollTo(y, { duration, easing: (x) => 1 - Math.pow(1 - x, 4) });
  }

  private resize = () => {
    const { renderer } = this.o;
    renderer.resize(this.focus);
    this.o.onResize(renderer.rect);
    this.draw(true);
  };

  private tick = (time: number) => {
    this.lenis.raf(time * 1000);
    this.settled = true;

    // Frame-rate independent easing: same feel at 60, 120 or 144 Hz.
    const k = 1 - Math.pow(1 - this.o.lerp, gsap.ticker.deltaRatio(60));
    const delta = this.target - this.current;
    if (Math.abs(delta) > 0.002) {
      this.current += delta * k;
      this.o.onFrame(this.current);
    } else if (delta !== 0 || this.needsEmit) {
      this.current = this.target;
      this.o.onFrame(this.current);
    }
    this.needsEmit = false;

    const wantFocus = this.o.focusFor(this.current, this.o.renderer.rect.banded);
    this.focus += (wantFocus - this.focus) * k * 0.6;

    this.o.loader.setCursor(this.current);
    this.draw(false);
  };

  /** Redraw only when the visible frame (or the focal point) actually changes. */
  private draw(force: boolean): void {
    const hit = this.o.loader.nearest(this.current);
    if (!hit) return;
    const focusMoved = Math.abs(this.focus - this.drawnFocus) > 0.0005;
    if (!force && hit.index === this.drawnIndex && !focusMoved) return;
    this.o.renderer.draw(hit.image, this.focus);
    this.drawnIndex = hit.index;
    this.drawnFocus = this.focus;
  }
}
