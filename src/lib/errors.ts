/**
 * Turning service errors into something worth reading.
 *
 * The API's messages are written for whoever is calling the API, they name
 * endpoints, field names and internal limits. A visitor should never be told
 * to "See GET /api/models", so the shapes we can recognise get rewritten in
 * the interface's own voice, saying what happened and what to do about it.
 *
 * Anything unrecognised is passed through rather than replaced with a vague
 * apology: a specific message we did not anticipate still beats "Something
 * went wrong".
 */

import { ApiError, MAX_TOKENS } from "./api";

interface Rewrite {
  match: RegExp;
  /** `groups` are the regex captures, so numbers from the server survive. */
  message: (groups: string[]) => string;
}

const REWRITES: Rewrite[] = [
  {
    match: /`text` must not be empty/i,
    message: () => "There is no sentence to analyse. Type one and run it again.",
  },
  {
    match: /`text` is (\d+) characters; the limit is (\d+)/i,
    message: ([chars, limit]) =>
      `That sentence is ${Number(chars).toLocaleString()} characters long and the limit is ${Number(limit).toLocaleString()}. Shorten it and run it again.`,
  },
  {
    match: /Unknown model '([^']+)'/i,
    message: ([model]) =>
      `“${model}” is not a model this tool can run. Pick one from the model list.`,
  },
  {
    match: /Input is (\d+) tokens; the API limit is (\d+)/i,
    message: ([tokens, limit]) =>
      `That sentence comes to ${tokens} tokens, and the limit is ${limit}. Every run measures all of the model's heads over the whole sentence, and the work grows with the square of its length. Try something shorter.`,
  },
  {
    match: /(layer|head) (\d+) out of range.*has (\d+)/i,
    message: ([which, , count]) =>
      `This model does not have that ${which}. It has ${count}. Pick another from the grid.`,
  },
  // Before the generic load failure below: a model that cannot be DOWNLOADED
  // will never come right by waiting, so it must not get the "try again in a
  // moment" advice. The service wraps the original exception in its detail
  // string, which is where these markers come from.
  {
    // Broad on purpose. Hugging Face reports an unreachable hub in several
    // shapes: a raw SSLError, a MaxRetryError, or its own friendlier "we
    // couldn't connect ... couldn't find it in the cached files", which shares
    // none of the wording of the first two. Matching only the exception class
    // names let that third form fall through to the generic message below,
    // which then told the user to wait for something that was never going to
    // arrive. Any load failure that mentions the hub at all is a fetch failure.
    match:
      /Could not load model[\s\S]*(huggingface\.co|SSLError|certificate verify failed|CertificateError|MaxRetryError|Max retries exceeded|ConnectionError|Connection aborted|getaddrinfo|Failed to resolve|NewConnectionError|ProxyError|couldn.?t connect|could not connect|LocalEntryNotFound|OfflineMode|cached files)/i,
    message: () =>
      "This model has not been downloaded yet, and the service could not reach Hugging Face to fetch it. Retrying will not help until that connection is fixed. Pick a model that is already loaded, and check the service log for the underlying error.",
  },
  {
    // "Cannot copy out of meta tensor" comes from PyTorch/accelerate failing to
    // materialise weights onto the device. It is a fault in the service
    // process, not in the request, and it strands every model that is not
    // already resident while the one in memory keeps answering - which makes
    // it look like a problem with the model you picked. Say what it is.
    match:
      /Could not load model[\s\S]*(meta tensor|to_empty\(\)|meta device|NotImplementedError: Cannot copy)/i,
    message: () =>
      "The service could not finish loading this model onto its device. This is a fault in the service rather than anything to do with the sentence: restarting it clears the state. Models already held in memory keep working in the meantime.",
  },
  {
    match: /Could not load model[\s\S]*(CUDA out of memory|OutOfMemoryError|DefaultCPUAllocator|Cannot allocate memory)/i,
    message: () =>
      "There was not enough memory to load this model. Try a smaller one, the base sizes need far less than the large and XL variants.",
  },
  {
    // Deliberately does not promise that waiting will fix it. Most causes that
    // reach here are permanent, and the last version of this line sent people
    // into a retry loop against a broken certificate chain.
    match: /Could not load model/i,
    message: () =>
      "The model could not be loaded. If it is being fetched for the first time, it may just need longer; otherwise the service log will say what went wrong.",
  },
  {
    match: /Analysis failed/i,
    message: () =>
      "The model started but did not finish this sentence. Try a different one.",
  },
];

export function describeError(error: ApiError): string {
  if (error.kind === "network") return error.message;
  if (error.kind === "timeout") {
    return "The run took longer than expected and was stopped. Run it again; the model should be awake now.";
  }
  if (error.kind === "parse") {
    return "The service replied with something this page could not read. Run it again, and if it keeps happening the service may be mid-restart.";
  }

  for (const rewrite of REWRITES) {
    const found = error.message.match(rewrite.match);
    if (found) return rewrite.message(found.slice(1));
  }

  if (error.status && error.status >= 500) {
    return `The service could not complete the run (error ${error.status}). Wait a moment and try again.`;
  }
  return error.message;
}

/** Second line: what to do next, when that is not already obvious. */
export function errorHint(error: ApiError, reachable: boolean): string | null {
  if (!reachable) {
    return "Check that the analysis service is running, and that this address is allowed to reach it.";
  }
  if (/tokens|characters/i.test(error.message)) {
    return `Sentences of up to about ${MAX_TOKENS} tokens work best.`;
  }
  return null;
}
