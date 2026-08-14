"use client";

/**
 * How the selected measure moves through the depth of the model.
 *
 * The 12 x 12 index shows every head at once but makes a trend along the
 * layer axis hard to see. This is the same numbers read down one axis: the
 * mean per layer, with the band showing the spread of heads inside it, so a
 * layer whose heads disagree does not read the same as one where they agree.
 *
 * One measure, one axis. The bias ratio is deliberately NOT overlaid here on a
 * second scale: two y-axes on one frame invite reading a crossing point that
 * means nothing.
 */

import { metricValue, type MetricDefinition } from "@/lib/metrics";
import type { HeadMetrics } from "@/lib/types";

interface DepthProfileProps {
  grid: (HeadMetrics | null)[][];
  metric: MetricDefinition;
  layer: number;
  onSelectLayer: (layer: number) => void;
}

const W = 320;
const H = 130;
const PAD_L = 30;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 20;

export default function DepthProfile({
  grid,
  metric,
  layer,
  onSelectLayer,
}: DepthProfileProps) {
  const perLayer = grid.map((row) => {
    const values = row
      .map((cell) => metricValue(cell, metric.key))
      .filter((v): v is number => v !== null);
    if (values.length === 0) return null;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return { mean, min: Math.min(...values), max: Math.max(...values) };
  });

  const known = perLayer.filter((p): p is NonNullable<typeof p> => p !== null);
  if (known.length < 2) return null;

  const lo = Math.min(...known.map((p) => p.min));
  const hi = Math.max(...known.map((p) => p.max));
  const span = hi - lo || 1;
  const n = perLayer.length;

  const px = (i: number) => PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R);
  const py = (v: number) =>
    PAD_T + (1 - (v - lo) / span) * (H - PAD_T - PAD_B);

  const meanLine = perLayer
    .map((p, i) => (p ? `${i === 0 ? "M" : "L"}${px(i)},${py(p.mean)}` : ""))
    .join("");

  // Spread band: max across, then min back, closed.
  const bandTop = perLayer.map((p, i) => (p ? `${px(i)},${py(p.max)}` : "")).join(" ");
  const bandBottom = [...perLayer]
    .map((p, i) => ({ p, i }))
    .reverse()
    .map(({ p, i }) => (p ? `${px(i)},${py(p.min)}` : ""))
    .join(" ");

  return (
    <section className="card">
      <h2 className="card-title">{metric.label} through the layers</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        The average across each layer&apos;s heads, with the band covering the
        lowest and highest head in that layer. A wide band means the heads in
        that layer disagree with each other.
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 w-full"
        role="img"
        aria-label={`${metric.label} per layer, from layer 0 to layer ${n - 1}.`}
      >
        <line
          x1={PAD_L}
          y1={H - PAD_B}
          x2={W - PAD_R}
          y2={H - PAD_B}
          stroke="#e2e8f0"
          strokeWidth="1"
        />
        <text x={0} y={py(hi) + 4} className="fill-[#94a3b8] text-[9px]">
          {hi.toFixed(2)}
        </text>
        <text x={0} y={py(lo) + 4} className="fill-[#94a3b8] text-[9px]">
          {lo.toFixed(2)}
        </text>

        <polygon points={`${bandTop} ${bandBottom}`} fill="#5A6890" opacity="0.16" />
        <path d={meanLine} fill="none" stroke="#5A6890" strokeWidth="2" />

        {perLayer.map((p, i) =>
          p ? (
            <g key={i}>
              <circle
                cx={px(i)}
                cy={py(p.mean)}
                r={i === layer ? 4.5 : 2.5}
                fill={i === layer ? "#1e293b" : "#5A6890"}
                stroke="#ffffff"
                strokeWidth="1.5"
              />
              {/* Hit target well beyond the mark, per the interaction spec. */}
              <rect
                x={px(i) - 10}
                y={PAD_T}
                width={20}
                height={H - PAD_T - PAD_B}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => onSelectLayer(i)}
              >
                <title>{`Layer ${i}: mean ${p.mean.toFixed(3)}, from ${p.min.toFixed(3)} to ${p.max.toFixed(3)}`}</title>
              </rect>
            </g>
          ) : null,
        )}

        {/* Every layer gets a tick, so a point can be read back to a layer
            without counting along the line. Deep models thin the labels but
            keep the ticks. */}
        {perLayer.map((_, i) => (
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
    </section>
  );
}
