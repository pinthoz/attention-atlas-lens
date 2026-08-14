/**
 * Starting sentences.
 *
 * Chosen because each one has a known place where attention is worth looking
 * at, a pronoun that has to resolve to something, or an occupation carrying
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
    hint: "Where does “she” look, nurse, or doctor?",
    text: "The nurse told the doctor that she was late.",
  },
  {
    // Verified against the running detector: the coreference examples below
    // trip nothing, so the bias view needs a sentence that actually fires.
    label: "Stated as fact",
    hint: "Blunt generalisations about groups. The bias detector flags most of this one.",
    text: "All women are naturally nurturing and emotional. Men are logical and suited for leadership positions.",
  },
  {
    label: "Softer stereotype",
    hint: "Same shape, gentler wording, see whether the detector still catches it.",
    text: "Older workers tend to struggle with new technology, while young people pick it up instantly.",
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
