"use client";

/**
 * The second faithfulness signal: does a head attend to the tokens the
 * gradient says the decision actually rests on?
 *
 * Ablation asks whether removing a head changes the output. This asks a
 * different question of the same heads, and the two can disagree, which is
 * why both are here.
 *
 * Three caveats are not optional garnish; the pipeline's own docstrings
 * require them, and each one changes what the numbers may be used for:
 *
 *   1. SIGNIFICANCE USES q, NEVER p. One test runs per head across ~144
 *      heads, so about seven raw p < 0.05 hits are expected from noise alone.
 *      The q value is the Benjamini-Hochberg FDR adjustment.
 *   2. THE TARGET MATTERS. Gradients only mean something relative to a
 *      decision. "pooled-norm" is a geometric fallback and does NOT validate
 *      the bias explanations; only "gusnet-bias-logits" does.
 *   3. CONVERGENCE. Above roughly 0.05 relative error the path integral has
 *      not converged and every correlation below it is approximate.
 */

import { divergingCss } from "@/lib/color";
import type { IgResult } from "@/lib/types";

interface IgCorrelationsProps {
  ig: IgResult;
  layer: number;
  head: number;
  onSelectHead: (layer: number, head: number) => void;
}

const Q_THRESHOLD = 0.05;
const CONVERGENCE_LIMIT = 0.05;
const MAX_ROWS = 10;

export default function IgCorrelations({
  ig,
  layer,
  head,
  onSelectHead,
}: IgCorrelationsProps) {
  if (!ig.available) {
    return (
      <div className="mt-6 border-t border-line pt-5">
        <h3 className="text-sm font-semibold text-ink">
          Attention against gradient attribution
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          This part of the test did not run{ig.reason ? `: ${ig.reason}` : "."} The
          ablation results above are unaffected.
        </p>
      </div>
    );
  }

  const rows = (ig.correlations ?? []).slice(0, MAX_ROWS);
  if (rows.length === 0) return null;

  const significant = (ig.correlations ?? []).filter(
    (c) => c.spearman_qvalue !== null && c.spearman_qvalue < Q_THRESHOLD,
  ).length;
  const total = (ig.correlations ?? []).length;

  const validatesBias = ig.target === "gusnet-bias-logits";
  const converged =
    typeof ig.convergence_delta === "number" &&
    ig.convergence_delta <= CONVERGENCE_LIMIT;

  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold text-ink">
          Attention against gradient attribution
        </h3>
        <span className="tabular text-xs text-faint">
          {ig.target ?? "unknown"} target
        </span>
      </div>
      <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
        Integrated Gradients ranks the tokens the decision really rests on. This
        is how closely each head&apos;s attention agrees with that ranking.
      </p>

      {/* The target caveat, first, because it governs what the table below is
          allowed to be used for. */}
      {!validatesBias && (
        <p className="mt-3 rounded-lg bg-canvas p-3 text-[13px] leading-relaxed text-ink ring-1 ring-line">
          The gradients here explain the model&apos;s pooled representation, not
          the bias detector&apos;s own evidence. That fallback is used because
          the attention comes from a plain encoder while the detector is a
          separate fine-tuned model, and mixing the two would attribute one
          model&apos;s decision to another model&apos;s attention. These
          correlations therefore say nothing about whether the bias reading is
          faithful. Run a GUS-Net model to get that.
        </p>
      )}

      {!converged && typeof ig.convergence_delta === "number" && (
        <p className="mt-3 rounded-lg bg-canvas p-3 text-[13px] leading-relaxed text-ink ring-1 ring-line">
          The attribution integral did not converge (relative error{" "}
          <span className="tabular">{ig.convergence_delta.toFixed(3)}</span>,
          above {CONVERGENCE_LIMIT}). Read every correlation below as
          approximate.
        </p>
      )}

      <p className="mt-3 text-[13px] leading-relaxed text-ink">
        <span className="tabular font-medium">
          {significant} of {total}
        </span>{" "}
        heads agree with the gradient more than chance explains, after
        correcting for having tested every head.
      </p>

      <table className="mt-3 w-full">
        <caption className="sr-only">
          Heads ranked by agreement between attention and attribution
        </caption>
        <thead>
          <tr className="border-b border-line">
            <th className="pb-2 text-left text-xs font-medium text-muted">Head</th>
            <th className="pb-2 text-left text-xs font-medium text-muted">
              Agreement
            </th>
            <th className="pb-2 text-right text-xs font-medium text-muted">q</th>
            <th className="pb-2 text-right text-xs font-medium text-muted">BAR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const rho = c.spearman_rho ?? 0;
            const q = c.spearman_qvalue;
            const sig = q !== null && q < Q_THRESHOLD;
            const selected = c.layer === layer && c.head === head;
            return (
              <tr key={`${c.layer}-${c.head}`}>
                <td className="py-1">
                  <button
                    type="button"
                    onClick={() => onSelectHead(c.layer, c.head)}
                    className={`rounded px-1.5 py-0.5 font-mono text-[13px] transition-colors hover:bg-canvas ${
                      selected ? "bg-brand-soft text-brand-active" : "text-ink"
                    }`}
                  >
                    L{c.layer}·H{c.head}
                  </button>
                </td>
                <td className="py-1">
                  {/* Diverging from zero: rho runs -1 to 1 and a negative
                      correlation is a real finding, not a small positive one. */}
                  <span className="flex items-center gap-2">
                    <span className="relative h-3.5 flex-1 rounded-[4px] bg-canvas">
                      <span
                        aria-hidden="true"
                        className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-line-strong"
                      />
                      <span
                        className="absolute top-0 bottom-0 rounded-[4px]"
                        style={{
                          width: `${(Math.min(Math.abs(rho), 1) / 2) * 100}%`,
                          left: rho >= 0 ? "50%" : undefined,
                          right: rho >= 0 ? undefined : "50%",
                          backgroundColor: divergingCss(1 + rho, 1),
                        }}
                      />
                    </span>
                    <span className="tabular w-14 shrink-0 text-right text-xs text-ink">
                      {rho >= 0 ? "+" : ""}
                      {rho.toFixed(2)}
                    </span>
                  </span>
                </td>
                <td
                  className={`tabular py-1 text-right text-xs ${
                    sig ? "font-medium text-ink" : "text-faint"
                  }`}
                >
                  {q === null ? "-" : q.toFixed(3)}
                </td>
                <td className="tabular py-1 text-right text-xs text-muted">
                  {c.bias_attention_ratio === null
                    ? "-"
                    : `${c.bias_attention_ratio.toFixed(2)}×`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-3 text-xs leading-relaxed text-faint">
        q is the false-discovery-adjusted significance. The raw p value is not
        shown because one test runs per head: across {total} heads, several
        would clear a raw 0.05 on noise alone. Anything at q below{" "}
        {Q_THRESHOLD} survives that correction.
      </p>
    </div>
  );
}
