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
 * Laid out as inline text rather than a flex row, so that subword pieces can
 * sit flush against each other. "ap" + "##olo" + "##gis" + "##ed" has to read
 * as "apologised" — the colour changes across the word show which piece drew
 * the attention, without the tokenizer's seams turning it into four words.
 * That is why the chips carry no horizontal padding: word spacing comes from
 * real space characters between them, which stay untinted.
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
    <div className="font-language text-[clamp(1.05rem,2.2vw,1.35rem)] leading-[2.1]">
      {tokens.map((token, position) => {
        const weight = weights[token.index];
        // Pad only the sides that are not a subword seam, so whole words get
        // breathing room while the pieces of one word stay welded together.
        const nextJoins = tokens[position + 1]?.joinsPrevious ?? false;
        const t = max > 0 && weight !== null ? weight / max : 0;
        // Below a few percent of the peak, a tint is noise. Leaving those
        // tokens on the page ground keeps the sentence readable and stops a
        // faint wash from implying attention that is not there.
        const tinted = t > 0.04;
        const colour = magma(t);
        const isQuery = token.index === queryIndex;
        const special = token.kind === "special";

        return (
          <span key={token.index}>
            {/* Word spacing lives out here, untinted, so that continuation
                pieces get no space and everything else does. */}
            {token.index > 0 && !token.joinsPrevious && " "}

            {boundary !== null && token.index === boundary && (
              <span
                className="eyebrow mr-1.5 border-l-2 border-[#cd4071] pl-1.5 text-[#cd4071]"
                title="BERT encoded this input as a sentence pair. Segment B starts here."
              >
                B{" "}
              </span>
            )}

            <button
              type="button"
              onClick={() => onSelect(token.index)}
              aria-label={`${token.raw}, receiving ${
                weight === null ? "no value" : weight.toFixed(3)
              } of attention from ${tokens[queryIndex]?.raw ?? "the selected token"}`}
              title={`${token.raw} · ${weight === null ? "—" : weight.toFixed(4)}`}
              className={`py-[3px] align-baseline transition-colors duration-100 ${
                special
                  ? "font-data mx-0.5 rounded-[2px] px-1 text-[0.62em] uppercase"
                  : ""
              } ${
                isQuery
                  ? "underline decoration-[#cd4071] decoration-2 underline-offset-[6px]"
                  : ""
              }`}
              style={{
                backgroundColor: tinted ? rgbCss(colour) : "transparent",
                color: tinted ? readableOn(colour) : undefined,
                paddingLeft: special ? undefined : token.joinsPrevious ? 0 : 3,
                paddingRight: special ? undefined : nextJoins ? 0 : 3,
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
