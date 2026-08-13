/**
 * The five head measures offered as colour for the layer x head index, plus
 * the plain-language definitions shown on demand.
 *
 * The definitions are written for someone who knows what a transformer is and
 * has never met these particular quantities. Two of them are easy to describe
 * backwards, so the wording is deliberate:
 *
 *   focus_normalized is an ENTROPY. Higher means attention is spread wider,
 *   not tighter. Calling the metric "focus" and leaving it there would invite
 *   exactly the wrong reading.
 *
 *   uniformity is a STANDARD DEVIATION. Higher means the weights vary more,
 *   i.e. LESS uniform. The name says the opposite of what the number does.
 *
 * Getting these directions wrong is the whole ballgame in an interpretability
 * tool, so each definition states which way is which.
 */

import type { HeadMetrics } from "./types";

export type MetricKey =
  | "confidence_avg"
  | "focus_normalized"
  | "sparsity"
  | "uniformity"
  | "balance";

export interface MetricDefinition {
  key: MetricKey;
  /** What the control says. */
  label: string;
  /** One line under the selector: what the colour means right now. */
  summary: string;
  /** The full definition, revealed on demand. */
  detail: string;
  /** Which direction is which, stated because two of these read backwards. */
  direction: string;
  /** True when the value is a proper fraction, so it can be shown as a %. */
  isFraction: boolean;
}

export const METRICS: MetricDefinition[] = [
  {
    key: "confidence_avg",
    label: "Confidence",
    summary: "How strongly each token commits to a single other token.",
    detail:
      "For every token, take the single largest weight in its row, then average those across the sentence. A head that always dumps most of its weight on one token scores high; a head that hedges across many scores low.",
    direction: "Higher means more committed.",
    isFraction: true,
  },
  {
    key: "focus_normalized",
    label: "Focus",
    summary: "How widely attention is spread across the sentence.",
    detail:
      "The entropy of the attention weights, divided by the largest entropy the sentence could produce. Dividing matters: a causal model can only look backwards, so its ceiling is lower, and without the correction GPT-2 heads would look artificially focused when they are only masked.",
    direction:
      "Higher means spread wide; lower means concentrated. The name points the other way from the number.",
    isFraction: true,
  },
  {
    key: "sparsity",
    label: "Sparsity",
    summary: "How much of the sentence the head effectively ignores.",
    detail:
      "The share of weights falling below what an even spread would give each token. The threshold adapts to sentence length, so the value stays comparable between a short sentence and a long one.",
    direction: "Higher means more of the sentence is ignored.",
    isFraction: true,
  },
  {
    key: "uniformity",
    label: "Even spread",
    summary: "How much the individual weights vary.",
    detail:
      "The standard deviation of the weights. A head that gives every token roughly the same attention has a low value; a head where a handful of cells carry nearly everything has a high one.",
    direction:
      "Higher means LESS even, despite the usual name for this measure. Low is the uniform end.",
    isFraction: false,
  },
  {
    key: "balance",
    label: "Summary-token pull",
    summary: "How much attention lands on the sentence-summary token.",
    detail:
      "The share of all attention mass pointing at [CLS], the token BERT uses to stand for the whole sentence. Heads that route heavily to [CLS] are often parking attention rather than reading the sentence. For reference, an even spread over n tokens would give 1/n, not one half.",
    direction:
      "Only defined for models with a [CLS] token. GPT-2 has none, so the value is genuinely undefined rather than zero.",
    isFraction: true,
  },
];

export const METRIC_BY_KEY: Record<MetricKey, MetricDefinition> =
  Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<
    MetricKey,
    MetricDefinition
  >;

export function isMetricKey(value: string | null): value is MetricKey {
  return value !== null && value in METRIC_BY_KEY;
}

export function metricValue(
  metrics: HeadMetrics | null | undefined,
  key: MetricKey,
): number | null {
  const value = metrics?.[key];
  return typeof value === "number" ? value : null;
}

export interface MetricRange {
  min: number;
  max: number;
  /** False when no head produced a value — e.g. `balance` on GPT-2. */
  defined: boolean;
}

/**
 * Range of a metric across every head in this run.
 *
 * The index is shaded relative to this run, not to some absolute scale,
 * because the interesting signal is which heads stand out from their
 * neighbours. The legend says so out loud — a reader who thinks the scale is
 * absolute would draw conclusions the colours do not support.
 */
export function metricRange(
  grid: (HeadMetrics | null)[][],
  key: MetricKey,
): MetricRange {
  let min = Infinity;
  let max = -Infinity;
  for (const layer of grid) {
    for (const head of layer) {
      const value = metricValue(head, key);
      if (value === null) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  if (min === Infinity) return { min: 0, max: 0, defined: false };
  return { min, max, defined: true };
}

/** Position of a value within the run's range, for the colour ramp. */
export function normalise(value: number, range: MetricRange): number {
  if (!range.defined) return 0;
  const span = range.max - range.min;
  return span === 0 ? 0.5 : (value - range.min) / span;
}

/** Fixed decimals so digits line up down a column of tabular figures. */
export function formatMetric(value: number | null, decimals = 3): string {
  return value === null ? "N/A" : value.toFixed(decimals);
}
