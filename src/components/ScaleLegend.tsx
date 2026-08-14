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
      <div className="flex min-w-[180px] max-w-xs flex-1 items-center gap-2.5">
        <span className="tabular text-[11px] text-faint">0</span>
        <div
          className="h-2.5 flex-1 rounded-full"
          style={{ background: rampGradient("magma") }}
        />
        <span className="tabular text-[11px] text-faint">{max.toFixed(3)}</span>
      </div>

      {isCausal && (
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 shrink-0 rounded-[4px] ring-1 ring-line"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, #cbd5e1 0 1px, #ffffff 1px 4px)",
            }}
            aria-hidden="true"
          />
          <span className="text-[12px] text-muted">
            Cannot look ahead, not a weight of zero
          </span>
        </div>
      )}

      {hasSegments && (
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-4 w-[3px] shrink-0 rounded-full bg-mark"
            aria-hidden="true"
          />
          <span className="text-[12px] text-muted">
            Where the second sentence begins
          </span>
        </div>
      )}
    </div>
  );
}
