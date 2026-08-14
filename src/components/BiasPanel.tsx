"use client";

/**
 * What GUS-Net flagged, and how the selected head treats it.
 *
 * The token strip is rendered from the BIAS response's own tokens, never from
 * the analysis tokens. The two endpoints tokenize differently, /api/analyze
 * encodes a multi-sentence BERT input as a sentence pair and gains a second
 * [SEP], so borrowing the other list would slide every label a position out
 * from the second sentence onwards.
 */

import { useState } from "react";
import { parseTokens } from "@/lib/tokens";
import type { BiasCategory, BiasResponse, HeadBiasMetrics } from "@/lib/types";

interface BiasPanelProps {
  bias: BiasResponse;
  layer: number;
  head: number;
  /** Jump the rest of the page to a head, used by "most focused head". */
  onSelectHead: (layer: number, head: number) => void;
}

/** Named so a reader knows what was found, not which label the model emits. */
const CATEGORY: Record<
  BiasCategory,
  { label: string; hint: string; dot: string; chip: string }
> = {
  STEREO: {
    label: "Stereotype",
    hint: "A trait attributed to a group as if it defined them.",
    dot: "bg-brand",
    chip: "bg-brand-soft text-brand-active ring-brand-ring",
  },
  GEN: {
    label: "Generalisation",
    hint: "A claim made about a whole group at once.",
    dot: "bg-mark",
    chip: "bg-mark/10 text-mark ring-mark/25",
  },
  UNFAIR: {
    label: "Unfairness",
    hint: "Language that treats a group as lesser.",
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-700 ring-amber-200",
  },
};

function ratio(value: number | null | undefined): string {
  return typeof value === "number" ? `${value.toFixed(2)}×` : "N/A";
}

