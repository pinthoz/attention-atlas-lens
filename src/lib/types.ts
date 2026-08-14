/**
 * Types for the Attention Atlas JSON API.
 *
 * Written by hand against the real service (FastAPI, `api.py`) and verified
 * against live responses from BERT, GPT-2 and a BERT sentence pair, not
 * inferred from the prose contract. Where the two disagreed, reality won; the
 * differences are called out at each field.
 */

/** GET /api/health */
export interface HealthResponse {
  status: string;
  /** Model ids currently resident in the server's LRU cache. Empty on a cold Space. */
  models_loaded: string[];
  /** "cuda" | "cpu", reported, not enumerated, so the frontend can't drift. */
  device: string;
}

export interface ModelInfo {
  id: string;
  /** Server-side display name, e.g. "BERT Base (Uncased)". */
  name: string;
  family: "bert" | "gpt2";
}

/** GET /api/models */
export interface ModelsResponse {
  models: ModelInfo[];
  default: string;
}

/** POST /api/analyze request body. */
export interface AnalyzeRequest {
  text: string;
  model: string;
  /**
   * `attention` is returned only when BOTH `layer` and `head` are sent, the
   * full matrix is the bulk of the payload, so the server ships it on request
   * only. We always send both; the metrics grid comes back regardless.
   */
  layer?: number;
  head?: number;
  include_clusters?: boolean;
  include_isa?: boolean;
}

/**
 * One head's metrics. Every value is a rounded float, or `null` where the
 * quantity is undefined or non-finite, `null` never means zero.
 */
export interface HeadMetrics {
  /** Largest single weight in the matrix. */
  confidence_max: number | null;
  /** Mean over rows of each row's largest weight. */
  confidence_avg: number | null;
  /** Raw entropy in nats; scale depends on sequence length. */
  focus_entropy: number | null;
  /** Entropy over its causal-aware maximum, so it is comparable at 0-1. */
  focus_normalized: number | null;
  sparsity: number | null;
  distribution_median: number | null;
  distribution_q25: number | null;
  distribution_q75: number | null;
  uniformity: number | null;
  /**
   * Share of attention mass landing on [CLS]. `null` for GPT-2, which has no
   * [CLS] token, the quantity is undefined, not zero. Render "N/A".
   */
  balance: number | null;
}

/**
 * POST /api/analyze response.
 *
 * Two deviations from the written contract, both confirmed against the
 * running service:
 *   - `model` is echoed back (undocumented but always present);
 *   - `attention`/`layer`/`head` appear together, and only when the request
 *     carried both `layer` and `head`.
 */
export interface AnalyzeResponse {
  /** Raw tokenizer strings: "[CLS]", "##olo" for BERT; "Ġnurse" for GPT-2. */
  tokens: string[];
  n_layers: number;
  n_heads: number;
  /** True for BERT-style encoders. Gates whether `balance` is meaningful. */
  has_cls: boolean;
  /** True for GPT-2. The matrix is lower-triangular by construction. */
  is_causal: boolean;
  model: string;
  /** `metrics[layer][head]`. Dense: n_layers × n_heads. */
  metrics: (HeadMetrics | null)[][];
  /** Jensen-Shannon distance between first- and last-layer attention, in nats. */
  flow_change: number | null;
  /** Row-major [query][key] weights. Cells may be `null` if non-finite. */
  attention?: (number | null)[][];
  layer?: number;
  head?: number;
  /**
   * `token_type_ids`: 0 for segment A, 1 for segment B. Present only when a
   * BERT-style tokenizer encoded the input as a sentence pair; absent for
   * GPT-2 entirely, and all-zeros for a single-sentence BERT input.
   */
  segments?: number[];
  /** Only when `include_clusters` was requested. One entry per head. */
  clusters?: HeadCluster[];
  /** Only when `include_isa` was requested. `null` for single-sentence input. */
  isa?: IsaData | null;
}

/** The seven behaviours each head is scored on, all 0-1. */
export type HeadTrait =
  | "syntax"
  | "semantics"
  | "cls"
  | "punct"
  | "entities"
  | "long_range"
  | "self";

/**
 * One head's place in the behavioural map.
 *
 * `x`/`y` are t-SNE coordinates, a 2-D projection for laying heads out by
 * similarity. They are not measurements: distances are meaningful, axes are
 * not, and the numbers change between runs.
 */
export interface HeadCluster {
  layer: number;
  head: number;
  x: number;
  y: number;
  /** K-Means label. Can permute between runs; key on `cluster_name` instead. */
  cluster: number;
  /** Stable, behaviour-derived name, e.g. "Semantic Specialists". */
  cluster_name: string;
  metrics: Partial<Record<HeadTrait, number | null>>;
  /** The same traits as z-scores against all heads in this run. */
  z_metrics: Partial<Record<HeadTrait, number | null>>;
}

// ---------------------------------------------------------------------------
// Faithfulness. POST /api/faithfulness
// ---------------------------------------------------------------------------

export interface FaithfulnessRequest {
  text: string;
  model: string;
  top_k?: number;
}

export interface AblatedHead {
  layer: number;
  head: number;
  /**
   * 1 − cosine similarity between the model's representation with and without
   * this head. Higher means removing the head changed more.
   */
  representation_impact: number | null;
  /** KL divergence of the language-model logits. `null` when no LM head. */
  kl_divergence: number | null;
  /** The head's bias ratio, carried through so the two can be compared. */
  bias_attention_ratio: number | null;
}

