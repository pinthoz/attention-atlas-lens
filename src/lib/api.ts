/**
 * Browser-side client for the Attention Atlas API.
 *
 * Deliberately no Next.js route handlers in front of this. The API lives on a
 * Hugging Face Space that sleeps when idle; the first request after it wakes
 * can take 30–60s, which exceeds a Vercel Hobby function's timeout. A proxy
 * would turn a slow-but-fine request into a hard 504. A browser fetch just
 * waits. It also keeps the site a static export with no server at all.
 *
 * The cost of calling cross-origin from the browser is CORS: the Space must
 * allow this site's origin (it sets `FRONTEND_ORIGIN`, plus localhost:3000 for
 * development). A CORS rejection surfaces to JS as an opaque `TypeError` with
 * no status, indistinguishable from the network being down — `toApiError`
 * handles that case explicitly rather than reporting a misleading cause.
 */

import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ApiErrorBody,
  HealthResponse,
  ModelsResponse,
} from "./types";

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

/** Server-side ceilings, mirrored so we can refuse locally instead of round-tripping. */
export const MAX_CHARS = 4000;
export const MAX_TOKENS = 100;

export type ApiErrorKind = "network" | "http" | "timeout" | "parse";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Turn a thrown value into an ApiError with a message worth showing a user.
 * `fetch` rejects with a bare TypeError for DNS failure, connection refused,
 * and CORS denial alike, so the message names the possibilities rather than
 * guessing one.
 */
function toApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause;
  if (cause instanceof DOMException && cause.name === "AbortError") {
    return new ApiError("timeout", "The request took too long and was stopped.");
  }
  return new ApiError(
    "network",
    `Could not reach the analysis service at ${BASE_URL}. It may be offline, or it may not accept requests from this address.`,
  );
}

async function readError(response: Response): Promise<ApiError> {
  let detail = "";
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (typeof body?.detail === "string") detail = body.detail;
  } catch {
    // Non-JSON error body (a proxy's HTML 502 page, say). Fall through.
  }
  return new ApiError(
    "http",
    detail || `The service replied ${response.status} without explanation.`,
    response.status,
  );
}

async function request<T>(
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, signal });
  } catch (cause) {
    throw toApiError(cause);
  }
  if (!response.ok) throw await readError(response);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError("parse", "The service sent a reply we could not read.");
  }
}

/**
 * Ping health. Called on mount purely to start waking a sleeping Space, so
 * the user's first real request meets a warm server. Never surfaced as an
 * error — a failed wake-up ping is not something to interrupt anyone about.
 */
export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health", { method: "GET" }, signal);
}

export function getModels(signal?: AbortSignal): Promise<ModelsResponse> {
  return request<ModelsResponse>("/api/models", { method: "GET" }, signal);
}

export function analyze(
  body: AnalyzeRequest,
  signal?: AbortSignal,
): Promise<AnalyzeResponse> {
  return request<AnalyzeResponse>(
    "/api/analyze",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    signal,
  );
}
