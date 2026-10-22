/**
 * Story chapters and pacing. This is the file to edit for copy, timing and text placement.
 *
 * Frame numbers are 1-based and match the files in public/frames (frame_0001.webp = 1).
 *
 * Zones are named regions of the *frame* (not the viewport): the overlay layer is
 * positioned over the drawn image, so "left-middle" stays in the left negative space
 * of the shot even when a tall or ultra-wide window crops the frame.
 *
 * Scene map (from inspecting the footage):
 *   1-18    low-angle running feet, characters upper center-right  -> left-bottom free
 *   19-30   Gojo close-up, centered                                -> left-middle free
 *   29-37   standoff (Gojo left fg, Sukuna right bg)              -> breather, no text
 *   38-72   Gojo flung left, Sukuna lunging across the right       -> right-bottom (road) free
 *   73-103  Gojo left + Reversal Red orb center-right              -> right-top free
 *   104-117 Sukuna strike, white flash                             -> breather, no text
 *   118-141 explosion center-top, empty road below                 -> bottom band free
 *   142-148 figure emerges center                                  -> no text
 *   149-172 black                                                  -> center free
 *   173-230 "The Honored One" title card + Six Eyes                -> kept clean
 */

export type Zone =
  | 'left-top'
  | 'left-middle'
  | 'left-bottom'
  | 'center-top'
  | 'center'
  | 'center-bottom'
  | 'right-top'
  | 'right-middle'
  | 'right-bottom'
  | 'bottom-wide';

export type Align = 'left' | 'center' | 'right';

/** Accent used for *emphasised* words, the kicker rule and the scrim tint. Taken from the footage. */
export type Accent = 'blue' | 'red' | 'violet';

export type Variant =
  /** Huge display title, visible on load and only scrubbed out. */
  | 'hero'
  /** Mid-size line set in the display face. */
  | 'quote'
  /** Very large outlined display text. */
  | 'outline'
  /** Closing statement. */
  | 'statement';

export interface Chapter {
  id: string;
  /** Short label for the navbar indicator and the side progress ticks. */
  nav: string;
  /** First frame (inclusive) where the text is on screen. */
  start: number;
  /** Last frame (inclusive). Text has fully faded out by this frame. */
  end: number;
  variant: Variant;
  kicker?: string;
  /** Each entry is revealed as its own masked line. Wrap words in *asterisks* for accent color. */
  lines: string[];
  sub?: string;
  zone: Zone;
  align: Align;
  accent: Accent;
  /** Portrait / small screens: text goes into the band above or below the frame. */
  mobile: {
    zone: 'top' | 'bottom';
    /** Horizontal focal point (0..1) while this chapter plays, so the right fighter stays in view. */
    focusX?: number;
  };
  /** Frames spent fading/sliding in and out. Defaults scale with chapter length. */
  inFrames?: number;
  outFrames?: number;
}

export const chapters: Chapter[] = [
  {
    id: 'hero',
    nav: 'Prologue',
    start: 1,
    end: 16,
    variant: 'hero',
    kicker: 'Jujutsu Kaisen · A fan tribute',
    lines: ['Gojo *vs*', 'Sukuna'],
    sub: 'The Strongest vs The King of Curses',
    zone: 'left-bottom',
    align: 'left',
    accent: 'red',
    mobile: { zone: 'bottom', focusX: 0.6 },
    outFrames: 7,
  },
  {
    id: 'gojo',
    nav: 'The Strongest',
    start: 19,
    end: 31,
    variant: 'quote',
    kicker: 'I — Satoru Gojo',
    lines: ['Throughout Heaven and Earth,', 'I alone am the *honored one.*'],
    zone: 'left-middle',
    align: 'left',
    accent: 'blue',
    mobile: { zone: 'top', focusX: 0.58 },
    inFrames: 4,
    outFrames: 3,
  },
  {
    id: 'sukuna',
    nav: 'King of Curses',
    start: 41,
    end: 72,
    variant: 'quote',
    kicker: 'II — Ryomen Sukuna',
    lines: ['Know your place,', '*fool.*'],
    sub: 'The King of Curses has returned.',
    zone: 'right-bottom',
    align: 'right',
    accent: 'red',
    mobile: { zone: 'bottom', focusX: 0.66 },
  },
  {
    id: 'red',
    nav: 'Reversal',
    start: 77,
    end: 103,
    variant: 'quote',
    kicker: 'III — Cursed Technique',
    lines: ['Reversal: *Red.*'],
    zone: 'right-top',
    align: 'right',
    accent: 'red',
    mobile: { zone: 'top', focusX: 0.55 },
  },
  {
    id: 'clash',
    nav: 'The Clash',
    start: 119,
    end: 141,
    variant: 'outline',
    kicker: 'IV — The Clash',
    lines: ['No holding back'],
    zone: 'bottom-wide',
    align: 'center',
    accent: 'violet',
    mobile: { zone: 'bottom', focusX: 0.5 },
  },
  {
    id: 'finale',
    nav: 'Honored One',
    start: 150,
    end: 172,
    variant: 'statement',
    kicker: 'V — The Honored One',
    lines: ['The strongest of today', '*vs* the strongest in history.'],
    sub: 'Only one walks away.',
    zone: 'center',
    align: 'center',
    accent: 'blue',
    mobile: { zone: 'bottom', focusX: 0.5 },
    outFrames: 4,
  },
];

/**
 * Zone geometry: the free rectangle for each named zone, in normalised frame
 * coordinates (0..1, origin top-left of the picture, letterbox bars already cropped). Text is laid out inside
 * the box: the row (top/middle/bottom) sets vertical alignment, the chapter's
 * `align` sets horizontal alignment. Run the site with `?debug` to see the boxes.
 */
export interface ZoneBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const zones: Record<Zone, ZoneBox> = {
  'left-top': { x0: 0.03, x1: 0.36, y0: 0.06, y1: 0.42 },
  'left-middle': { x0: 0.03, x1: 0.33, y0: 0.12, y1: 0.88 },
  'left-bottom': { x0: 0.03, x1: 0.5, y0: 0.45, y1: 0.95 },
  'center-top': { x0: 0.25, x1: 0.75, y0: 0.05, y1: 0.32 },
  center: { x0: 0.12, x1: 0.88, y0: 0.15, y1: 0.85 },
  'center-bottom': { x0: 0.2, x1: 0.8, y0: 0.62, y1: 0.95 },
  'right-top': { x0: 0.55, x1: 0.97, y0: 0.04, y1: 0.24 },
  'right-middle': { x0: 0.66, x1: 0.97, y0: 0.15, y1: 0.85 },
  'right-bottom': { x0: 0.5, x1: 0.97, y0: 0.66, y1: 0.95 },
  'bottom-wide': { x0: 0.03, x1: 0.97, y0: 0.64, y1: 0.97 },
};

/**
 * Pacing: how much scroll distance each frame range gets, relative to 1.
 * Short shots that carry text (Gojo's close-up is only 12 frames) get a higher
 * weight so the line is readable; fast action can run a little quicker.
 * Frames not covered here use weight 1.
 */
export interface PacingRange {
  from: number;
  to: number;
  weight: number;
}

export const pacing: PacingRange[] = [
  { from: 1, to: 18, weight: 1.6 },
  { from: 19, to: 31, weight: 3.2 },
  { from: 40, to: 103, weight: 1.1 },
  { from: 104, to: 117, weight: 0.9 },
  { from: 118, to: 141, weight: 1.2 },
  { from: 142, to: 149, weight: 0.8 },
  { from: 150, to: 172, weight: 1.5 },
  { from: 173, to: 230, weight: 0.9 },
];
