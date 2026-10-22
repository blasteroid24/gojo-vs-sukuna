import { zones, type Chapter } from '../config/chapters';
import type { FrameRect } from '../engine/canvasRenderer';

/**
 * Builds the chapter text as real DOM (readable by screen readers and search
 * engines) and positions each block inside its zone of the drawn frame.
 * Animation lives in overlayMotion.ts so this file carries no GSAP weight.
 */

export interface ChapterView {
  chapter: Chapter;
  el: HTMLElement;
  inner: HTMLElement;
  kicker: HTMLElement | null;
  lines: HTMLElement[];
  sub: HTMLElement | null;
}

export interface Overlays {
  root: HTMLElement;
  views: ChapterView[];
  layout(rect: FrameRect): void;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** `*word*` -> <em>word</em>, everything else escaped. */
const markup = (s: string) => escapeHtml(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

export function buildOverlays(root: HTMLElement, chapters: Chapter[]): Overlays {
  const views = chapters.map((chapter) => {
    const el = document.createElement('article');
    el.className = `chapter chapter--${chapter.variant}`;
    el.id = `chapter-${chapter.id}`;
    el.dataset.zone = chapter.zone;
    el.dataset.align = chapter.align;
    el.dataset.accent = chapter.accent;
    el.dataset.mzone = chapter.mobile.zone;

    const heading = chapter.variant === 'hero' ? 'h1' : 'h2';
    el.innerHTML = `
      <div class="chapter__inner">
        ${chapter.kicker ? `<p class="chapter__kicker">${markup(chapter.kicker)}</p>` : ''}
        <${heading} class="chapter__title">${chapter.lines
          .map((l) => `<span class="line"><span class="line__inner">${markup(l)}</span></span>`)
          .join('')}</${heading}>
        ${chapter.sub ? `<p class="chapter__sub">${markup(chapter.sub)}</p>` : ''}
      </div>`;
    root.append(el);

    return {
      chapter,
      el,
      inner: el.querySelector<HTMLElement>('.chapter__inner')!,
      kicker: el.querySelector<HTMLElement>('.chapter__kicker'),
      lines: [...el.querySelectorAll<HTMLElement>('.line__inner')],
      sub: el.querySelector<HTMLElement>('.chapter__sub'),
    };
  });

  return {
    root,
    views,
    layout(rect) {
      const cs = getComputedStyle(root);
      const gutter = parseFloat(cs.getPropertyValue('--gutter')) || 24;
      const navH = parseFloat(cs.getPropertyValue('--nav-h')) || 64;
      // Keep right-aligned text clear of the chapter rail.
      const railSpace = parseFloat(cs.getPropertyValue('--rail-space')) || 0;
      const { viewportW: vw, viewportH: vh } = rect;
      root.classList.toggle('is-banded', rect.banded);

      for (const { chapter, el } of views) {
        let left: number, top: number, width: number, height: number;

        if (rect.banded) {
          // Portrait: the band above or below the frame is guaranteed character-free.
          left = gutter;
          width = vw - gutter * 2;
          top = chapter.mobile.zone === 'top' ? navH : rect.y + rect.h;
          height = (chapter.mobile.zone === 'top' ? rect.y : vh - gutter) - top;
        } else {
          const z = zones[chapter.zone];
          const x0 = Math.max(gutter, rect.x + z.x0 * rect.w);
          const x1 = Math.min(vw - gutter - railSpace, rect.x + z.x1 * rect.w);
          const y0 = Math.max(navH, rect.y + z.y0 * rect.h);
          const y1 = Math.min(vh - gutter, rect.y + z.y1 * rect.h);
          left = x0;
          top = y0;
          width = Math.max(0, x1 - x0);
          height = Math.max(0, y1 - y0);
        }

        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        el.style.width = `${width}px`;
        el.style.height = `${Math.max(0, height)}px`;
      }
    },
  };
}
