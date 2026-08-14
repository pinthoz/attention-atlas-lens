"use client";

/**
 * The signature element: the sentence, in reading order, painted with one
 * token's attention.
 *
 * A matrix row holds the same information, but nobody reads a matrix row as
 * language. Projecting it back onto the sentence is what turns "row 7 has a
 * spike at column 2" into "when the model handles *she*, it looks at
 * *nurse*". It doubles as the accessible face of the canvas heatmap: real
 * text, in the DOM, in order.
 *
 * Laid out as inline text rather than a flex row, so subword pieces can sit
 * flush. "ap" + "##olo" + "##gis" + "##ed" has to read as "apologised", the
 * colour changes across the word show which piece drew the attention without
 * the tokenizer's seams turning it into four words. Hence chips padded only
 * on the sides that are not a seam, with word spacing from real, untinted
 * space characters.
 */

import { magma, readableOn, rgbCss } from "@/lib/color";
import type { DisplayToken } from "@/lib/tokens";

interface TokenRibbonProps {
  tokens: DisplayToken[];
  /** One row of the attention matrix: where this query token sends its weight. */
  weights: (number | null)[];
  queryIndex: number;
  boundary: number | null;
  onSelect: (index: number) => void;
}

export default function TokenRibbon({
  tokens,
  weights,
  queryIndex,
  boundary,
  onSelect,
}: TokenRibbonProps) {
  const max = weights.reduce<number>(
    (acc, w) => (w !== null && w > acc ? w : acc),
    0,
  );

  return (
    <div className="text-[1.0625rem] leading-[2.4] tracking-[-0.005em]">
      {tokens.map((token, position) => {
        const weight = weights[token.index];
        const t = max > 0 && weight !== null ? weight / max : 0;
        // Below a few percent of the peak, a tint is noise. Leaving those
        // tokens on the card keeps the sentence readable and stops a faint
        // wash from implying attention that is not there.
        const tinted = t > 0.04;
        const colour = magma(t);
        const isQuery = token.index === queryIndex;
        const special = token.kind === "special";
        // Pad only the sides that are not a subword seam, so whole words get
        // breathing room while the pieces of one word stay welded together.
        const nextJoins = tokens[position + 1]?.joinsPrevious ?? false;

        return (
          <span key={token.index}>
            {token.index > 0 && !token.joinsPrevious && " "}

            {/* Blue, matching the line the canvas draws at the same index. */}
            {boundary !== null && token.index === boundary && (
              <span
                className="mr-2 rounded-md bg-mark/10 px-1.5 py-1 align-middle font-mono text-[0.65em] font-medium text-mark"
                title="BERT encoded this input as a sentence pair. Segment B starts here."
              >
                B
              </span>
            )}

            <button
              type="button"
              onClick={() => onSelect(token.index)}
              aria-label={`${token.raw}, receiving ${
                weight === null ? "no value" : weight.toFixed(3)
              } of attention from ${tokens[queryIndex]?.raw ?? "the selected token"}`}
              title={`${token.raw} · ${weight === null ? "-" : weight.toFixed(4)}`}
              className={`py-[5px] align-baseline transition-colors duration-100 ${
                special
                  ? "mx-0.5 rounded-md bg-canvas px-1.5 font-mono text-[0.62em] text-faint ring-1 ring-line"
                  : "rounded-[4px] hover:bg-canvas"
              } ${
                isQuery
                  ? "underline decoration-brand decoration-2 underline-offset-[7px]"
                  : ""
              }`}
              style={{
                backgroundColor: tinted && !special ? rgbCss(colour) : undefined,
                color: tinted && !special ? readableOn(colour) : undefined,
                paddingLeft: special ? undefined : token.joinsPrevious ? 0 : 4,
                paddingRight: special ? undefined : nextJoins ? 0 : 4,
              }}
            >
              {token.text}
            </button>
          </span>
        );
      })}
    </div>
  );
}
