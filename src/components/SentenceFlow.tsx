"use client";

/**
 * Sentence-to-sentence attention, pooled from the token matrix.
 *
 * Only meaningful once there are at least two sentences, so the card is not
 * rendered at all otherwise. Rows read "this sentence attends to", columns
 * "…this one", the same orientation as the token heatmap above, so the two
 * are read the same way round.
 */

import { magma, readableOn, rgbCss } from "@/lib/color";
import type { IsaData } from "@/lib/types";

interface SentenceFlowProps {
  isa: IsaData;
}

export default function SentenceFlow({ isa }: SentenceFlowProps) {
  const matrix = isa.sentence_attention_matrix;
  const sentences = isa.sentence_texts ?? [];

  if (!matrix || matrix.length < 2) return null;

  let max = 0;
  for (const row of matrix) {
    for (const value of row) {
      if (typeof value === "number" && value > max) max = value;
    }
  }

  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="card-title">Between the sentences</h2>
        <span className="tabular text-xs text-faint">
          {isa.aggregation_method} over all heads
        </span>
      </div>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
        Every head&apos;s attention pooled down to one number per pair of
        sentences. The diagonal is a sentence attending to itself, which is
        normally the strongest cell.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="border-separate border-spacing-1">
          <caption className="sr-only">
            Attention from each sentence to each sentence
          </caption>
          <thead>
            <tr>
              <th />
              {sentences.map((_, j) => (
                <th
                  key={j}
                  scope="col"
                  className="tabular px-2 pb-1 text-xs font-medium text-muted"
                >
                  {j + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i}>
                <th
                  scope="row"
                  className="max-w-[22rem] truncate pr-3 text-left text-[13px] font-normal text-muted"
                  title={sentences[i]}
                >
                  <span className="tabular mr-2 text-xs text-faint">{i + 1}</span>
                  {sentences[i]}
                </th>
                {row.map((value, j) => {
                  const t = max > 0 && value !== null ? value / max : 0;
                  const colour = magma(t);
                  return (
                    <td
                      key={j}
                      title={`Sentence ${i + 1} → sentence ${j + 1}: ${
                        value === null ? "-" : value.toFixed(4)
                      }`}
                      className="tabular h-11 w-16 rounded-md text-center text-xs"
                      style={{
                        backgroundColor: rgbCss(colour),
                        color: readableOn(colour),
                      }}
                    >
                      {value === null ? "-" : value.toFixed(3)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
