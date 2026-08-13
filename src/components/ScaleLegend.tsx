"use client";

/**
 * The heatmap's key.
 *
 * The masked swatch is here for a reason that matters: a causal model returns
 * exactly 0.0 for cells it cannot see, the same number a real zero would
 * carry. Colour alone could never tell them apart, so masked cells are drawn
 * with a texture no value can have, and the legend says which is which in
 * words.
 */

import { rampGradient } from "@/lib/color";

interface ScaleLegendProps {
  max: number;
  isCausal: boolean;
  hasSegments: boolean;
}

export default function ScaleLegend({
  max,
  isCausal,
  hasSegments,
}: ScaleLegendProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex min-w-[180px] max-w-md flex-1 items-center gap-2.5">
        <span className="tabular text-[11px] text-graphite">0</span>
        <div
          className="h-2.5 flex-1 rounded-[1px]"
          style={{ background: rampGradient("magma") }}
        />
        <span className="tabular text-[11px] text-graphite">{max.toFixed(3)}</span>
      </div>

      {isCausal && (
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3.5 w-3.5 shrink-0 rounded-[1px] border border-rule"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, #d8dce4 0 1px, #eef0f4 1px 4px)",
            }}
            aria-hidden="true"
          />
          <span className="text-[12px] text-graphite">
            Cannot look ahead — not a weight of zero
          </span>
        </div>
      )}

      {hasSegments && (
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3.5 w-[2px] shrink-0 bg-[#cd4071]"
            aria-hidden="true"
          />
          <span className="text-[12px] text-graphite">
            Where the second sentence begins
          </span>
        </div>
      )}
    </div>
  );
}
