"use client";

/**
 * What the selected head is doing, in numbers.
 *
 * Definitions sit behind a disclosure rather than in a separate glossary:
 * most visitors have never met "focus entropy", and the moment they want to
 * know is the moment they are looking at its value. Nobody should have to go
 * somewhere else and come back.
 */

import { useState } from "react";
import { formatMetric, METRICS, type ShadeKey } from "@/lib/metrics";
import type { HeadMetrics } from "@/lib/types";

interface MetricsPanelProps {
  metrics: HeadMetrics | null;
  layer: number;
  head: number;
  hasCls: boolean;
  /**
   * Highlights the row currently colouring the index. Accepts the role-shading
   * key too, which simply matches no row, shading by family highlights
   * nothing here, which is correct.
   */
  activeMetric: ShadeKey;
}

const SECONDARY: { key: keyof HeadMetrics; label: string }[] = [
  { key: "confidence_max", label: "Largest single weight" },
  { key: "focus_entropy", label: "Focus, unscaled" },
  { key: "distribution_q25", label: "Lower quartile" },
  { key: "distribution_median", label: "Median weight" },
  { key: "distribution_q75", label: "Upper quartile" },
];

export default function MetricsPanel({
  metrics,
  layer,
  head,
  hasCls,
  activeMetric,
}: MetricsPanelProps) {
  const [openDefinitions, setOpenDefinitions] = useState(false);

  if (!metrics) {
    return (
      <p className="text-sm text-muted">
        No measurements came back for layer {layer}, head {head}.
      </p>
    );
  }

  return (
    <div>
      <dl className="space-y-1">
        {METRICS.map((metric) => {
          const value = metrics[metric.key];
          const undefinedHere = value === null;
          const active = metric.key === activeMetric;
          return (
            <div
              key={metric.key}
              className={`flex items-baseline justify-between gap-4 rounded-lg px-3 py-2 ${
                active ? "bg-brand-soft" : ""
              }`}
            >
              <dt
                className={`text-sm ${active ? "font-medium text-brand-active" : "text-muted"}`}
              >
                {metric.label}
              </dt>
              <dd
                className={`tabular text-sm ${
                  undefinedHere
                    ? "text-faint"
                    : active
                      ? "font-medium text-brand-active"
                      : "font-medium text-ink"
                }`}
              >
                {formatMetric(value)}
              </dd>
            </div>
          );
        })}
      </dl>

      {!hasCls && (
        <p className="mt-3 rounded-lg bg-canvas p-3 text-[13px] leading-relaxed text-muted ring-1 ring-line">
          <span className="tabular text-ink">N/A</span> is not zero.
          Summary-token pull measures attention landing on{" "}
          <span className="font-mono text-[0.9em]">[CLS]</span>, and this model
          has no such token, so the quantity does not exist here. Reporting it as
          zero would claim the head ignores a token that was never in the
          sentence.
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpenDefinitions((open) => !open)}
        aria-expanded={openDefinitions}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-brand-active transition-colors hover:bg-brand-soft"
      >
        <span aria-hidden="true" className="text-base leading-none">
          {openDefinitions ? "−" : "+"}
        </span>
        {openDefinitions ? "Hide definitions" : "What these mean"}
      </button>

      {openDefinitions && (
        <div className="mt-3 space-y-4 px-3">
          {METRICS.map((metric) => (
            <div key={metric.key}>
              <p className="text-[13px] font-semibold text-ink">{metric.label}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {metric.detail}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed font-medium text-ink">
                {metric.direction}
              </p>
            </div>
          ))}

          <div className="border-t border-line pt-3">
            <p className="field-label mb-2">Also measured</p>
            <dl className="space-y-1.5">
              {SECONDARY.map(({ key, label }) => (
                <div key={key} className="flex items-baseline justify-between gap-4">
                  <dt className="text-[13px] text-muted">{label}</dt>
                  <dd className="tabular text-[13px] text-ink">
                    {formatMetric(metrics[key])}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
