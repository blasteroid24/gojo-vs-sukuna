/**
 * Dot + trailing ring cursor. Transform-only, one rAF loop that sleeps when idle.
 * Loaded lazily and only on fine-pointer devices without reduced motion.
 */
export function initCursor(): void {
  const dot = document.createElement('div');
  const ring = document.createElement('div');
  dot.className = 'cursor cursor--dot';
  ring.className = 'cursor cursor--ring';
  dot.setAttribute('aria-hidden', 'true');
  ring.setAttribute('aria-hidden', 'true');
  document.body.append(dot, ring);
  document.documentElement.classList.add('has-cursor');

  let x = -100;
  let y = -100;
  let rx = x;
  let ry = y;
  let raf = 0;

  const loop = () => {
    rx += (x - rx) * 0.18;
    ry += (y - ry) * 0.18;
    dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    raf = Math.abs(x - rx) + Math.abs(y - ry) > 0.1 ? requestAnimationFrame(loop) : 0;
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(loop);
    },
    { passive: true }
  );

  const hover = (on: boolean) => (e: Event) => {
    if ((e.target as Element).closest?.('a, button')) ring.classList.toggle('is-hover', on);
  };
  document.addEventListener('pointerover', hover(true));
  document.addEventListener('pointerout', hover(false));
  document.addEventListener('pointerleave', () => document.documentElement.classList.add('cursor-out'));
  document.addEventListener('pointerenter', () => document.documentElement.classList.remove('cursor-out'));
}
