"use client";

/**
 * Where in the model the flagged words draw attention.
 *
 * The bias card gives one head's ratio; this gives the shape of the whole
 * stack, which is the question that follows immediately after ("is this one
 * odd head, or does the model do it throughout?").
 *
 * The reference line at 1.0 is not decoration. The ratio is centred there -
 * 1.0 is the share an even spread would give the flagged words, so a chart
 * baselined at zero would make every layer look like it attends to bias, when
 * the interesting reading is which side of 1.0 it falls on. The fill is drawn
 * FROM that line, in two hues, for the same reason.
 */

import type { BiasPropagation } from "@/lib/types";

interface BiasDepthProps {
  propagation: BiasPropagation;
  barThreshold: number;
  layer: number;
  onSelectLayer: (layer: number) => void;
}

const W = 320;
const H = 150;
const PAD_L = 34;
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 22;

const ABOVE = "#D55E00";
const BELOW = "#0072B2";

export default function BiasDepth({
  propagation,
  barThreshold,
  layer,
  onSelectLayer,
}: BiasDepthProps) {
  const values = propagation.layer_propagation ?? [];
  if (values.length < 2) return null;

  // The domain always contains 1.0, so the reference line is always on screen
  // even when every layer sits on one side of it.
  const lo = Math.min(1, ...values);
  const hi = Math.max(1, ...values);
  const pad = (hi - lo) * 0.15 || 0.1;
  const yMin = lo - pad;
  const yMax = hi + pad;

  const n = values.length;
  const px = (i: number) => PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R);
  const py = (v: number) =>
    PAD_T + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD_T - PAD_B);

  const baseline = py(1);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${px(i)},${py(v)}`).join("");
  const area = `${line}L${px(n - 1)},${baseline}L${px(0)},${baseline}Z`;

  const peak = propagation.peak_layer;
  const anyAbove = values.some((v) => v > 1);

  return (
    // Usually the shorter of the pair it sits beside, so it fills the row's
    // height and drops its closing note to the bottom edge.
    <section className="card card-fill">
      <h2 className="card-title">Bias focus through the layers</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        How much attention the flagged words draw at each depth, against what an
        even spread would give them.
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 w-full"
        role="img"
        aria-label={`Bias attention ratio for each of ${n} layers. Pattern: ${propagation.propagation_pattern}.`}
      >
        <defs>
          {/* Clipped either side of the reference line, so the fill colour
              always states which side of "no preference" the layer is on. */}
          <clipPath id="bias-above">
            <rect x="0" y="0" width={W} height={baseline} />
          </clipPath>
          <clipPath id="bias-below">
            <rect x="0" y={baseline} width={W} height={H - baseline} />
          </clipPath>
        </defs>

        <path d={area} fill={ABOVE} opacity="0.18" clipPath="url(#bias-above)" />
        <path d={area} fill={BELOW} opacity="0.18" clipPath="url(#bias-below)" />

        <line
          x1={PAD_L}
          y1={baseline}
          x2={W - PAD_R}
          y2={baseline}
          stroke="#94a3b8"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <text x={0} y={baseline + 3} className="fill-[#64748b] text-[9px]">
          1.0×
        </text>

        <path d={line} fill="none" stroke="#475569" strokeWidth="2" />

        {values.map((v, i) => (
          <g key={i}>
            <circle
              cx={px(i)}
              cy={py(v)}
              r={i === layer ? 4.5 : 2.5}
              fill={i === layer ? "#1e293b" : v > 1 ? ABOVE : BELOW}
              stroke="#ffffff"
              strokeWidth="1.5"
            />
            <rect
              x={px(i) - 10}
              y={PAD_T}
              width={20}
              height={H - PAD_T - PAD_B}
              fill="transparent"
              className="cursor-pointer"
              onClick={() => onSelectLayer(i)}
            >
              <title>{`Layer ${i}: ${v.toFixed(2)}× ${
                v > 1 ? "more" : "less"
              } than an even spread`}</title>
            </rect>
          </g>
        ))}

        {/* Every layer gets a tick, so a point can be read back to a layer
            without counting along the line. */}
        {values.map((_, i) => (
          <g key={`tick-${i}`}>
            <line
              x1={px(i)}
              y1={H - PAD_B}
              x2={px(i)}
              y2={H - PAD_B + 3}
              stroke="#cbd5e1"
              strokeWidth="1"
            />
            {(n <= 16 || i % 2 === 0) && (
              <text
                x={px(i)}
                y={H - PAD_B + 12}
                textAnchor="middle"
                className={
                  i === layer
                    ? "fill-[#1e293b] text-[9px] font-medium"
                    : "fill-[#94a3b8] text-[9px]"
                }
              >
                {i}
              </text>
            )}
          </g>
        ))}
        <text x={0} y={H - PAD_B + 12} className="fill-[#94a3b8] text-[8px]">
          layer
        </text>
      </svg>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-3">
        <div className="flex items-baseline gap-2">
          <dt className="text-xs text-muted">Pattern</dt>
          <dd className="text-xs font-medium text-ink">
            {propagation.propagation_pattern}
          </dd>
        </div>
        {typeof peak === "number" && (
          <div className="flex items-baseline gap-2">
            <dt className="text-xs text-muted">Peaks at</dt>
            <dd className="tabular text-xs font-medium text-ink">layer {peak}</dd>
          </div>
        )}
        {typeof propagation.avg_bias_ratio === "number" && (
          <div className="flex items-baseline gap-2">
            <dt className="text-xs text-muted">Average</dt>
            <dd className="tabular text-xs font-medium text-ink">
              {propagation.avg_bias_ratio.toFixed(2)}×
            </dd>
          </div>
        )}
      </dl>

      {/* Each point is a layer AVERAGE. Saying so matters: individual heads
          routinely sit above 1.0× inside a layer whose mean is below it, and
          the head panel next door will be showing exactly that. */}
      <p className="mt-auto pt-2 text-xs leading-snug text-faint">
        Each point averages the heads in that layer, so a single head can sit
        well above a layer that averages below.{" "}
        {anyAbove
          ? `Above 1.0× the flagged words get more than their share; ${barThreshold}× is where it stops looking like chance.`
          : "No layer averages above 1.0× here."}
      </p>
    </section>
  );
}
