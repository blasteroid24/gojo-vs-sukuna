/**
 * Percentage counter + hairline progress bar. Pure CSS/rAF so it runs before the
 * GSAP chunk has even downloaded.
 */
export interface Preloader {
  update(progress: number): void;
  /** Runs the counter to 100, then plays the exit. `onLeave` fires as the curtain starts moving. */
  finish(onLeave?: () => void): Promise<void>;
}

export function createPreloader(root: HTMLElement): Preloader {
  const count = root.querySelector<HTMLElement>('[data-count]')!;
  const bar = root.querySelector<HTMLElement>('[data-bar]')!;
  let target = 0;
  let shown = 0;
  let raf = 0;
  let lastPct = -1;
  let reached: (() => void) | null = null;

  const tick = () => {
    shown += (target - shown) * 0.16;
    if (target - shown < 0.002) shown = target;
    const pct = Math.round(shown * 100);
    if (pct !== lastPct) {
      lastPct = pct;
      count.textContent = String(pct);
      root.setAttribute('aria-valuenow', String(pct));
    }
    bar.style.transform = `scaleX(${shown})`;
    if (shown < target) raf = requestAnimationFrame(tick);
    else {
      raf = 0;
      if (shown >= 1) reached?.();
    }
  };

  const update = (p: number) => {
    target = Math.max(target, Math.min(1, p));
    if (!raf) raf = requestAnimationFrame(tick);
  };

  return {
    update,
    async finish(onLeave) {
      await new Promise<void>((resolve) => {
        reached = resolve;
        update(1);
        if (shown >= 1) resolve();
      });
      root.classList.add('is-leaving');
      document.documentElement.classList.remove('is-loading');
      onLeave?.();
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        root.addEventListener('transitionend', (e) => e.target === root && done());
        setTimeout(done, 1400);
      });
      root.remove();
    },
  };
}
