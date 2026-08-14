/**
 * Head roles: the behavioural families the pipeline clusters heads into.
 *
 * IMPORTANT: the family names are GENERATED, not enumerated. The server builds
 * them as `get_dim_name(dominant_dim) + " Specialists"`, with combined
 * "X/Y Specialists" forms when two clusters collide on the same dominant
 * dimension, so "Long-Range Specialists", "Syntactic Specialists",
 * "Positional Specialists" and others appear depending on the sentence. An
 * earlier version of this file hardcoded five names and quietly painted every
 * unlisted family the same grey, which made two different families
 * indistinguishable. Slots are therefore assigned by name, in a fixed order,
 * to whatever comes back.
 *
 * Colour here is CATEGORICAL. Everywhere else on this page colour encodes
 * magnitude, so where the index is shaded by family the legend says these hues
 * rank nothing.
 */

import type { HeadTrait } from "./types";

export type RoleShape =
  | "circle"
  | "square"
  | "triangle"
  | "diamond"
  | "cross"
  | "wedge"
  | "dot";

export interface RoleStyle {
  /** Short label for tight spaces. */
  short: string;
  description: string;
  color: string;
  /**
   * Secondary encoding for the scatter, where families intermix. Two of the
   * pairs below sit in the 6-8 ΔE band under colour-vision deficiency, which
   * is only legal alongside encoding that does not depend on colour: shape
   * here, and a labelled legend on every chart that uses these.
   */
  shape: RoleShape;
}

/**
 * Ordered slots, from the Okabe-Ito colourblind-safe set, checked with the
 * palette validator under `--pairs all`, the right mode for a scatter, where
 * any family can land beside any other:
 *
 *   worst pair, all pairs   #CC79A7 vs #009E73   ΔE 7.6 (deutan)  → needs the
 *                                                   secondary encoding above
 *   normal vision           all pairs clear the 15 floor
 *
 * Amber, pink and sky sit below 3:1 on white, which obliges visible relief
 * rather than colour alone; every chart using these ships a labelled legend.
 */
const SLOTS: { color: string; shape: RoleShape }[] = [
  { color: "#0072B2", shape: "circle" },
  { color: "#E69F00", shape: "triangle" },
  { color: "#009E73", shape: "diamond" },
  { color: "#D55E00", shape: "square" },
  { color: "#CC79A7", shape: "cross" },
  { color: "#56B4E9", shape: "wedge" },
];

/**
 * Reserved for "Diffuse/Noise", which the server assigns when no dimension
 * clears its cutoff. It means "no distinctive behaviour" and is often the
 * largest family, so it reads as background rather than competing as a
 * category. It is the "Other" bucket, not a slot.
 */
const NEUTRAL: RoleStyle = {
  short: "Diffuse",
  description:
    "No strong pattern: attention spread thinly rather than concentrated anywhere.",
  color: "#94a3b8",
  shape: "dot",
};

const DIFFUSE_NAME = "Diffuse/Noise";

/** Plain-language notes for the families that turn up most often. */
const DESCRIPTIONS: Record<string, string> = {
  "Semantic Specialists": "Links words by meaning, who did what to whom.",
  "Syntactic Specialists": "Follows grammatical structure rather than meaning.",
  "Long-Range Specialists":
    "Reaches across the sentence rather than to neighbouring words.",
  "Positional Specialists": "Attends by position, the word before, the word after.",
  "Structural Specialists": "Keys on the scaffolding of the sentence.",
  "CLS/Global Specialists":
    "Routes attention to the sentence-summary token rather than to words.",
  "Separator/Punctuation Specialists":
    "Parks attention on separators and punctuation, often a resting state.",
  "Self-Attention Specialists":
    "Each token mostly looks at itself, passing its own value on.",
  "Sink Specialists":
    "Points at the sentence's first token, which soaks up attention with no meaning attached.",
  [DIFFUSE_NAME]: NEUTRAL.description,
};

/** "Long-Range Specialists" → "Long-Range". */
function shortName(name: string): string {
  return name.replace(/\s*Specialists?$/i, "").trim() || name;
}

function describe(name: string): string {
  return (
    DESCRIPTIONS[name] ??
    `Heads whose strongest shared tendency in this run is ${shortName(name).toLowerCase()}.`
  );
}

/**
 * Assign a slot to every family present.
 *
 * Ordered by NAME, not by size: sorting by head count would repaint every
 * family whenever the counts shifted, and colour has to follow the family
 * rather than its rank.
 */
export function buildRoles(names: Iterable<string>): Map<string, RoleStyle> {
  const unique = [...new Set(names)].filter((n) => n !== DIFFUSE_NAME).sort();
  const map = new Map<string, RoleStyle>();

  unique.forEach((name, i) => {
    const slot = SLOTS[i];
    map.set(
      name,
      slot
        ? { short: shortName(name), description: describe(name), ...slot }
        : // Past the palette, fold into the neutral rather than inventing a
          // hue that would not survive the validator.
          { ...NEUTRAL, short: shortName(name), description: describe(name) },
    );
  });

  map.set(DIFFUSE_NAME, NEUTRAL);
  return map;
}

export const UNKNOWN_ROLE: RoleStyle = {
  short: "Other",
  description: "A behaviour this run did not fit into the named families.",
  color: "#64748b",
  shape: "dot",
};

export function roleFrom(
  roles: Map<string, RoleStyle>,
  name: string | undefined,
): RoleStyle {
  return (name && roles.get(name)) || UNKNOWN_ROLE;
}

export const TRAITS: { key: HeadTrait; label: string; hint: string }[] = [
  {
    key: "semantics",
    label: "Meaning",
    hint: "Attention between words that are related in meaning.",
  },
  {
    key: "syntax",
    label: "Grammar",
    hint: "Attention following grammatical structure rather than meaning.",
  },
  {
    key: "entities",
    label: "Names",
    hint: "Attention landing on people, places and other named things.",
  },
  {
    key: "long_range",
    label: "Distance",
    hint: "How far across the sentence the attention reaches.",
  },
  {
    key: "cls",
    label: "Summary token",
    hint: "Attention routed to [CLS], the stand-in for the whole sentence.",
  },
  {
    key: "punct",
    label: "Punctuation",
    hint: "Attention resting on separators and punctuation.",
  },
  {
    key: "self",
    label: "Itself",
    hint: "How much each token attends to its own position.",
  },
];
