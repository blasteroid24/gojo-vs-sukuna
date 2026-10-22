import type { Chapter } from '../config/chapters';
import type { Pacing } from '../engine/pacing';
import { chapterTiming } from './overlayMotion';

/**
 * Top bar chapter indicator + side progress rail with jump-to-chapter ticks.
 * DOM writes are limited to transforms every frame and text when the chapter changes.
 */
export function createNavbar(opts: {
  chapters: Chapter[];
  pacing: Pacing;
  onSelect(frame: number): void;
}) {
  const { chapters, pacing } = opts;
  const indexEl = document.querySelector<HTMLElement>('[data-chapter-index]')!;
  const labelEl = document.querySelector<HTMLElement>('[data-chapter-label]')!;
  const rail = document.querySelector<HTMLElement>('[data-rail]')!;
  const fill = rail.querySelector<HTMLElement>('[data-rail-fill]')!;
  const buffer = rail.querySelector<HTMLElement>('[data-rail-buffer]')!;
  const list = rail.querySelector<HTMLElement>('[data-rail-ticks]')!;
  const total = String(chapters.length).padStart(2, '0');

  const ticks = chapters.map((c, i) => {
    const { start, holdMid } = chapterTiming(c);
    const li = document.createElement('li');
    li.style.top = `${pacing.progressAt(start) * 100}%`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rail__tick';
    btn.innerHTML = `<span class="rail__label">${String(i + 1).padStart(2, '0')} · ${c.nav}</span>`;
    btn.setAttribute('aria-label', `Jump to chapter ${i + 1}: ${c.nav}`);
    btn.addEventListener('click', () => opts.onSelect(holdMid));
    li.append(btn);
    list.append(li);
    return btn;
  });

  let active = -1;
  let lastProgress = -1;
  let lastBuffer = -1;

  return {
    update(frame: number, buffered: number) {
      const progress = pacing.progressAt(frame);
      if (Math.abs(progress - lastProgress) > 0.0005) {
        lastProgress = progress;
        fill.style.transform = `scaleY(${progress})`;
      }
      if (buffered !== lastBuffer) {
        lastBuffer = buffered;
        buffer.style.transform = `scaleY(${buffered})`;
      }

      let idx = 0;
      for (let i = 0; i < chapters.length; i++) if (frame >= chapters[i]!.start - 1.5) idx = i;
      if (idx !== active) {
        ticks[active]?.removeAttribute('aria-current');
        ticks[idx]?.setAttribute('aria-current', 'step');
        active = idx;
        indexEl.textContent = `${String(idx + 1).padStart(2, '0')} / ${total}`;
        labelEl.textContent = chapters[idx]!.nav;
      }
    },
  };
}
