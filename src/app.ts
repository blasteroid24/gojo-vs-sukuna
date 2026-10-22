import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { settings } from './config/settings';
import { chapters, pacing as pacingRanges } from './config/chapters';
import { createPacing } from './engine/pacing';
import { ScrollController } from './engine/scrollController';
import type { FrameLoader } from './engine/frameLoader';
import type { CanvasRenderer } from './engine/canvasRenderer';
import type { Overlays } from './ui/overlays';
import type { Preloader } from './ui/preloader';
import { createHeroIntro, createOverlayTimeline } from './ui/overlayMotion';
import { createNavbar } from './ui/navbar';

gsap.registerPlugin(ScrollTrigger);

export interface AppContext {
  loader: FrameLoader;
  renderer: CanvasRenderer;
  overlays: Overlays;
  preloader: Preloader;
  sequence: HTMLElement;
  reduced: boolean;
  debug: boolean;
  still: HTMLImageElement | undefined;
}

export async function startApp(ctx: AppContext): Promise<void> {
  const { loader, renderer, overlays, preloader, sequence } = ctx;
  const nav = document.querySelector('[data-nav]');

  if (ctx.reduced) {
    // Static still behind a normal-flow column of every chapter. No scrubbing, no smooth scroll.
    sequence.after(overlays.root);
    document.querySelector('[data-replay]')?.addEventListener('click', () => window.scrollTo({ top: 0 }));
    window.addEventListener('resize', () => {
      renderer.resize();
      if (ctx.still) renderer.draw(ctx.still, settings.focus.x);
    });
    await preloader.finish();
    return;
  }

  const pacing = createPacing(settings.frameCount, pacingRanges);
  const timeline = createOverlayTimeline(overlays, settings.frameCount, {
    scrollCue: document.querySelector('[data-scroll-cue]'),
  });
  const intro = createHeroIntro(
    overlays.views.find((v) => v.chapter.variant === 'hero'),
    nav
  );

  // Horizontal focal point per chapter (portrait only): hold the last chapter's value between chapters.
  const focusFor = (frame: number, banded: boolean) => {
    if (!banded) return settings.focus.x;
    let fx: number = settings.focus.x;
    for (const c of chapters) if (frame >= c.start - 1 - 4) fx = c.mobile.focusX ?? settings.focus.x;
    return fx;
  };

  const hud = ctx.debug ? createHud() : null;

  const navbar = createNavbar({
    chapters,
    pacing,
    onSelect: (frame) => controller.scrollToFrame(frame),
  });

  const controller = new ScrollController({
    section: sequence,
    loader,
    renderer,
    pacing,
    lerp: settings.lerp,
    lenisLerp: settings.lenisLerp,
    focusFor,
    onFrame(frame) {
      timeline.time(frame);
      navbar.update(frame, loader.progress);
      hud?.(frame);
    },
    onResize(rect) {
      overlays.layout(rect);
    },
  });

  // Keep the buffer indicator moving even while the user isn't scrolling.
  const bufferTimer = setInterval(() => {
    navbar.update(timeline.time(), loader.progress);
    if (loader.progress >= 1) clearInterval(bufferTimer);
  }, 500);

  timeline.time(0);
  navbar.update(0, loader.progress);
  controller.lenis.stop();

  document.querySelector('[data-replay]')?.addEventListener('click', () => {
    controller.lenis.scrollTo(0, { duration: 2.4 });
  });

  revealFooter();

  await preloader.finish(() => intro.play());
  controller.lenis.start();
  ScrollTrigger.refresh();

  if (matchMedia('(pointer: fine)').matches) {
    void import('./ui/cursor').then((m) => m.initCursor());
  }
}

function revealFooter(): void {
  const items = gsap.utils.toArray<HTMLElement>('[data-reveal]');
  gsap.set(items, { opacity: 0, y: 24 });
  ScrollTrigger.batch(items, {
    start: 'top 88%',
    onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 1, stagger: 0.08, ease: 'expo.out' }),
  });
}

/** `?debug` overlay: current frame number, so zones and timings are easy to tune. */
function createHud() {
  const el = document.createElement('div');
  el.className = 'debug-hud';
  document.body.append(el);
  let last = -1;
  return (frame: number) => {
    const f = Math.round(frame) + 1;
    if (f !== last) el.textContent = `frame ${(last = f)} / ${settings.frameCount}`;
  };
}
