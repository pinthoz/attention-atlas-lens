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

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AttentionSinks from "@/components/AttentionSinks";
import BiasDepth from "@/components/BiasDepth";
import BiasPanel from "@/components/BiasPanel";
import Controls from "@/components/Controls";
import DepthProfile from "@/components/DepthProfile";
import HeadIndex from "@/components/HeadIndex";
import HeadMap from "@/components/HeadMap";
import HeadRole from "@/components/HeadRole";
import SentenceFlow from "@/components/SentenceFlow";
import StrongestLinks from "@/components/StrongestLinks";
import Heatmap, { type Cell } from "@/components/Heatmap";
import MetricsPanel from "@/components/MetricsPanel";
import ScaleLegend from "@/components/ScaleLegend";
import TokenRibbon from "@/components/TokenRibbon";
import Faithfulness from "@/components/Faithfulness";
import {
  analyze,
  ApiError,
  detectBias,
  getHealth,
  getModels,
  testFaithfulness,
} from "@/lib/api";
import { describeError, errorHint } from "@/lib/errors";
import { DEFAULT_TEXT } from "@/lib/examples";
import { divergingCss } from "@/lib/color";
import {
  BIAS_SHADE,
  isMetricKey,
  METRIC_BY_KEY,
  METRICS,
  metricRange,
  ROLE_SHADE,
  type MetricKey,
  type ShadeKey,
} from "@/lib/metrics";
import { buildRoles, roleFrom } from "@/lib/roles";
import { parseTokens, segmentBoundary } from "@/lib/tokens";
import type {
  AnalyzeResponse,
  BiasResponse,
  FaithfulnessResponse,
  ModelInfo,
} from "@/lib/types";
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

