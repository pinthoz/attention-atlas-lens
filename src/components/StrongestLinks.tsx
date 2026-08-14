"use client";

/**
 * The strongest connections this head makes, in words.
 *
 * The matrix holds these already, but reading them off a grid means finding
 * the bright cell and then tracing two axes to name it. This says the same
 * thing as a sentence, "she → nurse", which is the form the finding
 * eventually gets written down in anyway.
 *
 * It complements rather than repeats the other two token views: the ribbon is
 * one row, "which words draw the attention" is column totals, and this is the
 * individual pairs, wherever they sit.
 */

import type { DisplayToken } from "@/lib/tokens";

interface StrongestLinksProps {
  matrix: (number | null)[][];
  tokens: DisplayToken[];
  isCausal: boolean;
  onSelectRow: (index: number) => void;
}

const MAX_ROWS = 10;

export default function StrongestLinks({
  matrix,
  tokens,
  isCausal,
  onSelectRow,
}: StrongestLinksProps) {
  const n = matrix.length;
  if (!n) return null;

  const pairs: { from: DisplayToken; to: DisplayToken; weight: number; self: boolean }[] =
    [];

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // Masked cells are not weak links, they are absent ones.
      if (isCausal && j > i) continue;
      const weight = matrix[i]?.[j];
      const from = tokens[i];
      const to = tokens[j];
      if (typeof weight !== "number" || !from || !to) continue;
      pairs.push({ from, to, weight, self: i === j });
    }
  }

  pairs.sort((a, b) => b.weight - a.weight);
  const shown = pairs.slice(0, MAX_ROWS);
  const max = shown[0]?.weight ?? 0;
  if (max <= 0) return null;

  return (
    // card-fill + flex-1 from the parent: last in its column, so it takes the
    // slack and its closing note sits on the bottom edge.
    <section className="card card-fill flex-1">
      <h2 className="card-title">The strongest links</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        The heaviest single connections this head makes. A link to the word
        itself is marked. A head can be busy without ever looking outward.
      </p>

      <ol className="mt-4 space-y-1.5">
        {shown.map(({ from, to, weight, self }, i) => (
          <li key={`${from.index}-${to.index}-${i}`}>
            <button
              type="button"
              onClick={() => onSelectRow(from.index)}
              title={`${from.raw} → ${to.raw}: ${weight.toFixed(4)}`}
              className="group flex w-full items-center gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-canvas"
            >
              <span className="flex w-40 shrink-0 items-center gap-1.5 text-[13px]">
                <span className="max-w-[4.5rem] truncate text-muted">
                  {from.text}
                </span>
                <span aria-hidden="true" className="text-faint">
                  →
                </span>
                <span
                  className={`max-w-[4.5rem] truncate ${
                    self ? "text-faint italic" : "font-medium text-ink"
                  }`}
                >
                  {self ? "itself" : to.text}
                </span>
              </span>
              <span className="relative h-4 flex-1 overflow-hidden rounded-[4px] bg-canvas">
                <span
                  className="absolute inset-y-0 left-0 rounded-[4px]"
                  style={{
                    width: `${(weight / max) * 100}%`,
                    backgroundColor: self ? "#cbd5e1" : "#5A6890",
                  }}
                />
              </span>
              <span className="tabular w-14 shrink-0 text-right text-xs text-ink">
                {weight.toFixed(3)}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <p className="mt-auto pt-3 text-xs leading-snug text-faint">
        Click a link to paint that word&apos;s row onto the sentence above.
      </p>
    </section>
  );
}
