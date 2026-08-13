/**
 * Colour scales.
 *
 * Two ramps, deliberately different, because they answer different questions.
 *
 * MAGMA — the attention matrix. Perceptually uniform and monotonic in
 * lightness, so equal steps in weight look like equal steps in colour and the
 * scale survives greyscale printing and colour-vision deficiency. A rainbow
 * ramp (jet, turbo) has non-monotonic lightness: it invents banding where the
 * data is smooth and flattens real differences elsewhere. In a tool whose
 * whole purpose is reading magnitude off colour, that is a wrong answer, not
 * a taste difference. Magma's near-black low end earns its place too:
 * attention is sparse, so the many near-zero cells sink into a dark field and
 * the few genuine spikes are what the eye lands on.
 *
 * INDIGO — the layer x head index. Single-hue and quiet, because that grid is
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

export const PALETTE = {
  paper: "#EEF0F4",
  surface: "#F8F9FB",
  ink: "#14161B",
  graphite: "#5B6272",
  rule: "#D8DCE4",
  ruleStrong: "#B9C0CD",
} as const;
