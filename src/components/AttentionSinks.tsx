"use client";

/**
 * Which tokens the whole head points AT, added up.
 *
 * The ribbon and the matrix both read outward, where one token looks. This
 * reads inward: total attention received per token, summed down each column.
 * It is the chart that answers the question the heatmap provokes on sight,
 * which is "why is that one column bright all the way down".
 *
 * A ranked horizontal bar chart, because the job is comparing magnitudes
 * across items whose labels are words of unequal length. Vertical bars would
 * turn every label sideways for nothing.
 *
 * One series, so one colour and no legend, the title names it.
 */

import { PALETTE } from "@/lib/color";
import type { DisplayToken } from "@/lib/tokens";

interface AttentionSinksProps {
  matrix: (number | null)[][];
  tokens: DisplayToken[];
  isCausal: boolean;
  onSelectToken: (index: number) => void;
}

/** Enough rows to show the shape of the tail without becoming a second table. */
const MAX_ROWS = 12;

export default function AttentionSinks({
  matrix,
  tokens,
  isCausal,
  onSelectToken,
}: AttentionSinksProps) {
  const n = matrix.length;
  if (!n) return null;

  // Column sums: how much every token sent to this one. Averaged over the
  // rows that could actually reach it, under a causal mask a token late in
  // the sentence is visible to fewer rows, and a raw sum would make early
  // tokens look dominant purely because more rows were allowed to see them.
  const received = tokens.slice(0, n).map((token, j) => {
    let total = 0;
    let eligible = 0;
    for (let i = 0; i < n; i++) {
      if (isCausal && j > i) continue;
      const value = matrix[i]?.[j];
      if (typeof value === "number") total += value;
      eligible += 1;
    }
    return { token, mean: eligible > 0 ? total / eligible : 0 };
  });

  const ranked = [...received].sort((a, b) => b.mean - a.mean);
  const shown = ranked.slice(0, MAX_ROWS);

  // A sentence pair carries two [SEP]s, and "the" repeats constantly. Two rows
  // with the same label and different bars look like a mistake, so repeated
  // words carry their position.
  const timesSeen = new Map<string, number>();
  for (const { token } of received) {
    timesSeen.set(token.text, (timesSeen.get(token.text) ?? 0) + 1);
  }
  const max = shown[0]?.mean ?? 0;
  if (max <= 0) return null;

  return (
    <section className="card">
      <h2 className="card-title">Which words draw the attention</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Attention received by each word, averaged over the words that could
        look at it. Structural tokens often top this list: a head parking on{" "}
        <span className="font-mono text-[0.92em]">[SEP]</span> is doing
        something closer to resting than to reading.
      </p>

      <ul className="mt-4 space-y-1.5">
        {shown.map(({ token, mean }) => {
          const width = (mean / max) * 100;
          return (
            <li key={token.index}>
              <button
                type="button"
                onClick={() => onSelectToken(token.index)}
                title={`${token.raw}, receives ${mean.toFixed(4)} on average`}
                className="group flex w-full items-center gap-3 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-canvas"
              >
                <span
                  className={`w-24 shrink-0 truncate text-right text-[13px] ${
                    token.kind === "special"
                      ? "font-mono text-[0.8em] text-faint"
                      : "text-muted"
                  }`}
                >
                  {token.text}
                  {(timesSeen.get(token.text) ?? 0) > 1 && (
                    <span className="tabular ml-1 text-[0.85em] text-faint">
                      #{token.index}
                    </span>
                  )}
                </span>
                <span className="relative h-4 flex-1 overflow-hidden rounded-[4px] bg-canvas">
                  <span
                    className="absolute inset-y-0 left-0 rounded-[4px]"
                    style={{
                      width: `${width}%`,
                      backgroundColor:
                        token.kind === "special" ? PALETTE.faint : "#5A6890",
                    }}
                  />
                </span>
                <span className="tabular w-14 shrink-0 text-right text-xs text-ink">
                  {mean.toFixed(3)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {ranked.length > MAX_ROWS && (
        <p className="mt-3 text-xs text-faint">
          Showing the top {MAX_ROWS} of {ranked.length} tokens.
        </p>
      )}
    </section>
  );
}
