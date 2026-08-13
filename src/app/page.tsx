"use client";

/**
 * One page, one instrument.
 *
 * Every request goes from this component straight to the API. There is no
 * route handler in between and no server component doing the fetching: the
 * Space sleeps when idle and can take the better part of a minute to wake,
 * which outlives a serverless function but is nothing to a browser tab that
 * is willing to wait. The whole site exports as static files.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Composer from "@/components/Composer";
import HeadIndex from "@/components/HeadIndex";
import Heatmap, { type Cell } from "@/components/Heatmap";
import MetricsPanel from "@/components/MetricsPanel";
import ScaleLegend from "@/components/ScaleLegend";
import TokenRibbon from "@/components/TokenRibbon";
import { analyze, ApiError, getHealth, getModels } from "@/lib/api";
import { describeError, errorHint } from "@/lib/errors";
import { DEFAULT_TEXT } from "@/lib/examples";
import {
  METRIC_BY_KEY,
  METRICS,
  metricRange,
  type MetricKey,
} from "@/lib/metrics";
import { parseTokens, segmentBoundary } from "@/lib/tokens";
import type { AnalyzeResponse, ModelInfo } from "@/lib/types";
import { readView, syncUrl, viewToSearch, type ViewState } from "@/lib/url";

const DEFAULT_VIEW: ViewState = {
  text: DEFAULT_TEXT,
  model: "bert-base-uncased",
  layer: 0,
  head: 0,
  metric: "confidence_avg",
};

/** How long a wait may run before we explain what is taking so long. */
const WAKE_NOTICE_MS = 3000;

type Wake = "unknown" | "waking" | "ready" | "unreachable";

interface RequestKey {
  text: string;
  model: string;
  layer: number;
  head: number;
}

const keyOf = (r: RequestKey) => `${r.model}|${r.layer}|${r.head}|${r.text}`;