type Wake = "unknown" | "ready" | "unreachable";

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
  // Which models the service currently holds in memory. Reported by
  // /api/health, refreshed after every successful run, and shown in the picker
  // so a slow or unavailable model is visible before it is chosen rather than
  // after it fails.
  const [loadedModels, setLoadedModels] = useState<string[]>([]);
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

  // Bias is a second forward pass through a different model, so it rides in
  // its own request and never blocks the attention view. It also depends only
  // on (text, model), clicking through heads must not refire it.
  const [bias, setBias] = useState<BiasResponse | null>(null);
  const [biasBusy, setBiasBusy] = useState(false);
  const [biasError, setBiasError] = useState<string | null>(null);
  const biasCache = useRef(new Map<string, BiasResponse>());
  const biasInFlight = useRef<AbortController | null>(null);

  // Faithfulness is the one thing on this page that never fires by itself: it
  // ablates a head at a time on top of the bias analysis, so it costs far more
  // than a view worth showing speculatively. It resets whenever the sentence or
  // model changes, because a stale result would be about a different run.
  const [faith, setFaith] = useState<FaithfulnessResponse | null>(null);
  const [faithBusy, setFaithBusy] = useState(false);
  const [faithError, setFaithError] = useState<string | null>(null);
  const [faithElapsed, setFaithElapsed] = useState(0);
  const faithStarted = useRef(0);

  // Head roles and sentence-level flow. Also (text, model)-only, and also
  // fetched apart from the main view: clustering needs the specialization
  // stage plus a t-SNE, which the attention matrix has no reason to wait for.
  // Sent without layer/head so the server omits the matrix it already gave us.
  const [details, setDetails] = useState<AnalyzeResponse | null>(null);
  const detailsCache = useRef(new Map<string, AnalyzeResponse>());
  const detailsInFlight = useRef<AbortController | null>(null);

  // Read the view out of the URL, then wake the Space and load the model list.
  useEffect(() => {
    const initial = readView(window.location.search, DEFAULT_VIEW);
    setView(initial);
    setDraft(initial.text);
    setHydrated(true);

    const controller = new AbortController();
    getHealth(controller.signal)
      .then((response) => {
        setWake("ready");
        setLoadedModels(response.models_loaded ?? []);
      })
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
      // A successful run just changed what is resident, and the service
      // evicts models under memory pressure, so the picker's marks are
      // refreshed rather than left at whatever was true on page load.
      getHealth()
        .then((health) => setLoadedModels(health.models_loaded ?? []))
        .catch(() => {});
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

  // Head roles + sentence flow, keyed on (text, model) only.
  useEffect(() => {
    if (!hydrated || !view.text.trim()) return;

    const key = `${view.model}|${view.text}`;
    const cached = detailsCache.current.get(key);
    if (cached) {
      setDetails(cached);
      return;
    }

    detailsInFlight.current?.abort();
    const controller = new AbortController();
    detailsInFlight.current = controller;
    setDetails(null);

    analyze(
      {
        text: view.text,
        model: view.model,
        include_clusters: true,
        include_isa: true,
      },
      controller.signal,
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        detailsCache.current.set(key, response);
        setDetails(response);
      })
      // Silent on failure: this is enrichment, and the attention view is
      // already complete without it. An error banner here would imply the
      // main result is in doubt when it is not.
      .catch(() => {});
  }, [hydrated, view.text, view.model]);

  // A faithfulness result describes one sentence and one model. When either
  // changes it is thrown away rather than left on screen looking current.
  useEffect(() => {
    setFaith(null);
    setFaithError(null);
    setFaithBusy(false);
  }, [view.text, view.model]);

  useEffect(() => {
    if (!faithBusy) return;
    const tick = setInterval(() => {
      setFaithElapsed(Math.floor((Date.now() - faithStarted.current) / 1000));
    }, 500);
    return () => clearInterval(tick);
  }, [faithBusy]);

  const runFaithfulness = useCallback(async () => {
    setFaithBusy(true);
    setFaithError(null);
    setFaithElapsed(0);
    faithStarted.current = Date.now();
    try {
      setFaith(await testFaithfulness({ text: view.text, model: view.model }));
    } catch (cause) {
      setFaithError(
        cause instanceof ApiError
          ? describeError(cause)
          : "The faithfulness test did not finish.",
      );
    } finally {
      setFaithBusy(false);
    }
  }, [view.text, view.model]);

  // Bias, keyed on (text, model) only.
  useEffect(() => {
    if (!hydrated || !view.text.trim()) return;

    const key = `${view.model}|${view.text}`;
    const cached = biasCache.current.get(key);
    if (cached) {
      setBias(cached);
      setBiasError(null);
      return;
    }

    biasInFlight.current?.abort();
    const controller = new AbortController();
    biasInFlight.current = controller;

    setBias(null);
    setBiasError(null);
    setBiasBusy(true);

    detectBias({ text: view.text, model: view.model }, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        biasCache.current.set(key, response);
        setBias(response);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setBiasError(
          cause instanceof ApiError
            ? describeError(cause)
            : "The bias check did not finish.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBiasBusy(false);
      });
  }, [hydrated, view.text, view.model]);

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

  // The role and bias shadings are not measurements, so they fall back to a
  // real definition for the aria labels and summary line while their colour
  // comes from elsewhere. Tested against isMetricKey rather than against the
  // known non-metric keys by name: listing them was how "bias" got missed and
  // took METRIC_BY_KEY[...] .label down with it.
  const metricKey: MetricKey = isMetricKey(view.metric)
    ? view.metric
    : "confidence_avg";
  const metric = METRIC_BY_KEY[metricKey];
  const range = useMemo(
    () => (analysis ? metricRange(analysis.metrics, metricKey) : null),
    [analysis, metricKey],
  );

  const clusters = details?.clusters;
  const biasGrid = bias?.metrics?.length ? bias.metrics : null;
  const shadeByRole = view.metric === ROLE_SHADE && Boolean(clusters);
  const shadeByBias = view.metric === BIAS_SHADE && Boolean(biasGrid);

  /** Categorical colour per cell when shading the index by head family. */
  const roleColorFor = useMemo(() => {
    if (!clusters) return undefined;
    const roles = buildRoles(clusters.map((c) => c.cluster_name));
    const byCell = new Map(
      clusters.map((c) => [`${c.layer}-${c.head}`, roleFrom(roles, c.cluster_name).color]),
    );
    return (l: number, h: number) => byCell.get(`${l}-${h}`) ?? null;
  }, [clusters]);

  /** Diverging colour per cell for the bias ratio, neutral at 1.0. */
  const biasColorFor = useMemo(() => {
    if (!biasGrid) return undefined;
    return (l: number, h: number) =>
      divergingCss(biasGrid[l]?.[h]?.bias_attention_ratio ?? null);
  }, [biasGrid]);

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
        return `${from.text} cannot see ${to.text}: it comes later in the sentence`;
      }
      return `${from.text} → ${to.text}  ${weight === null ? "-" : weight.toFixed(4)}`;
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-navy">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt=""
              width={32}
              height={32}
              className="rounded-lg"
              priority
            />
            {/* .sidebar h3 in the dashboard: 20px, 700, -0.5px tracking, pink. */}
            <span className="text-xl font-bold tracking-[-0.5px] text-brand">
              Attention Atlas Lens
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <span className="hidden items-center gap-2 text-xs text-faint sm:flex">
              <span
                aria-hidden="true"
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  wake === "ready"
                    ? "bg-emerald-400"
                    : wake === "unreachable"
                      ? "bg-slate-600"
                      : "pulse-soft bg-brand"
                }`}
              />
              {/* The health ping tells us the service answers, which is not the
                  same as a model being resident, saying "model ready" here
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
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-navy-text transition-colors hover:bg-white/10"
              >
                {copied ? "Link copied" : "Copy link"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-[-0.02em] text-ink">
            Look inside an attention head
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
            Every layer of a transformer holds a dozen attention heads, and each
            one reads the sentence differently. Pick one and see what it looks at.
          </p>
        </div>

        <Controls
          text={draft}
          onTextChange={setDraft}
          model={view.model}
          onModelChange={(model) => setView((v) => ({ ...v, model }))}
          models={models}
          loadedModels={loadedModels}
          busy={busy}
          onSubmit={() => setView((v) => ({ ...v, text: draft.trim() }))}
        />

        {error && (
          <div className="card border-brand-ring bg-brand-soft">
            <h2 className="card-title">Run stopped</h2>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink">
              {error.message}
            </p>
            {error.hint && (
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
                {error.hint}
              </p>
            )}
          </div>
        )}

        {busy && !analysis && (
          <div className="card">
            <h2 className="card-title">Running</h2>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">
              {slow
                ? "The model is waking up. The first run after a quiet spell loads the weights from scratch and can take up to a minute; every run after it is quick."
                : "Running the sentence through the model."}
            </p>
            <p className="tabular mt-2 text-[13px] text-faint">{elapsed}s</p>
          </div>
        )}

        {!busy && !analysis && !error && (
          <div className="card text-center">
            <p className="text-[15px] text-muted">
              Write a sentence above, or pick one of the examples, and run it.
            </p>
          </div>
        )}

        {analysis && matrix && range && (
          <>
            {/* The signature: a matrix row projected back onto the sentence. */}
            <section className="card">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                {/* "Attention from X" rather than "where X looks": the token
                    slots in without having to agree grammatically with
                    anything around it, which a determiner or a subword piece
                    would not. */}
                <h2 className="card-title">
                  Attention from{" "}
                  <span className="rounded-md bg-canvas px-1.5 py-0.5 font-mono text-[13px] font-normal text-brand-active ring-1 ring-line">
                    {tokens[activeRow]?.text ?? "-"}
                  </span>
                </h2>
                <span className="tabular text-xs text-faint">
                  layer {view.layer} · head {view.head}
                </span>
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

            {biasBusy && (
              <section className="card">
                <h2 className="card-title">Bias in this sentence</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">
                  Checking the sentence with the bias detector. It is a separate
                  model, so this arrives after the attention above.
                </p>
              </section>
            )}

            {biasError && (
              <section className="card">
                <h2 className="card-title">Bias in this sentence</h2>
                <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink">
                  {biasError}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">
                  The attention view above is unaffected.
                </p>
              </section>
            )}

            {bias && !biasBusy && (
              <div className="grid gap-6 xl:grid-cols-2">
                <BiasPanel
                  bias={bias}
                  layer={view.layer}
                  head={view.head}
                  onSelectHead={(layer, head) =>
                    setView((v) => ({ ...v, layer, head }))
                  }
                />
                {bias.tokens_biased.length > 0 && (
                  <BiasDepth
                    propagation={bias.propagation}
                    barThreshold={bias.bar_threshold}
                    layer={view.layer}
                    onSelectLayer={(l) => setView((v) => ({ ...v, layer: l }))}
                  />
                )}
                <div className="xl:col-span-2">
                  <Faithfulness
                    result={faith}
                    busy={faithBusy}
                    error={faithError}
                    elapsed={faithElapsed}
                    available={bias.tokens_biased.length > 0}
                    onRun={runFaithfulness}
                    layer={view.layer}
                    head={view.head}
                    onSelectHead={(l, h) =>
                      setView((v) => ({ ...v, layer: l, head: h }))
                    }
                  />
                </div>
              </div>
            )}

            {/* Columns stretch to the taller of the two, and the last card in
                each one grows to absorb the difference, so the row ends level
                instead of trailing off into blank page. */}
            <div className="grid gap-6 xl:grid-cols-[minmax(300px,360px)_1fr]">
              <div className="flex min-w-0 flex-col gap-6">
                <section className="card">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="card-title">Every head</h2>
                    <span className="tabular text-xs text-faint">
                      {analysis.n_layers} × {analysis.n_heads}
                    </span>
                  </div>

                  {/* The measure sits with the grid it shades, so the effect of
                      changing it is visible in the same glance. */}
                  <label htmlFor="metric" className="sr-only">
                    Measure shading the index
                  </label>
                  <select
                    id="metric"
                    value={view.metric}
                    onChange={(event) =>
                      setView((v) => ({
                        ...v,
                        metric: event.target.value as ShadeKey,
                      }))
                    }
                    className="field mt-3 w-full px-3 py-2 text-[13px]"
                  >
                    {METRICS.map((m) => (
                      <option key={m.key} value={m.key}>
                        Shade by {m.label.toLowerCase()}
                      </option>
                    ))}
                    {clusters && (
                      <option value={ROLE_SHADE}>Shade by head role</option>
                    )}
                    {biasGrid && (
                      <option value={BIAS_SHADE}>Shade by bias focus</option>
                    )}
                  </select>
                  <p className="mt-2 mb-4 text-xs leading-snug text-muted">
                    {shadeByRole
                      ? "Each colour is a behavioural family, not a value. The hues rank nothing."
                      : shadeByBias
                        ? "Attention to the flagged words. Grey is 1.0×, the share an even spread would give them."
                        : metric.summary}
                  </p>

                  <HeadIndex
                    grid={analysis.metrics}
                    metric={metric}
                    range={range}
                    layer={view.layer}
                    head={view.head}
                    onSelect={(layer, head) =>
                      setView((v) => ({ ...v, layer, head }))
                    }
                    colorFor={
                      shadeByRole
                        ? roleColorFor
                        : shadeByBias
                          ? biasColorFor
                          : undefined
                    }
                    caption={
                      shadeByRole
                        ? "Families come from clustering this run's head behaviour, so they describe this sentence and model."
                        : shadeByBias
                          ? "Blue is below 1.0×, orange above it. Grey means the head treats flagged words like any other."
                          : undefined
                    }
                  />
                </section>

                {clusters && (
                  <>
                    <HeadMap
                      clusters={clusters}
                      layer={view.layer}
                      head={view.head}
                      onSelectHead={(layer, head) =>
                        setView((v) => ({ ...v, layer, head }))
                      }
                    />
                    <HeadRole
                      clusters={clusters}
                      layer={view.layer}
                      head={view.head}
                      onSelectHead={(layer, head) =>
                        setView((v) => ({ ...v, layer, head }))
                      }
                    />
                  </>
                )}


                <section className="card">
                  <h2 className="card-title mb-4">
                    Layer {view.layer}, head {view.head}
                  </h2>
                  <MetricsPanel
                    metrics={selectedMetrics}
                    layer={view.layer}
                    head={view.head}
                    hasCls={analysis.has_cls}
                    activeMetric={view.metric}
                  />
                </section>

                {/* Last in this column, so it takes the slack. */}
                <section className="card card-fill flex-1">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="card-title">Layer drift</h2>
                    <span className="tabular text-sm font-medium text-ink">
                      {analysis.flow_change?.toFixed(3) ?? "N/A"}
                    </span>
                  </div>
                  <p className="mt-auto pt-2 text-xs leading-snug text-muted">
                    How far the attention pattern moves between the first layer
                    and the last, on a scale that tops out near 0.833.
                  </p>
                </section>
              </div>

              <div className="flex min-w-0 flex-col gap-6">
              <section className="card min-w-0">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="card-title">The head, token by token</h2>
                  {busy && (
                    <span className="tabular text-xs text-faint">
                      loading {elapsed}s
                    </span>
                  )}
                </div>
                <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted">
                  Each row is a token doing the looking; each column is a token
                  being looked at. Hover a row to paint it onto the sentence
                  above.
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
                  className="mt-4 min-h-[1.5rem] font-mono text-[13px] text-ink"
                >
                  {readout}
                </p>

                <div className="mt-5 border-t border-line pt-4">
                  <ScaleLegend
                    max={matrixMax}
                    isCausal={analysis.is_causal}
                    hasSegments={boundary !== null}
                  />
                </div>

              </section>

              <AttentionSinks
                matrix={matrix}
                tokens={tokens}
                isCausal={analysis.is_causal}
                onSelectToken={setQueryToken}
              />

              {/* In the wide column: a line chart squeezed into the 300px
                  sidebar loses the very trend it exists to show. */}
              <DepthProfile
                grid={analysis.metrics}
                metric={metric}
                layer={view.layer}
                onSelectLayer={(l) => setView((v) => ({ ...v, layer: l }))}
              />

              <StrongestLinks
                matrix={matrix}
                tokens={tokens}
                isCausal={analysis.is_causal}
                onSelectRow={setQueryToken}
              />
              </div>
            </div>

            {details?.isa && <SentenceFlow isa={details.isa} />}
          </>
        )}
      </main>

      <section className="mx-auto max-w-[1280px] px-4 pb-4 sm:px-6 lg:px-8">
        <div className="card">
          <h2 className="card-title">About Attention Atlas Lens</h2>
          <div className="mt-3 grid gap-6 text-[13px] leading-relaxed text-muted md:grid-cols-3">
            <div>
              <p className="mb-1.5 font-semibold text-ink">What you are seeing</p>
              <p>
                A transformer reads a sentence through many attention heads at
                once. Each head decides, for every word, how much of every other
                word to take in. This page runs the sentence through the model
                as you type it and shows those decisions directly. Nothing here
                is precomputed or cached from a sample run.
              </p>
            </div>
            <div>
              <p className="mb-1.5 font-semibold text-ink">Why it matters</p>
              <p>
                Attention is not an explanation on its own: a head can look at a
                word without that word driving the answer. It is evidence, and
                reading it carefully is the point. Where a number is undefined
                the page says so rather than showing a zero, and where a model
                cannot see a word the gap is drawn as a gap.
              </p>
            </div>
            <div>
              <p className="mb-1.5 font-semibold text-ink">The models</p>
              <p>
                <span className="font-mono text-ink">BERT</span> reads in both
                directions and carries a{" "}
                <span className="font-mono text-ink">[CLS]</span> summary token.{" "}
                <span className="font-mono text-ink">GPT-2</span> reads strictly
                left to right, so half its matrix is unreachable by
                construction. Bias labels come from GUS-Net, fine-tuned to mark
                generalisations, stereotypes and unfair framing.
              </p>
            </div>
          </div>

          <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-faint">
            This is the lens onto the full Attention Atlas dashboard, built for
            research on interpretable language models.
            {analysis ? (
              <>
                {" "}
                The figures above come from{" "}
                <span className="font-mono">{analysis.model}</span> as it ran
                just now.
              </>
            ) : null}
          </p>
        </div>
      </section>

      <footer className="mx-auto max-w-[1280px] px-4 pb-8 sm:px-6 lg:px-8">
        <p className="pt-2 text-xs leading-relaxed text-faint">
          Attention Atlas Lens · attention, head by head.
        </p>
      </footer>
    </div>
  );
}