export default function BiasPanel({
  bias,
  layer,
  head,
  onSelectHead,
}: BiasPanelProps) {
  const [openDefinitions, setOpenDefinitions] = useState(false);

  const tokens = parseTokens(bias.tokens);
  const labelsByIndex = new Map(bias.token_labels.map((l) => [l.index, l]));
  const nothingFlagged = bias.tokens_biased.length === 0;

  const selected: HeadBiasMetrics | null =
    bias.metrics[layer]?.[head] ?? null;

  // The head that attends most to the flagged tokens, offered as a shortcut
  // because hunting for it by eye across 144 cells is the tedious part.
  let peak: { layer: number; head: number; value: number } | null = null;
  bias.metrics.forEach((row, l) =>
    row.forEach((cell, h) => {
      const value = cell?.bias_attention_ratio;
      if (typeof value === "number" && (!peak || value > peak.value)) {
        peak = { layer: l, head: h, value };
      }
    }),
  );
  const peakHead = peak as { layer: number; head: number; value: number } | null;

  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="card-title">Bias in this sentence</h2>
        <span className="tabular text-xs text-faint">{bias.bias_model_name}</span>
      </div>

      {nothingFlagged ? (
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          The detector flagged nothing in this sentence. That is a result, not a
          failure, try one of the bias examples to see it fire.
        </p>
      ) : (
        <>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            {bias.summary.biased_tokens} of {bias.summary.total_tokens} words
            flagged
            {bias.summary.categories_found.length > 0 && (
              <>
                {", "}
                {bias.summary.categories_found
                  .map((c) => CATEGORY[c]?.label.toLowerCase() ?? c)
                  .join(", ")}
              </>
            )}
            .
          </p>

          {/* The sentence, with what fired marked underneath each word. */}
          <div className="mt-4 text-[17px] leading-[2.4]">
            {tokens.map((token, position) => {
              const label = labelsByIndex.get(token.index);
              const flagged = label?.is_biased ?? false;
              const primary = label?.bias_types?.[0];
              const style = primary ? CATEGORY[primary] : null;
              // Pad only the sides that are not a subword seam, so "nur" +
              // "##turing" reads as "nurturing" rather than two words.
              const nextJoins = tokens[position + 1]?.joinsPrevious ?? false;
              const special = token.kind === "special";

              return (
                <span key={token.index}>
                  {token.index > 0 && !token.joinsPrevious && " "}
                  <span
                    title={
                      label?.explanation ||
                      `${token.raw}: nothing fired (threshold ${label?.threshold ?? "-"})`
                    }
                    className={
                      special
                        ? "mx-0.5 rounded-md bg-canvas px-1.5 py-[3px] font-mono text-[0.62em] text-faint ring-1 ring-line"
                        : flagged && style
                          ? `rounded-[4px] py-[3px] ring-1 ${style.chip}`
                          : "py-[3px] text-muted"
                    }
                    style={
                      special
                        ? undefined
                        : {
                            paddingLeft: token.joinsPrevious ? 0 : 3,
                            paddingRight: nextJoins ? 0 : 3,
                          }
                    }
                  >
                    {token.text}
                  </span>
                </span>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            {(Object.keys(CATEGORY) as BiasCategory[])
              .filter((c) => bias.summary.categories_found.includes(c))
              .map((c) => (
                <span
                  key={c}
                  className="flex items-center gap-1.5 text-xs text-muted"
                  title={CATEGORY[c].hint}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block h-2 w-2 rounded-full ${CATEGORY[c].dot}`}
                  />
                  {CATEGORY[c].label}
                </span>
              ))}
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-[13px] font-semibold text-ink">
                Layer {layer}, head {head}
              </h3>
              {peakHead && (peakHead.layer !== layer || peakHead.head !== head) && (
                <button
                  type="button"
                  onClick={() => onSelectHead(peakHead.layer, peakHead.head)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-brand-active transition-colors hover:bg-brand-soft"
                >
                  Go to most bias-focused (L{peakHead.layer}·H{peakHead.head})
                </button>
              )}
            </div>

            <dl className="mt-2 space-y-1">
              <div className="flex items-baseline justify-between gap-4 py-1">
                <dt className="text-sm text-muted">Attention to flagged words</dt>
                <dd className="tabular text-sm font-medium text-ink">
                  {ratio(selected?.bias_attention_ratio)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-1">
                <dt className="text-sm text-muted">Flagged words to each other</dt>
                <dd className="tabular text-sm font-medium text-ink">
                  {ratio(selected?.amplification_score)}
                </dd>
              </div>
            </dl>

            {selected?.specialized_for_bias && (
              <p className="mt-2 rounded-lg bg-brand-soft p-3 text-[13px] leading-relaxed text-brand-active ring-1 ring-brand-ring">
                This head clears {bias.bar_threshold}×, the point where the
                pattern stops looking like chance.
              </p>
            )}

            <button
              type="button"
              onClick={() => setOpenDefinitions((open) => !open)}
              aria-expanded={openDefinitions}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-brand-active transition-colors hover:bg-brand-soft"
            >
              <span aria-hidden="true" className="text-base leading-none">
                {openDefinitions ? "−" : "+"}
              </span>
              {openDefinitions ? "Hide definitions" : "What these mean"}
            </button>

            {openDefinitions && (
              <div className="mt-3 space-y-3.5 px-2">
                <div>
                  <p className="text-[13px] font-semibold text-ink">
                    Attention to flagged words
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">
                    How much of the head&apos;s attention lands on the flagged
                    words, divided by what an even spread would have given them.
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed font-medium text-ink">
                    1.00× is no preference either way, not zero. Above{" "}
                    {bias.bias_model ? bias.bar_threshold : 2.5}× counts as
                    specialisation.
                  </p>
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-ink">
                    Flagged words to each other
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">
                    The same ratio, but counting only attention that runs from
                    one flagged word to another: a head reinforcing the
                    stereotype rather than merely noticing it.
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed font-medium text-ink">
                    Also centred at 1.00×. With only one word flagged the number
                    collapses to that word&apos;s self-attention and means
                    nothing, so read it when at least two are marked.
                  </p>
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-ink">
                    Where the labels come from
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">
                    {bias.bias_model_name} tags each word, with its own
                    threshold per category. Hover any word to see what fired and
                    by how much. These are a model&apos;s judgements, not
                    ground truth.
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
