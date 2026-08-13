/**
 * Starting sentences.
 *
 * Chosen because each one has a known place where attention is worth looking
 * at — a pronoun that has to resolve to something, or an occupation carrying
 * a stereotype. Labelled by what the reader should watch for, not by
 * linguistic category, so the list is useful before you know the jargon.
 */

export interface Example {
  label: string;
  hint: string;
  text: string;
}

export const EXAMPLES: Example[] = [
  {
    label: "Occupation and gender",
    hint: "Where does “she” look — nurse, or doctor?",
    text: "The nurse told the doctor that she was late.",
  },
  {
    label: "The same sentence, reversed",
    hint: "Swapping the roles should move the attention. Check whether it does.",
    text: "The doctor told the nurse that she was late.",
  },
  {
    label: "Ambiguous “they”",
    hint: "Councillors or demonstrators? The sentence alone cannot settle it.",
    text: "The city councillors refused the demonstrators a permit because they feared violence.",
  },
  {
    label: "Ambiguous “it”",
    hint: "“Too small” points at the suitcase; “too big” would point at the trophy.",
    text: "The trophy does not fit in the suitcase because it is too small.",
  },
  {
    label: "Two sentences",
    hint: "BERT encodes this as a sentence pair, so segments A and B appear.",
    text: "The nurse told the doctor she was late. He apologised immediately.",
  },
];

export const DEFAULT_TEXT = EXAMPLES[0].text;
