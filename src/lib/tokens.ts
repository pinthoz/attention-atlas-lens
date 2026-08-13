/**
 * Turning raw tokenizer output into something a person can read.
 *
 * The API returns tokenizer-native strings. Two conventions show up, and both
 * are noise to a reader:
 *   BERT (WordPiece)   "##olo"  - a piece continuing the previous token
 *   GPT-2 (byte BPE)   "Ġnurse" - a token that begins with a space, i.e. the
 *                                 start of a word; no marker means it
 *                                 continues the previous one
 * GPT-2 also encodes a newline as "Ċ".
 *
 * We strip the markers for display but keep the raw string (tooltips, and so
 * nobody has to trust that we stripped correctly) and keep the join
 * behaviour, so the ribbon can reassemble readable text.
 */

export type TokenKind = "special" | "word" | "continuation";

export interface DisplayToken {
  index: number;
  /** Exactly what the tokenizer produced. */
  raw: string;
  /** Marker stripped, safe to show. */
  text: string;
  kind: TokenKind;
  /** True when this token joins the previous one with no space between. */
  joinsPrevious: boolean;
  /** Segment id from `token_type_ids`, when the input was a sentence pair. */
  segment?: number;
}

const BERT_SPECIAL = /^\[(CLS|SEP|PAD|MASK|UNK)\]$/;
const GPT2_SPECIAL = /^<\|.*\|>$/;

function isSpecial(raw: string): boolean {
  return BERT_SPECIAL.test(raw) || GPT2_SPECIAL.test(raw);
}

export function parseTokens(
  tokens: string[],
  segments?: number[],
): DisplayToken[] {
  return tokens.map((raw, index) => {
    const segment = segments?.[index];

    if (isSpecial(raw)) {
      return {
        index,
        raw,
        text: raw,
        kind: "special" as const,
        joinsPrevious: false,
        segment,
      };
    }

    // WordPiece continuation.
    if (raw.startsWith("##")) {
      return {
        index,
        raw,
        text: raw.slice(2),
        kind: "continuation" as const,
        joinsPrevious: true,
        segment,
      };
    }

    // Byte-level BPE: Ġ marks a leading space, Ċ a newline.
    if (raw.startsWith("Ġ") || raw.startsWith("Ċ")) {
      return {
        index,
        raw,
        text: raw.slice(1).replace(/Ġ/g, " ").replace(/Ċ/g, "⏎") || "⏎",
        kind: "word" as const,
        joinsPrevious: false,
        segment,
      };
    }

    // A GPT-2 token with no leading marker continues the previous word. The
    // very first token is a word start regardless, having nothing to continue.
    const bpeContinuation = index > 0 && tokens.some((t) => t.includes("Ġ"));
    return {
      index,
      raw,
      text: raw,
      kind: bpeContinuation ? ("continuation" as const) : ("word" as const),
      joinsPrevious: bpeContinuation,
      segment,
    };
  });
}

/** Index where segment B starts, or null when the input was a single segment. */
export function segmentBoundary(segments?: number[]): number | null {
  if (!segments || segments.length === 0) return null;
  const at = segments.findIndex((s) => s === 1);
  return at > 0 ? at : null;
}

/** Compact label for axes, where horizontal room is scarce. */
export function axisLabel(token: DisplayToken, max = 12): string {
  const text = token.kind === "special" ? token.raw : token.text;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
