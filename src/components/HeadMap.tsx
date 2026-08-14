"use client";

/**
 * Every head placed by how it behaves, not by where it sits in the stack.
 *
 * The 12 x 12 index answers "where in the model is this head". This answers a
 * different question the index cannot: "which heads behave alike". Two heads
 * from opposite ends of the network land on top of each other here if they do
 * the same job.
 *
 * SVG rather than canvas, the opposite call from the attention matrix and for
 * the reasons that flip with the numbers: 144 marks is nothing to lay out, and
 * every one is a control that wants hover, focus and a click target.
 *
 * WHAT THE AXES ARE NOT: these are t-SNE coordinates. Distance carries
 * meaning, the axes do not, there is no "more x". Ticks and gridlines would
 * invite reading values off them, so there are none, and the caption says so.
 */

import { useState } from "react";
import { buildRoles, roleFrom, type RoleShape } from "@/lib/roles";
import type { HeadCluster } from "@/lib/types";

interface HeadMapProps {
  clusters: HeadCluster[];
  layer: number;
  head: number;
  onSelectHead: (layer: number, head: number) => void;
}

const W = 320;
const H = 260;
const PAD = 16;

/** Marks are drawn at a common visual weight rather than a common radius. */
function markPath(shape: RoleShape, x: number, y: number, r: number): string {
  switch (shape) {
    case "square":
      return `M${x - r},${y - r}h${r * 2}v${r * 2}h${-r * 2}Z`;
    case "triangle":
      return `M${x},${y - r * 1.2}L${x + r * 1.15},${y + r * 0.9}L${x - r * 1.15},${y + r * 0.9}Z`;
    case "diamond":
      return `M${x},${y - r * 1.3}L${x + r * 1.3},${y}L${x},${y + r * 1.3}L${x - r * 1.3},${y}Z`;
    case "cross": {
      const a = r * 0.42;
      const b = r * 1.25;
      return `M${x - a},${y - b}h${a * 2}v${b - a}h${b - a}v${a * 2}h${-(b - a)}v${b - a}h${-a * 2}v${-(b - a)}h${-(b - a)}v${-a * 2}h${b - a}Z`;
    }
    case "wedge":
      return `M${x},${y + r * 1.2}L${x + r * 1.15},${y - r * 0.9}L${x - r * 1.15},${y - r * 0.9}Z`;
    default:
      return "";
  }
}

export default function HeadMap({
  clusters,
  layer,
  head,
  onSelectHead,
}: HeadMapProps) {
  const [hovered, setHovered] = useState<HeadCluster | null>(null);

  const xs = clusters.map((c) => c.x);
  const ys = clusters.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const px = (v: number) => PAD + ((v - minX) / spanX) * (W - PAD * 2);
  const py = (v: number) => PAD + ((v - minY) / spanY) * (H - PAD * 2);

  // Families present, largest first, so the legend reads as a ranking too.
  const counts = new Map<string, number>();
  for (const c of clusters) {
    counts.set(c.cluster_name, (counts.get(c.cluster_name) ?? 0) + 1);
  }
  const families = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  // Slots are assigned from the family names present, so a name the pipeline
  // invents for this sentence still gets its own colour and shape.
  const roles = buildRoles(counts.keys());

  const active = hovered ?? clusters.find((c) => c.layer === layer && c.head === head);

  return (
    <section className="card">
      <h2 className="card-title">The map of heads</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Every head placed by how it behaves. Heads that do the same job sit
        together, however far apart they are in the stack.
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-4 w-full"
        role="img"
        aria-label={`Behavioural map of ${clusters.length} attention heads, grouped into ${families.length} families.`}
      >
        {clusters.map((c) => {
          const s = roleFrom(roles, c.cluster_name);
          const selected = c.layer === layer && c.head === head;
          const isHover = hovered === c;
          const r = selected || isHover ? 6 : 4;
          const x = px(c.x);
          const y = py(c.y);
          const label = `Layer ${c.layer}, head ${c.head}. ${c.cluster_name}.`;

          const common = {
            fill: s.color,
            // A 2px surface ring keeps overlapping marks legible where the
            // cloud is dense, which is most of it.
            stroke: selected ? "#1e293b" : "#ffffff",
            strokeWidth: selected ? 2 : 1.5,
            className: "cursor-pointer",
            onMouseEnter: () => setHovered(c),
            onMouseLeave: () => setHovered(null),
            onClick: () => onSelectHead(c.layer, c.head),
            tabIndex: selected ? 0 : -1,
            role: "button" as const,
            "aria-label": label,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectHead(c.layer, c.head);
              }
            },
          };

          return s.shape === "circle" || s.shape === "dot" ? (
            <circle
              key={`${c.layer}-${c.head}`}
              cx={x}
              cy={y}
              r={s.shape === "dot" ? r - 0.5 : r}
              {...common}
            >
              <title>{label}</title>
            </circle>
          ) : (
            <path key={`${c.layer}-${c.head}`} d={markPath(s.shape, x, y, r)} {...common}>
              <title>{label}</title>
            </path>
          );
        })}
      </svg>

      <p
        aria-live="polite"
        className="tabular mt-1 min-h-[1.25rem] text-center text-xs text-ink"
      >
        {active
          ? `L${active.layer}·H${active.head} · ${roleFrom(roles, active.cluster_name).short}`
          : ""}
      </p>

      {/* Labelled legend, not colour alone, required relief for the amber,
          and the only way shape reads as meaning something. */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3">
        {families.map(([name, count]) => {
          const s = roleFrom(roles, name);
          return (
            <li key={name} className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                {s.shape === "circle" || s.shape === "dot" ? (
                  <circle cx="6" cy="6" r={s.shape === "dot" ? 3.5 : 4.5} fill={s.color} />
                ) : (
                  <path d={markPath(s.shape, 6, 6, 4.5)} fill={s.color} />
                )}
              </svg>
              <span className="text-xs text-muted">{s.short}</span>
              <span className="tabular text-xs text-faint">{count}</span>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs leading-snug text-faint">
        Positions come from a t-SNE projection: how far apart two heads are
        means something, the directions do not. There is no scale to read off
        the edges, so none is drawn.
      </p>
    </section>
  );
}
