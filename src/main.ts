import './styles/main.css';
import { settings, type FrameSet } from './config/settings';
import { chapters } from './config/chapters';
import { FrameLoader } from './engine/frameLoader';
import { CanvasRenderer } from './engine/canvasRenderer';
import { createPreloader } from './ui/preloader';
import { buildOverlays } from './ui/overlays';

/**
 * Entry chunk: only what's needed to start fetching frames and paint the
 * preloader. GSAP, Lenis and all scroll logic arrive in parallel via ./app.
 */

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

function pickFrameSet(): FrameSet {
  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  const slow = !!conn && (conn.saveData === true || /(^|-)2g|3g/.test(conn.effectiveType ?? ''));
  const small = Math.min(window.innerWidth, window.screen.width) < settings.mobileBreakpoint;
  return slow || small ? 'frames-mobile' : 'frames';
}

const html = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const debug = new URLSearchParams(location.search).has('debug');
html.classList.toggle('is-reduced', reduced);
html.classList.toggle('debug-zones', debug);

const app = import('./app');

const set = pickFrameSet();
const size = set === 'frames' ? settings.frameSize.desktop : settings.frameSize.mobile;
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const sequence = document.getElementById('sequence')!;
sequence.style.height = reduced ? '' : `${settings.scrollLengthVh}vh`;

const renderer = new CanvasRenderer(canvas, {
  frameWidth: size.width,
  frameHeight: size.height,
  dprCap: settings.dprCap,
  focus: settings.focus,
  portraitFrameFill: settings.portraitFrameFill,
  maxSideCrop: settings.maxSideCrop,
});
renderer.resize();

const overlays = buildOverlays(document.getElementById('overlays')!, chapters);
overlays.layout(renderer.rect);

const loader = new FrameLoader({
  count: settings.frameCount,
  urlFor: (i) => settings.frameUrl(set, i),
  concurrency: settings.loading.concurrency,
  decodeRadius: set === 'frames' ? settings.loading.decodeRadius.desktop : settings.loading.decodeRadius.mobile,
  keyframeStride: settings.loading.keyframeStride,
});

const preloader = createPreloader(document.getElementById('preloader')!);

async function boot() {
  let still: HTMLImageElement | undefined;
  if (reduced) {
    // One still, no scrubbing, and none of the other 229 frames are downloaded.
    still = new Image();
    still.src = settings.frameUrl(set, settings.reducedMotionFrame - 1);
    await Promise.race([still.decode().catch(() => undefined), delay(8000)]);
    if (still.naturalWidth) renderer.draw(still, settings.focus.x);
    else still = undefined;
  } else {
    // Never let a stalled request hold the site hostage; nearest-frame fallback covers gaps.
    await Promise.race([loader.start(settings.loading.initialBatch, preloader.update), delay(9000)]);
    loader.openGate();
  }

  const { startApp } = await app;
  await startApp({ loader, renderer, overlays, preloader, sequence, reduced, debug, still });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

void boot();
