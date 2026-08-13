"use client";

/**
 * The layer x head index — the navigation surface for the whole page.
 *
 * Real DOM buttons rather than canvas, the opposite call from the heatmap and
 * for the opposite reason: 144 nodes costs nothing, and every cell here is a
 * genuine control that wants a label, a focus ring and a place in the tab
 * order. Tabbing through 144 stops would be hostile, so the grid uses a
 * roving tabindex: one stop to enter it, arrow keys to move inside.
 *
 * Shaded in a single-hue indigo, deliberately not the heatmap's magma. On
 * this page chromatic means "attention weight" and monochrome means "head
 * statistic", so the two grids can never be misread for each other.
 */

import { useRef } from "react";
import { indigoCss } from "@/lib/color";
import {
  metricValue,
  normalise,
  type MetricDefinition,
  type MetricRange,
} from "@/lib/metrics";
import type { HeadMetrics } from "@/lib/types";

interface HeadIndexProps {
  grid: (HeadMetrics | null)[][];
  metric: MetricDefinition;
  range: MetricRange;
  layer: number;
  head: number;
  onSelect: (layer: number, head: number) => void;
}

export default function HeadIndex({
  grid,
  metric,
  range,
  layer,
  head,
  onSelect,
}: HeadIndexProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const nLayers = grid.length;
  const nHeads = grid[0]?.length ?? 0;

  function move(dLayer: number, dHead: number) {
    const nextLayer = Math.min(nLayers - 1, Math.max(0, layer + dLayer));
    const nextHead = Math.min(nHeads - 1, Math.max(0, head + dHead));
    onSelect(nextLayer, nextHead);
    // The newly selected button is the only tabbable one, so move focus with it.
    requestAnimationFrame(() => {
      wrapRef.current
        ?.querySelector<HTMLButtonElement>(`[data-cell="${nextLayer}-${nextHead}"]`)
        ?.focus();
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const delta = moves[event.key];
    if (!delta) return;
    event.preventDefault();
    move(delta[0], delta[1]);
  }

  return (
    <div>
      {/* When the measure does not apply, the shading goes away but the grid
          does not: it is the only way to reach another head, and taking the
          navigation away would strand anyone who picked this measure. */}
      {!range.defined && (
        <div className="mb-3 border-l-2 border-rule-strong pl-3">
          <p className="text-[13px] leading-relaxed text-graphite">
            <span className="font-medium text-ink">
              {metric.label} is not defined for this model,
            </span>{" "}
            so nothing is shaded. {metric.direction} Pick another measure, or
            switch to a BERT model. The heads below still work.
          </p>
        </div>
      )}
      <div className="flex gap-1.5">
        {/* Layer numbers run down the side: the axis you scan when hunting for
            where in the stack a behaviour appears. */}
        <div
          className="tabular grid w-4 shrink-0 gap-px text-[9px] leading-none text-graphite"
          style={{ gridTemplateRows: `repeat(${nLayers}, minmax(0, 1fr))` }}
          aria-hidden="true"
        >
          {grid.map((_, l) => (
            <span
              key={l}
              className={`flex items-center justify-end pr-0.5 ${
                l === layer ? "font-semibold text-ink" : ""
              }`}
            >
              {l}
            </span>
          ))}
        </div>

        <div
          ref={wrapRef}
          role="grid"
          aria-label={`Layer by head index, shaded by ${metric.label.toLowerCase()}`}
          className="grid flex-1 gap-px"
          style={{ gridTemplateColumns: `repeat(${nHeads}, minmax(0, 1fr))` }}
          onKeyDown={handleKeyDown}
        >
          {grid.map((row, l) =>
            row.map((cell, h) => {
              const value = metricValue(cell, metric.key);
              const selected = l === layer && h === head;
              return (
                <button
                  key={`${l}-${h}`}
                  type="button"
                  role="gridcell"
                  data-cell={`${l}-${h}`}
                  tabIndex={selected ? 0 : -1}
                  aria-selected={selected}
                  aria-label={`Layer ${l}, head ${h}. ${metric.label}: ${
                    value === null ? "not applicable" : value.toFixed(3)
                  }`}
                  title={`L${l} · H${h}  ${
                    value === null ? "N/A" : value.toFixed(3)
                  }`}
                  onClick={() => onSelect(l, h)}
                  className={`relative aspect-square w-full transition-[box-shadow] duration-100 hover:z-10 hover:shadow-[0_0_0_2px_#14161b] ${
                    selected ? "z-10 shadow-[0_0_0_2px_#14161b]" : ""
                  }`}
                  style={{
                    backgroundColor:
                      value === null ? "#e4e7ed" : indigoCss(normalise(value, range)),
                  }}
                />
              );
            }),
          )}
        </div>
      </div>

      {/* Head numbers along the bottom. */}
      <div
        className="tabular mt-1 ml-[1.375rem] grid gap-px text-[9px] leading-none text-graphite"
        style={{ gridTemplateColumns: `repeat(${nHeads}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {Array.from({ length: nHeads }, (_, h) => (
          <span
            key={h}
            className={`text-center ${h === head ? "font-semibold text-ink" : ""}`}
          >
            {h}
          </span>
        ))}
      </div>

      {range.defined && (
        <>
          <div className="mt-4 flex items-center gap-3">
            <span className="tabular text-[11px] text-graphite">
              {range.min.toFixed(2)}
            </span>
            <div
              className="h-2 flex-1 rounded-[1px]"
              style={{
                background: `linear-gradient(to right, ${indigoCss(0)}, ${indigoCss(
                  0.25,
                )}, ${indigoCss(0.5)}, ${indigoCss(0.75)}, ${indigoCss(1)})`,
              }}
            />
            <span className="tabular text-[11px] text-graphite">
              {range.max.toFixed(2)}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-graphite">
            Shaded against the lowest and highest value in this run, so the
            colours show which heads stand out here — not an absolute scale.
          </p>
        </>
      )}
    </div>
  );
}
