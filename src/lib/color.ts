/**
 * Colour scales.
 *
 * Two ramps, deliberately different, because they answer different questions.
 *
 * MAGMA, the attention matrix. Perceptually uniform and monotonic in
 * lightness, so equal steps in weight look like equal steps in colour and the
 * scale survives greyscale printing and colour-vision deficiency. A rainbow
 * ramp (jet, turbo) has non-monotonic lightness: it invents banding where the
 * data is smooth and flattens real differences elsewhere. In a tool whose
 * whole purpose is reading magnitude off colour, that is a wrong answer, not
 * a taste difference. Magma's near-black low end earns its place too:
 * attention is sparse, so the many near-zero cells sink into a dark field and
 * the few genuine spikes are what the eye lands on.
 *
 * INDIGO, the layer x head index. Single-hue and quiet, because that grid is
 * navigation furniture surrounding the heatmap, not a second hero. Keeping it
 * monochrome means the page has exactly one chromatic surface, so "colourful"
 * always means "attention weight" and never anything else.
 */

type RGB = [number, number, number];

/**
 * Magma anchors, evenly spaced across [0, 1], from matplotlib's magma.
 * Ten stops with linear interpolation between them tracks the true ramp
 * closely, because magma is near-linear at this spacing.
 */
const MAGMA_STOPS: RGB[] = [
  [0, 0, 4],
  [24, 15, 61],
  [69, 16, 119],
  [114, 31, 129],
  [159, 47, 127],
  [205, 64, 113],
  [241, 96, 93],
  [253, 150, 104],
  [254, 202, 141],
  [252, 253, 191],
];

/** Single-hue indigo, hand-picked for roughly even lightness steps. */
const INDIGO_STOPS: RGB[] = [
  [239, 241, 245],
  [195, 203, 221],
  [142, 154, 184],
  [90, 104, 144],
  [46, 56, 97],
];

function interpolate(stops: RGB[], t: number): RGB {
  if (!Number.isFinite(t)) return stops[0];
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/** 256-entry lookup tables: the heatmap asks for a colour ~10,000 times a paint. */
function buildLut(stops: RGB[]): RGB[] {
  return Array.from({ length: 256 }, (_, i) => interpolate(stops, i / 255));
}

const MAGMA_LUT = buildLut(MAGMA_STOPS);
const INDIGO_LUT = buildLut(INDIGO_STOPS);

function lookup(lut: RGB[], t: number): RGB {
  if (!Number.isFinite(t)) return lut[0];
  const i = Math.round(Math.min(1, Math.max(0, t)) * 255);
  return lut[i];
}

export function magma(t: number): RGB {
  return lookup(MAGMA_LUT, t);
}

export function indigo(t: number): RGB {
  return lookup(INDIGO_LUT, t);
}

export function rgbCss([r, g, b]: RGB): string {
  return `rgb(${r} ${g} ${b})`;
}

/**
 * Diverging scale for the bias ratios, which are centred on 1.0 rather than
 * on zero: 1.0 means a head gives flagged words exactly the share an even
 * spread would. That midpoint is the whole point of the measure, so it needs a
 * neutral, with one hue for "less than expected" and another for "more" -
 * a sequential ramp would hide it inside a gradient and imply that low values
 * are simply "less of the same thing".
 *
 * Poles are the two ends of the validated family palette; the midpoint is a
 * neutral grey, never a hue.
 *
 * @param ratio the value
 * @param spread how far from 1.0 counts as the full end of the scale
 */
export function divergingCss(ratio: number | null, spread = 1.5): string {
  if (ratio === null || !Number.isFinite(ratio)) return "#e2e8f0";
  const t = Math.max(-1, Math.min(1, (ratio - 1) / spread));
  const mid: RGB = [226, 232, 240];
  const pole: RGB = t >= 0 ? [213, 94, 0] : [0, 114, 178];
  const k = Math.abs(t);
  return rgbCss([
    Math.round(mid[0] + (pole[0] - mid[0]) * k),
    Math.round(mid[1] + (pole[1] - mid[1]) * k),
    Math.round(mid[2] + (pole[2] - mid[2]) * k),
  ]);
}

export function magmaCss(t: number): string {
  return rgbCss(magma(t));
}

export function indigoCss(t: number): string {
  return rgbCss(indigo(t));
}

/**
 * Pick ink or paper for text sitting on a ramp colour, by relative luminance.
 * The 0.45 threshold is tuned against magma's mid-range, where a naive 0.5
 * flips to dark text a little too early.
 */
export function readableOn([r, g, b]: RGB): string {
  const srgb = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  return luminance > 0.45 ? "#14161B" : "#F8F9FB";
}

/** CSS gradient string for legends, sampled from the same LUT the canvas uses. */
export function rampGradient(kind: "magma" | "indigo", steps = 12): string {
  const fn = kind === "magma" ? magma : indigo;
  const stops = Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    return `${rgbCss(fn(t))} ${(t * 100).toFixed(1)}%`;
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/**
 * Interface colours the canvas needs by value, mirroring the CSS theme.
 * The heatmap sits inside a white card, so `surface` is its ground and the
 * causal mask is drawn as that same white under a slate hatch, the mask
 * reads as card showing through rather than as a cell with a value.
 */
export const PALETTE = {
  canvas: "#F0F4F8",
  surface: "#FFFFFF",
  line: "#E2E8F0",
  lineStrong: "#CBD5E1",
  ink: "#1E293B",
  muted: "#64748B",
  faint: "#94A3B8",
  /** The dashboard's pink. Interface only, it never touches the matrix. */
  brand: "#FF5CA9",
  /**
   * Annotations drawn ON the matrix, such as the sentence-pair boundary.
   * Blue and not the brand pink on purpose: magma runs black → purple →
   * magenta → orange → cream, so a pink line sits close to real values near
   * the middle of the scale, while nothing in magma is ever this blue. The
   * mark can therefore never be read as a weight.
   */
  mark: "#3B82F6",
} as const;