export default function Page() {
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const [draft, setDraft] = useState(DEFAULT_VIEW.text);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<{ message: string; hint: string | null } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [wake, setWake] = useState<Wake>("unknown");
  const [hovered, setHovered] = useState<Cell | null>(null);
  const [queryToken, setQueryToken] = useState(0);
  const [copied, setCopied] = useState(false);
  // The URL is the source of truth for the view, and it is only readable in
  // the browser. Nothing fires until it has been read, or the first paint
  // would fetch the defaults and then immediately fetch again.
  const [hydrated, setHydrated] = useState(false);

  // One forward pass per sentence is all the server needs, but each head is a
  // separate response. Remembering them makes clicking around the index
  // instant after the first visit.
  const cache = useRef(new Map<string, AnalyzeResponse>());
  const inFlight = useRef<AbortController | null>(null);
  const started = useRef(0);

  // Read the view out of the URL, then wake the Space and load the model list.
  useEffect(() => {
    const initial = readView(window.location.search, DEFAULT_VIEW);
    setView(initial);
    setDraft(initial.text);
    setHydrated(true);

    const controller = new AbortController();
    getHealth(controller.signal)
      .then(() => setWake("ready"))
      .catch(() => setWake("unreachable"));
    getModels(controller.signal)
      .then((response) => setModels(response.models))
      .catch(() => {});

    return () => controller.abort();
  }, []);

  const run = useCallback(async (request: RequestKey) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    const cached = cache.current.get(keyOf(request));
    if (cached) {
      setAnalysis(cached);
      setError(null);
      return;
    }

    setBusy(true);
    setError(null);
    setSlow(false);
    setElapsed(0);
    started.current = Date.now();

    try {
      let response: AnalyzeResponse;
      try {
        response = await analyze(request, controller.signal);
      } catch (cause) {
        // Switching to a smaller model can leave the selected head beyond the
        // new model's range. Fall back to the first head rather than showing
        // the user an error they did not cause.
        if (
          cause instanceof ApiError &&
          cause.status === 400 &&
          /out of range/i.test(cause.message)
        ) {
          response = await analyze(
            { ...request, layer: 0, head: 0 },
            controller.signal,
          );
          setView((current) => ({ ...current, layer: 0, head: 0 }));
        } else {
          throw cause;
        }
      }
      if (controller.signal.aborted) return;
      cache.current.set(keyOf(request), response);
      setAnalysis(response);
      setWake("ready");
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof ApiError) {
        const reachable = cause.kind !== "network";
        setError({
          message: describeError(cause),
          hint: errorHint(cause, reachable),
        });
        if (!reachable) setWake("unreachable");
      } else {
        setError({
          message: "The run stopped before it reached the service.",
          hint: "Reload the page and try again.",
        });
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, []);

  // The committed view is the request. Editing the sentence does not fire
  // anything; picking a head does.
  useEffect(() => {
    if (!hydrated || !view.text.trim()) return;
    void run({
      text: view.text,
      model: view.model,
      layer: view.layer,
      head: view.head,
    });
  }, [hydrated, view.text, view.model, view.layer, view.head, run]);

  useEffect(() => {
    if (hydrated) syncUrl(view);
  }, [hydrated, view]);

  // Honest waiting: a counter and an explanation, not a spinner that looks
  // like something has broken.
  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const tick = setInterval(() => {
      const seconds = Math.floor((Date.now() - started.current) / 1000);
      setElapsed(seconds);
      if (Date.now() - started.current > WAKE_NOTICE_MS) setSlow(true);
    }, 250);
    return () => clearInterval(tick);
  }, [busy]);

  const tokens = useMemo(
    () => (analysis ? parseTokens(analysis.tokens, analysis.segments) : []),
    [analysis],
  );

  const boundary = useMemo(
    () => segmentBoundary(analysis?.segments),
    [analysis?.segments],
  );

  // Reset the ribbon's query token whenever the sentence changes, landing on
  // the first real word rather than [CLS].
  useEffect(() => {
    const firstWord = tokens.findIndex((t) => t.kind !== "special");
    setQueryToken(firstWord === -1 ? 0 : firstWord);
  }, [tokens]);

  const matrix = analysis?.attention;

  const matrixMax = useMemo(() => {
    if (!matrix) return 0;
    let max = 0;
    for (const row of matrix) {
      for (const value of row) {
        if (value !== null && value > max) max = value;
      }
    }
    return max;
  }, [matrix]);

  const metric = METRIC_BY_KEY[view.metric];
  const range = useMemo(
    () => (analysis ? metricRange(analysis.metrics, view.metric) : null),
    [analysis, view.metric],
  );

  const activeRow = hovered?.row ?? queryToken;
  const ribbonWeights = matrix?.[activeRow] ?? [];
  const selectedMetrics = analysis?.metrics[view.layer]?.[view.head] ?? null;

  const readout = (() => {
    if (!analysis || !matrix) return null;
    if (hovered) {
      const weight = matrix[hovered.row]?.[hovered.col];
      const masked = analysis.is_causal && hovered.col > hovered.row;
      const from = tokens[hovered.row];
      const to = tokens[hovered.col];
      if (!from || !to) return null;
      if (masked) {
        return `${from.text} cannot see ${to.text} — it comes later in the sentence`;
      }
      return `${from.text} → ${to.text}  ${weight === null ? "—" : weight.toFixed(4)}`;
    }
    const from = tokens[queryToken];
    return from
      ? `Attention from ${from.text}. Hover any cell to read its weight.`
      : null;
  })();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${window.location.pathname}${viewToSearch(view)}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-6 sm:px-8 lg:px-12">
      <header className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 border-b border-rule pb-5">
        <div>
          {/* Set in the same monospace as the tokens: on this page every unit
              of language gets an equal cell, and the wordmark says so. */}
          <h1 className="font-display text-[15px] font-semibold tracking-[0.22em] text-ink">
            ATTENTION ATLAS
          </h1>
          <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-graphite">
            Every layer of a transformer holds a dozen attention heads, and each
            one reads the sentence differently. Pick one and see what it looks at.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-[12px] text-graphite">
            <span
              aria-hidden="true"
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                wake === "ready"
                  ? "bg-[#9f2f7f]"
                  : wake === "unreachable"
                    ? "bg-rule-strong"
                    : "pulse-soft bg-[#cd4071]"
              }`}
            />
            {/* The health ping tells us the service answers, which is not the
                same as a model being resident — saying "model ready" here
                would contradict the loading notice below it. */}
            {wake === "ready"
              ? "Service awake"
              : wake === "unreachable"
                ? "Service unreachable"
                : "Waking the service"}
          </span>
          {analysis && (
            <button
              type="button"
              onClick={copyLink}
              className="text-[12px] text-graphite underline decoration-rule-strong underline-offset-4 hover:text-ink"
            >
              {copied ? "Link copied" : "Copy link to this view"}
            </button>
          )}
        </div>
      </header>

      <section className="border-b border-rule py-8">
        <Composer
          text={draft}
          onTextChange={setDraft}
          model={view.model}
          onModelChange={(model) => setView((v) => ({ ...v, model }))}
          models={models}
          busy={busy}
          onSubmit={() => setView((v) => ({ ...v, text: draft.trim() }))}
        />
      </section>

      {error && (
        <section className="border-b border-rule py-6">
          <p className="eyebrow mb-2">Run stopped</p>
          <p className="max-w-2xl text-[15px] leading-relaxed text-ink">
            {error.message}
          </p>
          {error.hint && (
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-graphite">
              {error.hint}
            </p>
          )}
        </section>
      )}

      {busy && !analysis && (
        <section className="border-b border-rule py-10">
          <p className="eyebrow mb-3">Running</p>
          <p className="max-w-xl text-[15px] leading-relaxed text-ink">
            {slow
              ? "The model is waking up. The first run after a quiet spell loads the weights from scratch and can take up to a minute; every run after it is quick."
              : "Running the sentence through the model."}
          </p>
          <p className="tabular mt-2 text-[13px] text-graphite">{elapsed}s</p>
        </section>
      )}

      {!busy && !analysis && !error && (
        <section className="border-b border-rule py-10">
          <p className="max-w-xl text-[15px] leading-relaxed text-graphite">
            Write a sentence above, or pick one of the examples, and run it.
          </p>
        </section>
      )}

      {analysis && matrix && range && (
        <>
          <section className="border-b border-rule py-7">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              {/* "Attention from X" rather than "where X looks": the token
                  slots in without having to agree grammatically with anything
                  around it, which a determiner or a subword piece would not. */}
              <p className="eyebrow">
                Attention from{" "}
                <span className="font-data text-ink normal-case tracking-normal">
                  {tokens[activeRow]?.text ?? "—"}
                </span>
              </p>
              <p className="tabular text-[11px] text-graphite">
                layer {view.layer} · head {view.head}
              </p>
            </div>
            <div className="mt-3">
              <TokenRibbon
                tokens={tokens}
                weights={ribbonWeights}
                queryIndex={activeRow}
                boundary={boundary}
                onSelect={setQueryToken}
              />
            </div>
          </section>

          <div className="grid gap-10 py-8 lg:grid-cols-[minmax(280px,340px)_1fr] lg:gap-14">
            <aside className="min-w-0">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="eyebrow">Every head</h2>
                <span className="tabular text-[11px] text-graphite">
                  {analysis.n_layers} × {analysis.n_heads}
                </span>
              </div>

              <label htmlFor="metric" className="sr-only">
                Measure shading the index
              </label>
              <select
                id="metric"
                value={view.metric}
                onChange={(event) =>
                  setView((v) => ({ ...v, metric: event.target.value as MetricKey }))
                }
                className="mt-3 w-full rounded-[3px] border border-rule-strong bg-surface px-2.5 py-2 text-[13px] text-ink hover:border-ink focus:border-ink"
              >
                {METRICS.map((m) => (
                  <option key={m.key} value={m.key}>
                    Shade by {m.label.toLowerCase()}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[12px] leading-snug text-graphite">
                {metric.summary}
              </p>

              <div className="mt-4">
                <HeadIndex
                  grid={analysis.metrics}
                  metric={metric}
                  range={range}
                  layer={view.layer}
                  head={view.head}
                  onSelect={(layer, head) => setView((v) => ({ ...v, layer, head }))}
                />
              </div>

              <div className="mt-8">
                <h2 className="eyebrow mb-3">
                  Layer {view.layer}, head {view.head}
                </h2>
                <MetricsPanel
                  metrics={selectedMetrics}
                  layer={view.layer}
                  head={view.head}
                  hasCls={analysis.has_cls}
                  activeMetric={view.metric}
                />
              </div>

              <dl className="mt-8 space-y-2 border-t border-rule pt-4">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[13px] text-graphite">Layer drift</dt>
                  <dd className="tabular text-[13px] text-ink">
                    {analysis.flow_change?.toFixed(3) ?? "N/A"}
                  </dd>
                </div>
                <p className="text-[12px] leading-snug text-graphite">
                  How far the attention pattern moves between the first layer and
                  the last, on a scale that tops out near 0.833.
                </p>
              </dl>
            </aside>

            <main className="min-w-0">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="eyebrow">The head, token by token</h2>
                {busy && (
                  <span className="tabular text-[11px] text-graphite">
                    loading {elapsed}s
                  </span>
                )}
              </div>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-graphite">
                Each row is a token doing the looking; each column is a token
                being looked at. Hover a row to paint it onto the sentence above.
              </p>

              <div
                className={`mt-5 transition-opacity duration-150 ${
                  busy ? "opacity-50" : ""
                }`}
              >
                <Heatmap
                  matrix={matrix}
                  tokens={tokens}
                  isCausal={analysis.is_causal}
                  boundary={boundary}
                  max={matrixMax}
                  selectedRow={queryToken}
                  hovered={hovered}
                  onHover={setHovered}
                  onSelectRow={setQueryToken}
                />
              </div>

              <p
                aria-live="polite"
                className="font-data mt-4 min-h-[1.5rem] text-[13px] text-ink"
              >
                {readout}
              </p>

              <div className="mt-5 border-t border-rule pt-4">
                <ScaleLegend
                  max={matrixMax}
                  isCausal={analysis.is_causal}
                  hasSegments={boundary !== null}
                />
              </div>
            </main>
          </div>
        </>
      )}

      <footer className="border-t border-rule py-6">
        <p className="text-[12px] leading-relaxed text-graphite">
          Attention Atlas · built for research on interpretable language models.
          {analysis ? (
            <>
              {" "}
              These weights come from{" "}
              <span className="font-data">{analysis.model}</span> as it ran just
              now, not from a stored sample.
            </>
          ) : (
            " Every figure is computed live, not from a stored sample."
          )}
        </p>
      </footer>
    </div>
  );
}
