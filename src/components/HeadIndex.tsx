"use client";

/**
 * The layer x head index, the navigation surface for the whole page.
 *
 * Real DOM buttons rather than canvas, the opposite call from the heatmap and
 * for the opposite reason: 144 nodes costs nothing, and every cell here is a
 * genuine control that wants a label, a focus ring and a place in the tab
 * order. Tabbing through 144 stops would be hostile, so the grid uses a
 * roving tabindex: one stop to enter it, arrow keys to move inside.
 *
 * Shaded in a single-hue indigo, deliberately not the heatmap's magma. On this
 * page chromatic means "attention weight" and monochrome means "head
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
  /**
   * Overrides the ramp with an explicit colour per cell. Used for shading by
   * head role, where colour is categorical: it names a family and ranks
   * nothing, so the magnitude legend is suppressed with it.
   */
  colorFor?: (layer: number, head: number) => string | null;
  /** Replaces the ramp legend's caption when `colorFor` is in play. */
  caption?: string;
}

export default function HeadIndex({
  grid,
  metric,
  range,
  layer,
  head,
  onSelect,
  colorFor,
  caption,
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
      {/*
       * Explicit layer and head pickers, above the grid.
       *
       * The grid alone was not discoverable: it looks like a chart, so people
       * read it rather than clicking it, and there is nothing on screen that
       * says a cell is a control. These two selects are the obvious path; the
       * grid stays as the fast one for anybody who has worked that out.
       */}
      <div className="mb-3 flex gap-2">
        <label className="flex-1">
          <span className="field-label mb-1">Layer</span>
          <select
            value={layer}
            onChange={(e) => onSelect(Number(e.target.value), head)}
            className="field w-full px-2.5 py-1.5 text-[13px]"
          >
            {Array.from({ length: nLayers }, (_, l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          <span className="field-label mb-1">Head</span>
          <select
            value={head}
            onChange={(e) => onSelect(layer, Number(e.target.value))}
            className="field w-full px-2.5 py-1.5 text-[13px]"
          >
            {Array.from({ length: nHeads }, (_, h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* When the measure does not apply, the shading goes away but the grid
          does not: it is the only way to reach another head, and taking the
          navigation away would strand anyone who picked this measure. */}
      {!range.defined && !colorFor && (
        <div className="mb-3 rounded-lg bg-canvas p-3 ring-1 ring-line">
          <p className="text-[13px] leading-relaxed text-muted">
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
          className="tabular grid w-4 shrink-0 gap-[2px] text-[9px] leading-none text-faint"
          style={{ gridTemplateRows: `repeat(${nLayers}, minmax(0, 1fr))` }}
          aria-hidden="true"
        >
          {grid.map((_, l) => (
            <span
              key={l}
              className={`flex items-center justify-end pr-0.5 ${
                l === layer ? "font-medium text-brand-active" : ""
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
          className="grid flex-1 gap-[2px]"
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
                  className={`relative aspect-square w-full rounded-[3px] transition-shadow duration-100 hover:z-10 hover:ring-2 hover:ring-ink ${
                    selected ? "z-10 ring-2 ring-brand" : ""
                  }`}
                  style={{
                    backgroundColor:
                      // Undefined cells stay grey and clearly present: they
                      // are still targets you can click, just not shaded.
                      colorFor
                        ? (colorFor(l, h) ?? "#e2e8f0")
                        : value === null
                          ? "#e2e8f0"
                          : indigoCss(normalise(value, range)),
                  }}
                />
              );
            }),
          )}
        </div>
      </div>

      {/* Head numbers along the bottom. */}
      <div
        className="tabular mt-1.5 ml-[1.375rem] grid gap-[2px] text-[9px] leading-none text-faint"
        style={{ gridTemplateColumns: `repeat(${nHeads}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {Array.from({ length: nHeads }, (_, h) => (
          <span
            key={h}
            className={`text-center ${h === head ? "font-medium text-brand-active" : ""}`}
          >
            {h}
          </span>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-snug text-faint">
        Every cell is a head, click one, or tab into the grid and use the
        arrow keys.
      </p>

      {colorFor && caption && (
        <p className="mt-3 text-[11px] leading-snug text-faint">{caption}</p>
      )}

      {range.defined && !colorFor && (
        <>
          <div className="mt-4 flex items-center gap-3">
            <span className="tabular text-[11px] text-faint">
              {range.min.toFixed(2)}
            </span>
            <div
              className="h-2 flex-1 rounded-full"
              style={{
                background: `linear-gradient(to right, ${indigoCss(0)}, ${indigoCss(
                  0.25,
                )}, ${indigoCss(0.5)}, ${indigoCss(0.75)}, ${indigoCss(1)})`,
              }}
            />
            <span className="tabular text-[11px] text-faint">
              {range.max.toFixed(2)}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-faint">
            Shaded against the lowest and highest value in this run, so the
            colours show which heads stand out here, not an absolute scale.
          </p>
        </>
      )}
    </div>
  );
}