/** One head's agreement between where it attends and what the gradient says. */
export interface IgCorrelation {
  layer: number;
  head: number;
  /** Spearman rank correlation, in [-1, 1]. Centred on 0, so it diverges. */
  spearman_rho: number | null;
  /**
   * Raw two-sided p. NOT interpretable alone: one test runs per head over
   * ~144 heads, so roughly seven hits below 0.05 are expected by chance.
   */
  spearman_pvalue: number | null;
  /** Benjamini-Hochberg FDR adjusted. The only value a claim may rest on. */
  spearman_qvalue: number | null;
  bias_attention_ratio: number | null;
  /** Overlap of the top tokens by attention against by attribution. */
  jaccard: number | null;
  rank_biased_overlap: number | null;
}

export interface IgResult {
  available: boolean;
  /** Present when `available` is false. */
  reason?: string;
  /**
   * What the gradients explain. "gusnet-bias-logits" attributes the detector's
   * own evidence and does validate the bias reading; "pooled-norm" is the
   * geometric fallback used when the attentions come from a plain encoder
   * rather than the GUS-Net trunk, and does NOT validate it. The panel has to
   * say which one it got.
   */
  target?: string;
  /**
   * Relative error of the IG path integral. Above about 0.05 the attributions
   * have not converged and every correlation is approximate.
   */
  convergence_delta?: number | null;
  tokens?: string[];
  token_attributions?: number[];
  /** Sorted by |rho| descending. */
  correlations?: IgCorrelation[];
}

export interface FaithfulnessResponse {
  model: string;
  /** Integrated Gradients, the second and independent faithfulness signal. */
  ig?: IgResult;
  /**
   * "zero" replaces the head's output with zeros. It matches the calibrated
   * thresholds but pushes activations off the manifold the model was trained
   * on, which tends to OVERSTATE impact, so these numbers rank heads against
   * each other rather than supporting absolute claims.
   */
  ablation_mode: string;
  /** Sorted by `representation_impact`, descending. */
  heads: AblatedHead[];
  /** Why the list is empty, when it is: "no_flagged_tokens" | "no_ratios". */
  reason: string | null;
}

/** Inter-sentence attention: how much each sentence attends to each other. */
export interface IsaData {
  sentence_texts: string[];
  sentence_boundaries_ids: number[];
  model_type: string;
  is_causal: boolean;
  /** How token-level attention was pooled into sentences, e.g. "mean". */
  aggregation_method: string;
  /** [from][to], sentence-by-sentence. `null` when it could not be built. */
  sentence_attention_matrix: (number | null)[][] | null;
}

/** FastAPI error body: `{"detail": "..."}` on 400/500/503. */
export interface ApiErrorBody {
  detail?: string;
}

// ---------------------------------------------------------------------------
// Bias. POST /api/bias
// ---------------------------------------------------------------------------

export interface BiasRequest {
  text: string;
  model: string;
}

/** GUS-Net's three categories. */
export type BiasCategory = "GEN" | "UNFAIR" | "STEREO";

/** Why one category fired, with the threshold it had to clear. */
export interface BiasFiring {
  prob: number;
  threshold: number;
  /** BIO tag, e.g. "B-GEN" for the start of a span, "I-STEREO" inside one. */
  label: string;
}

export interface BiasTokenLabel {
  token: string;
  index: number;
  bias_types: BiasCategory[];
  is_biased: boolean;
  /** Per-category probability, plus "O" for not-biased. */
  scores: Partial<Record<BiasCategory | "O", number>>;
  /** Only the categories that cleared their threshold. Empty when not biased. */
  fired: Partial<Record<BiasCategory, BiasFiring>>;
  method: string;
  /** Human-readable reason, already written by the detector. Empty when clean. */
  explanation: string;
  threshold: number;
}

/** How one head's attention interacts with the flagged tokens. */
export interface HeadBiasMetrics {
  /** BAR: attention to biased tokens over what an even spread would give.
      Centred at 1.0, not 0, so 1.0 means "no preference either way". */
  bias_attention_ratio: number | null;
  /** BSR: biased tokens attending to each other, same 1.0 centring. */
  amplification_score: number | null;
  max_bias_attention: number | null;
  /** True when BAR clears `bar_threshold`. */
  specialized_for_bias: boolean;
}

export interface BiasSummary {
  total_tokens: number;
  biased_tokens: number;
  bias_percentage: number;
  generalization_count: number;
  unfairness_count: number;
  stereotype_count: number;
  avg_confidence: number;
  categories_found: BiasCategory[];
}

export interface BiasPropagation {
  /** Mean BAR per layer, first to last. */
  layer_propagation: number[];
  peak_layer: number | null;
  /** "increasing" | "decreasing" | "stable" | "mixed" | "none". */
  propagation_pattern: string;
  avg_bias_ratio?: number | null;
}

/**
 * POST /api/bias response.
 *
 * `tokens` is its own PLAIN tokenization and can differ from the one
 * `/api/analyze` returns: that endpoint encodes a multi-sentence BERT input as
 * a sentence pair, adding a second `[SEP]`. Bias indices refer to the list
 * here and to no other, so anything token-positional must be rendered from
 * this array rather than from the analysis tokens.
 */
export interface BiasResponse {
  tokens: string[];
  n_layers: number;
  n_heads: number;
  model: string;
  /** Registry key of the detector used, e.g. "gusnet-bert". */
  bias_model: string;
  bias_model_name: string;
  /** Indices into `tokens` that were flagged. */
  tokens_biased: number[];
  token_labels: BiasTokenLabel[];
  summary: BiasSummary;
  /**
   * `metrics[layer][head]`, or an EMPTY array when no token was flagged -
   * with no biased tokens there is no ratio to compute, and the server returns
   * `[]` rather than a grid of misleading zeros.
   */
  metrics: (HeadBiasMetrics | null)[][];
  propagation: BiasPropagation;
  /** BAR above this counts as specialisation (empirical α = 0.05). */
  bar_threshold: number;
}
