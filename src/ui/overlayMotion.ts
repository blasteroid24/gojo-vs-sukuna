import { gsap } from 'gsap';
import type { Chapter } from '../config/chapters';
import type { ChapterView, Overlays } from './overlays';

/**
 * One paused timeline whose time unit is *frames*. The scroll controller sets
 * `timeline.time(currentFrame)`, so text is locked to the image the user sees
 * (including the lerp), and scrubbing backwards simply plays it in reverse.
 * Only opacity and transforms are animated.
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function chapterTiming(c: Chapter) {
  const start = c.start - 1;
  const end = c.end - 1;
  const len = Math.max(1, end - start);
  const inF = c.inFrames ?? clamp(len * 0.3, 2, 8);
  const outF = c.outFrames ?? clamp(len * 0.22, 2, 6);
  return { start, end, inF, outF, holdMid: (start + inF + end - outF) / 2 };
}

export function createOverlayTimeline(overlays: Overlays, frameCount: number, extras: { scrollCue?: Element | null }) {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });

  for (const view of overlays.views) {
    const { chapter, inner, kicker, lines, sub } = view;
    const { start, end, inF, outF } = chapterTiming(chapter);

    if (chapter.variant !== 'hero') {
      tl.fromTo(inner, { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: inF, ease: 'power2.out' }, start);
      if (kicker) tl.fromTo(kicker, { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: inF * 0.8, ease: 'power2.out' }, start);
      tl.fromTo(
        lines,
        { yPercent: 110 },
        { yPercent: 0, duration: inF * 0.85, stagger: inF * 0.18, ease: 'power3.out' },
        start + inF * 0.1
      );
      if (sub) tl.fromTo(sub, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: inF * 0.6, ease: 'power2.out' }, start + inF * 0.45);
      if (chapter.variant === 'outline') {
        tl.fromTo(lines, { scale: 1.12 }, { scale: 1, duration: end - start, ease: 'none' }, start);
      }
    }

    tl.to(inner, { opacity: 0, y: -28, duration: outF, ease: 'power2.in' }, end - outF);
  }

  if (extras.scrollCue) tl.to(extras.scrollCue, { opacity: 0, y: 12, duration: 3 }, 0.5);

  // Make the timeline span the whole sequence so time == frame index everywhere.
  tl.set({}, {}, frameCount - 1);
  return tl;
}

/** Time-based entrance for the hero, played as the preloader curtain lifts. */
export function createHeroIntro(view: ChapterView | undefined, nav: Element | null) {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } });
  if (!view) return tl;
  const { kicker, lines, sub } = view;
  tl.fromTo(lines, { yPercent: 115 }, { yPercent: 0, duration: 1.4, stagger: 0.12 }, 0.15);
  if (kicker) tl.fromTo(kicker, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 1.1 }, 0.2);
  if (sub) tl.fromTo(sub, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 1.1 }, 0.55);
  if (nav) tl.fromTo(nav, { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: 1 }, 0.5);
  // Apply the "from" state now, while the preloader still covers the page.
  tl.progress(0.0001).progress(0);
  return tl;
}
