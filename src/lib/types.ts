/**
 * Types for the Attention Atlas JSON API.
 *
 * Written by hand against the real service (FastAPI, `api.py`) and verified
 * against live responses from BERT, GPT-2 and a BERT sentence pair — not
 * inferred from the prose contract. Where the two disagreed, reality won; the
 * differences are called out at each field.
 */

/** GET /api/health */
export interface HealthResponse {
  status: string;
  /** Model ids currently resident in the server's LRU cache. Empty on a cold Space. */
  models_loaded: string[];
  /** "cuda" | "cpu" — reported, not enumerated, so the frontend can't drift. */
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
   * `attention` is returned only when BOTH `layer` and `head` are sent — the
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
 * quantity is undefined or non-finite — `null` never means zero.
 */
export interface HeadMetrics {
  /** Largest single weight in the matrix. */
  confidence_max: number | null;
  /** Mean over rows of each row's largest weight. */
  confidence_avg: number | null;
  /** Raw entropy in nats; scale depends on sequence length. */
  focus_entropy: number | null;
  /** Entropy over its causal-aware maximum, so it is comparable at 0–1. */
  focus_normalized: number | null;
  sparsity: number | null;
  distribution_median: number | null;
  distribution_q25: number | null;
  distribution_q75: number | null;
  uniformity: number | null;
  /**
   * Share of attention mass landing on [CLS]. `null` for GPT-2, which has no
   * [CLS] token — the quantity is undefined, not zero. Render "N/A".
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
  /** Jensen–Shannon distance between first- and last-layer attention, in nats. */
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
}

/** FastAPI error body: `{"detail": "..."}` on 400/500/503. */
export interface ApiErrorBody {
  detail?: string;
}
