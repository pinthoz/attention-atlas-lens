"use client";

/**
 * Does the model's output actually depend on the heads that watch the flagged
 * words?
 *
 * This is the check that keeps the rest of the page honest. Everything else
 * here reads attention, and attention is only evidence: a head can point
 * straight at a stereotype and still contribute nothing, because the value it
 * writes is ignored downstream. Removing the head and measuring what changes
 * is the test that tells the two apart.
 *
 * Run on demand, never automatically: it costs a forward pass per head on top
 * of the bias analysis, and nobody should pay that for every sentence they
 * type.
 */

import IgCorrelations from "@/components/IgCorrelations";
import type { AblatedHead, FaithfulnessResponse } from "@/lib/types";

interface FaithfulnessProps {
  result: FaithfulnessResponse | null;
  busy: boolean;
  error: string | null;
  elapsed: number;
  available: boolean;
  onRun: () => void;
  layer: number;
  head: number;
  onSelectHead: (layer: number, head: number) => void;
}

function fmt(value: number | null, digits = 4): string {
  return typeof value === "number" ? value.toFixed(digits) : "-";
}

export default function Faithfulness({
  result,
  busy,
  error,
  elapsed,
  available,
  onRun,
  layer,
  head,
  onSelectHead,
}: FaithfulnessProps) {
  const heads = result?.heads ?? [];
  const maxImpact = heads.reduce(
    (acc, h) => Math.max(acc, h.representation_impact ?? 0),
    0,
  );

  // The comparison the whole card exists to make: the head that LOOKS at the
  // flagged words most, against the head that MATTERS most.
  let topByAttention: AblatedHead | null = null;
  for (const h of heads) {
    if (
      !topByAttention ||
      (h.bias_attention_ratio ?? 0) > (topByAttention.bias_attention_ratio ?? 0)
    ) {
      topByAttention = h;
    }
  }
  const topByImpact = heads[0] ?? null;
  const agree =
    topByAttention &&
    topByImpact &&
    topByAttention.layer === topByImpact.layer &&
    topByAttention.head === topByImpact.head;

  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="card-title">Does it actually matter?</h2>
        {result && (
          <span className="tabular text-xs text-faint">
            {result.ablation_mode} ablation
          </span>
        )}
      </div>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
        Attention shows where a head looks, not whether the model listens. This
        removes each of the most bias-focused heads in turn and measures how far
        the model&apos;s representation moves without it.
      </p>

      {!result && !busy && (
        <div className="mt-4">
          <button
            type="button"
            onClick={onRun}
            disabled={!available}
            className="pill bg-brand px-5 py-2 text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-line-strong"
          >
            Run the test
          </button>
          <p className="mt-2 text-xs leading-snug text-faint">
            {available
              ? "One forward pass per head, so this runs only when asked."
              : "Needs a sentence with flagged words, the test removes the heads that watch them."}
          </p>
        </div>
      )}

      {busy && (
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          Removing each head and re-running the model.{" "}
          <span className="tabular text-faint">{elapsed}s</span>
        </p>
      )}

      {error && !busy && (
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink">{error}</p>
      )}

      {result && !busy && heads.length === 0 && (
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          Nothing was flagged in this sentence, so there were no bias-focused
          heads to remove.
        </p>
      )}

      {heads.length > 0 && (
        <>
          {topByAttention && topByImpact && (
            <p className="mt-4 rounded-lg bg-canvas p-3 text-[13px] leading-relaxed text-ink ring-1 ring-line">
              {agree ? (
                <>
                  The head that watches the flagged words most -{" "}
                  <span className="font-mono">
                    L{topByAttention.layer}·H{topByAttention.head}
                  </span>{" "}
                 , is also the one the model depends on most here. Attention
                  and influence point the same way.
                </>
              ) : (
                <>
                  The head that watches the flagged words most is{" "}
                  <span className="font-mono">
                    L{topByAttention.layer}·H{topByAttention.head}
                  </span>
                  , but removing{" "}
                  <span className="font-mono">
                    L{topByImpact.layer}·H{topByImpact.head}
                  </span>{" "}
                  changes the model more. Where a head looks and what it
                  contributes are not the same thing.
                </>
              )}
            </p>
          )}

          <table className="mt-4 w-full">
            <caption className="sr-only">
              Heads ranked by how much removing them changes the model
            </caption>
            <thead>
              <tr className="border-b border-line">
                <th className="pb-2 text-left text-xs font-medium text-muted">Head</th>
                <th className="pb-2 text-left text-xs font-medium text-muted">
                  Change when removed
                </th>
                <th className="pb-2 text-right text-xs font-medium text-muted">
                  Watches flagged
                </th>
              </tr>
            </thead>
            <tbody>
              {heads.map((h) => {
                const impact = h.representation_impact ?? 0;
                const selected = h.layer === layer && h.head === head;
                return (
                  <tr key={`${h.layer}-${h.head}`}>
                    <td className="py-1">
                      <button
                        type="button"
                        onClick={() => onSelectHead(h.layer, h.head)}
                        className={`rounded px-1.5 py-0.5 font-mono text-[13px] transition-colors hover:bg-canvas ${
                          selected ? "bg-brand-soft text-brand-active" : "text-ink"
                        }`}
                      >
                        L{h.layer}·H{h.head}
                      </button>
                    </td>
                    <td className="py-1">
                      <span className="flex items-center gap-2">
                        <span className="relative h-3.5 flex-1 overflow-hidden rounded-[4px] bg-canvas">
                          <span
                            className="absolute inset-y-0 left-0 rounded-[4px] bg-[#5A6890]"
                            style={{
                              width: `${maxImpact > 0 ? (impact / maxImpact) * 100 : 0}%`,
                            }}
                          />
                        </span>
                        <span className="tabular w-16 shrink-0 text-right text-xs text-ink">
                          {fmt(impact)}
                        </span>
                      </span>
                    </td>
                    <td className="tabular py-1 text-right text-xs text-muted">
                      {fmt(h.bias_attention_ratio, 2)}×
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 space-y-2 border-t border-line pt-3">
            <p className="text-xs leading-relaxed text-faint">
              The numbers are small because heads are largely redundant, the
              model routes around a missing one. Read them against each other,
              as a ranking, not as a share of the model&apos;s behaviour.
            </p>
            <p className="text-xs leading-relaxed text-faint">
              Zero-ablation replaces a head&apos;s output with zeros, which puts
              the network somewhere it never saw in training and tends to
              overstate the damage. It is the mode the published thresholds were
              calibrated on, which is why it is used here.
            </p>
          </div>

          {result?.ig && (
            <IgCorrelations
              ig={result.ig}
              layer={layer}
              head={head}
              onSelectHead={onSelectHead}
            />
          )}
        </>
      )}
    </section>
  );
}
