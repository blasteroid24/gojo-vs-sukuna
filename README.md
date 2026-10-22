# Gojo vs Sukuna: a scroll-driven fan tribute

A cinematic, scroll-scrubbed frame sequence built with Vite, strict TypeScript, GSAP + ScrollTrigger, Lenis and a single `<canvas>`. There's no UI framework.

> Fan project. Jujutsu Kaisen belongs to Gege Akutami / MAPPA / Shueisha. Not for commercial use.

```bash
npm install
npm run frames   # only needed when the source frames change (output is already in public/)
npm run dev      # http://localhost:5173  (add ?debug to see zone boxes + frame counter)
npm run build    # typecheck + production build to dist/
npm run preview
```

## How it works

| Piece | File | Notes |
|---|---|---|
| Frame optimizer | `scripts/optimize-frames.mjs` | PNG/JPG to WebP (q75, ≤1920px desktop, 960px mobile). Rotates, auto-crops baked-in letterbox bars, writes `public/og.jpg` and `src/config/frames.generated.ts`. |
| Loader | `src/engine/frameLoader.ts` | Loads the first 10 frames, then streams the rest in the background, nearest-to-playhead first. Keeps compressed blobs for every frame but only decodes `ImageBitmap`s near the playhead plus every 10th keyframe (decoded frames are ~3 MB each). |
| Renderer | `src/engine/canvasRenderer.ts` | Cover fit with a focal point, DPR capped at 2 and never above source resolution, blurred "ambient" fill when the frame doesn't reach the screen edges. |
| Scroll | `src/engine/scrollController.ts` | Lenis → ScrollTrigger → `targetFrame`; a lerped `currentFrame` drives the canvas **and** the text timeline from one `gsap.ticker` loop. Redraws only when the visible frame changes. |
| Pacing | `src/engine/pacing.ts` | Maps scroll progress to frames with per-range weights, so short shots can hold longer. |
| Text | `src/ui/overlays.ts`, `src/ui/overlayMotion.ts` | Real DOM text positioned inside **frame-space** zones; a paused GSAP timeline in frame units is scrubbed by the playhead (fully reversible). |
| Chrome | `src/ui/preloader.ts`, `navbar.ts`, `cursor.ts` | Preloader runs before GSAP loads; navbar + side rail with jump-to-chapter; lazy cursor on fine pointers only. |

The entry chunk (preloader, loader, renderer, overlay DOM) is ~5 KB gzipped and starts fetching frames immediately. GSAP, ScrollTrigger and Lenis (~52 KB gzipped) download in parallel as a separate chunk.

## Common changes

### Swap or re-export the frames
Drop the new PNG/JPGs in `./frames` (any numeric naming) and run:

```bash
npm run frames                                # defaults: --rotate -90 --crop auto --quality 75
node scripts/optimize-frames.mjs --rotate 0   # frames that are already upright
node scripts/optimize-frames.mjs --crop none  # keep letterbox bars
node scripts/optimize-frames.mjs --og 120     # pick a different frame for the OG image
```

The **frame count and dimensions update automatically** through `src/config/frames.generated.ts`. If you change the count, re-check the frame numbers in `src/config/chapters.ts`.

### Edit chapters, copy and text positions
Everything lives in `src/config/chapters.ts`:

- `start` / `end`: 1-based frame numbers (match `frame_0001.webp` …)
- `lines`: one masked reveal per line; wrap words in `*asterisks*` for the accent colour
- `zone`: `left-top | left-middle | left-bottom | center-top | center | center-bottom | right-top | right-middle | right-bottom | bottom-wide`
- `align`: `left | center | right`
- `accent`: `blue | red | violet`
- `mobile.zone`: `top | bottom` (the band above/below the frame on portrait screens)
- `mobile.focusX`: 0–1 horizontal focal point while the chapter plays on phones
- `inFrames` / `outFrames`: optional fade lengths

Zone geometry is the `zones` table in the same file, in normalised **picture** coordinates. Open the site with `?debug` to see every zone box outlined plus the current frame number, then nudge the numbers.

### Change scroll length / pacing
- Overall length: `scrollLengthVh` in `src/config/settings.ts` (default `750`).
- Per-shot speed: the `pacing` array in `chapters.ts` (weight `2` = that range takes twice the scroll).

## Tuning guide

| Setting | Default | What it does / when to change it |
|---|---|---|
| `settings.scrollLengthVh` | 750 | Total scroll distance. Lower (550–650) feels punchy; higher (900+) is more cinematic but can feel like a chore on trackpads. 230 frames over ~650vh of travel is about 2.8vh per frame. |
| `pacing` weights | Gojo close-up 3.2 | The Gojo close-up is only 12 frames; without extra weight the quote flashes by. Raise a weight if a line is hard to read, lower it for action you want to feel fast. |
| `settings.lerp` | 0.1 | How quickly the image chases the scroll. 0.08 is silkier but lags; 0.15–0.2 is tighter on fast trackpad flicks. It's frame-rate independent (same feel at 60/120 Hz). |
| `settings.lenisLerp` | 0.09 | Smooth-scroll inertia. Stacks with `lerp`, so lower one if the combination feels floaty. |
| `zones` / chapter `zone` | from the scene map | The main safeguard that text never covers Gojo or Sukuna. Check with `?debug` at 16:9, 16:10, and a portrait phone. |
| `settings.maxSideCrop` | 0.16 | The footage is ~2.35:1. This is how much of the width may be cropped on 16:9/16:10 screens before the picture stops growing and the blurred ambient fill shows above/below. Raise it for a bigger image, lower it to protect the frame edges. |
| `settings.portraitFrameFill` | 0.52 | Portrait screens: picture height as a fraction of the viewport. The remaining top/bottom bands hold the text. |
| `loading.decodeRadius` | 36 / 20 | Decoded frames kept around the playhead (desktop/mobile). Higher means fewer fallback frames on very fast scrubs but more memory (~3 MB per frame on desktop). |
| `loading.initialBatch` | 10 | Frames required before the preloader exits. |

## Scene map (from inspecting the footage)

| Frames | Shot | Free zone used |
|---|---|---|
| 1–18 | Low-angle running feet | left-bottom (hero) |
| 19–30 | Gojo close-up | left-middle |
| 38–72 | Gojo flung left, Sukuna lunging right | right-bottom |
| 73–103 | Gojo + Reversal Red | right-top |
| 118–141 | Explosion | bottom-wide |
| 149–172 | Black | center |
| 173–230 | "The Honored One" title card | kept clean |

## Accessibility & motion
- All copy is real DOM (h1/h2/p); the canvas has a descriptive `aria-label`. There's a skip link, keyboard scrolling works (Lenis doesn't hijack keys), and the side-rail ticks are buttons.
- `prefers-reduced-motion`: no smooth scroll or scrubbing. Only one still (`reducedMotionFrame`, an empty city shot) is downloaded and every chapter is stacked over it.
