"use client";

/**
 * What kind of head this is, and how the families are spread across the model.
 *
 * The metrics panel next door says how concentrated a head is; this says what
 * it concentrates ON, which is the question most visitors actually arrive
 * with. The trait bars are the raw 0-1 scores rather than the z-scores, since
 * "0.9 of the way to the top" is readable without knowing the distribution.
 */

import { buildRoles, roleFrom, TRAITS } from "@/lib/roles";
import type { HeadCluster } from "@/lib/types";

interface HeadRoleProps {
  clusters: HeadCluster[];
  layer: number;
  head: number;
  onSelectHead: (layer: number, head: number) => void;
}

export default function HeadRole({
  clusters,
  layer,
  head,
  onSelectHead,
}: HeadRoleProps) {
  const current = clusters.find((c) => c.layer === layer && c.head === head);

  // How many heads fall in each family, biggest first.
  const counts = new Map<string, number>();
  for (const c of clusters) {
    counts.set(c.cluster_name, (counts.get(c.cluster_name) ?? 0) + 1);
  }
  const families = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const roles = buildRoles(counts.keys());
  const style = roleFrom(roles, current?.cluster_name);

  return (
    <section className="card">
      <h2 className="card-title">What this head does</h2>

      {current ? (
        <>
          <div className="mt-3 flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: style.color }}
            />
            <span className="text-[15px] font-semibold text-ink">
              {current.cluster_name}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {style.description}
          </p>

          {/*
           * These bars show the Z-SCORE, not the raw trait value, and that is
           * a correctness decision rather than a stylistic one. The raw scores
           * saturate: twelve of the 144 heads score a flat 1.0 on "meaning" in
           * a typical run, so a bar drawn from them reads "100%" for a head
           * that is barely above average, and flatly contradicts a family name
           * like Diffuse/Noise. The z-score says the thing a reader actually
           * wants, how unusual this head is next to the others in this run.
           */}
          <p className="mt-4 field-label">Compared with the other heads</p>
          <dl className="mt-2 space-y-2.5">
            {TRAITS.map((trait) => {
              const z = current.z_metrics?.[trait.key];
              const raw = current.metrics?.[trait.key];
              const known = typeof z === "number";
              // Clamped at 2.5σ: past that the bar would say "off the scale"
              // less clearly than the number beside it already does.
              const magnitude = known ? Math.min(Math.abs(z), 2.5) / 2.5 : 0;
              const above = known && z > 0;

              return (
                <div key={trait.key} title={trait.hint}>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[13px] text-muted">{trait.label}</dt>
                    <dd className="tabular text-xs text-ink">
                      {known
                        ? `${z > 0 ? "+" : ""}${z.toFixed(2)}σ`
                        : typeof raw === "number"
                          ? raw.toFixed(2)
                          : "N/A"}
                    </dd>
                  </div>
                  {/* Diverging from the centre: left is below the average
                      head, right is above it. */}
                  <div className="relative mt-1 h-1.5 w-full rounded-full bg-canvas">
                    <span
                      aria-hidden="true"
                      className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-line-strong"
                    />
                    <div
                      className="absolute top-0 bottom-0 rounded-full"
                      style={{
                        width: `${magnitude * 50}%`,
                        left: above ? "50%" : undefined,
                        right: above ? undefined : "50%",
                        backgroundColor: above ? style.color : "#cbd5e1",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </dl>
          <p className="mt-2 text-xs leading-snug text-faint">
            0σ is the average head in this run. The underlying scores saturate
            at 1.0, so this comparison is the more honest reading.
          </p>
        </>
      ) : (
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          No behavioural profile came back for layer {layer}, head {head}.
        </p>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <p className="field-label mb-2.5">Across all {clusters.length} heads</p>
        <ul className="space-y-1.5">
          {families.map(([name, count]) => {
            const s = roleFrom(roles, name);
            const active = name === current?.cluster_name;
            // Jump to the first head of a family, so a name in the list is a
            // way in rather than a statistic.
            const first = clusters.find((c) => c.cluster_name === name);
            return (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => first && onSelectHead(first.layer, first.head)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-canvas ${
                    active ? "bg-canvas" : ""
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span
                    className={`flex-1 truncate text-[13px] ${
                      active ? "font-medium text-ink" : "text-muted"
                    }`}
                  >
                    {name}
                  </span>
                  <span className="tabular text-xs text-faint">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs leading-snug text-faint">
          Families are found by clustering each head&apos;s behaviour in this
          run, so they describe this sentence and this model, not fixed labels
          the model was built with.
        </p>
      </div>
    </section>
  );
}
