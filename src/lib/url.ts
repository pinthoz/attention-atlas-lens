/**
 * The view lives in the query string, so any state of this page is a link.
 *
 * Parameter names are spelled out rather than abbreviated: these URLs get
 * pasted into supervision notes and papers, where a reader should be able to
 * see what a link points at without loading it.
 */

import { isMetricKey, type MetricKey } from "./metrics";

export interface ViewState {
  text: string;
  model: string;
  layer: number;
  head: number;
  metric: MetricKey;
}

function readInt(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

export function readView(search: string, defaults: ViewState): ViewState {
  const params = new URLSearchParams(search);
  const metric = params.get("metric");
  return {
    text: params.get("text") ?? defaults.text,
    model: params.get("model") ?? defaults.model,
    layer: readInt(params, "layer", defaults.layer),
    head: readInt(params, "head", defaults.head),
    metric: isMetricKey(metric) ? metric : defaults.metric,
  };
}

export function viewToSearch(view: ViewState): string {
  const params = new URLSearchParams({
    text: view.text,
    model: view.model,
    layer: String(view.layer),
    head: String(view.head),
    metric: view.metric,
  });
  return `?${params.toString()}`;
}

/**
 * Keep the address bar in step without adding a history entry per click.
 * Clicking through 144 heads should not bury the back button.
 */
export function syncUrl(view: ViewState): void {
  if (typeof window === "undefined") return;
  const next = `${window.location.pathname}${viewToSearch(view)}`;
  window.history.replaceState(null, "", next);
}
