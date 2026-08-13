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
import { formatMetric, METRICS, type MetricKey } from "@/lib/metrics";
import type { HeadMetrics } from "@/lib/types";

interface MetricsPanelProps {
  metrics: HeadMetrics | null;
  layer: number;
  head: number;
  hasCls: boolean;
  /** Highlights the row currently colouring the index. */
  activeMetric: MetricKey;
}

/** The quantiles, kept together as the distribution's shape. */
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
      <p className="text-sm text-graphite">
        No measurements came back for layer {layer}, head {head}.
      </p>
    );
  }

  return (
    <div>
      <dl className="divide-y divide-rule border-y border-rule">
        {METRICS.map((metric) => {
          const value = metrics[metric.key];
          const undefinedHere = value === null;
          return (
            <div
              key={metric.key}
              className={`flex items-baseline justify-between gap-4 py-2.5 ${
                metric.key === activeMetric ? "-mx-3 bg-surface px-3" : ""
              }`}
            >
              <dt className="text-sm text-ink">
                {metric.label}
                {metric.key === activeMetric && (
                  <span className="eyebrow ml-2 align-middle">shading index</span>
                )}
              </dt>
              <dd
                className={`tabular text-sm ${
                  undefinedHere ? "text-graphite" : "font-medium text-ink"
                }`}
              >
                {formatMetric(value)}
              </dd>
            </div>
          );
        })}
      </dl>

      {!hasCls && (
        <p className="mt-3 text-[13px] leading-relaxed text-graphite">
          <span className="tabular text-ink">N/A</span> is not zero. Summary-token
          pull measures attention landing on{" "}
          <span className="font-data text-[0.9em]">[CLS]</span>, and this model
          has no such token, so the quantity does not exist here. Reporting it as
          zero would claim the head ignores a token that was never in the
          sentence.
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpenDefinitions((open) => !open)}
        aria-expanded={openDefinitions}
        className="eyebrow mt-4 inline-flex items-center gap-1.5 hover:text-ink"
      >
        <span aria-hidden="true">{openDefinitions ? "−" : "+"}</span>
        {openDefinitions ? "Hide definitions" : "What these mean"}
      </button>

      {openDefinitions && (
        <div className="mt-3 space-y-3.5">
          {METRICS.map((metric) => (
            <div key={metric.key}>
              <p className="text-[13px] font-medium text-ink">{metric.label}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-graphite">
                {metric.detail}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-graphite">
                <em className="not-italic text-ink">{metric.direction}</em>
              </p>
            </div>
          ))}

          <div className="border-t border-rule pt-3">
            <p className="eyebrow mb-2">Also measured</p>
            <dl className="space-y-1.5">
              {SECONDARY.map(({ key, label }) => (
                <div key={key} className="flex items-baseline justify-between gap-4">
                  <dt className="text-[13px] text-graphite">{label}</dt>
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
