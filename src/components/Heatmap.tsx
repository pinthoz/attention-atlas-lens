"use client";

/**
 * The attention matrix, on canvas.
 *
 * WHY CANVAS AND NOT SVG
 * At the API's ceiling of 100 tokens this is a 100 x 100 grid: 10,000 cells.
 * In SVG that is 10,000 <rect> nodes, which React has to reconcile and the
 * browser has to lay out, paint and keep in the accessibility tree. SVG's two
 * real advantages are free hit-testing and free semantics, but the grid is
 * perfectly uniform, so hit-testing collapses to two divisions:
 *
 *     row = floor((y - marginTop) / cellSize)
 *
 * That is the entire "hover math you implement yourself" cost. SVG's main
 * advantage is worth almost nothing here, while its cost is real. Canvas
 * repaints the whole matrix in about a millisecond.
 *
 * The semantics argument is the one that deserves an answer rather than a
 * dismissal, because canvas genuinely is a black box to a screen reader. It
 * is answered outside this component: the token ribbon is real DOM text
 * carrying the selected row, the readout is an aria-live region, and the grid
 * is keyboard-navigable with arrow keys. The 12 x 12 head index next door
 * went the other way and is real DOM buttons, 144 nodes is cheap, and there
 * the focus and label machinery is worth having for free.
 *
 * Smoothness: cells are painted once into an offscreen canvas and blitted on
 * every pointer move, so hovering never repaints 10,000 rectangles.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { magma, PALETTE, rgbCss } from "@/lib/color";
import { axisLabel, type DisplayToken } from "@/lib/tokens";

export interface Cell {
  row: number;
  col: number;
}

interface HeatmapProps {
  matrix: (number | null)[][];
  tokens: DisplayToken[];
  isCausal: boolean;
  /** Index where segment B begins, or null. */
  boundary: number | null;
  /** Largest weight in the matrix; the top of the colour scale. */
  max: number;
  selectedRow: number;
  hovered: Cell | null;
  onHover: (cell: Cell | null) => void;
  onSelectRow: (row: number) => void;
}

const MIN_CELL = 4;
/**
 * Short sentences are the common case, so cells are allowed to grow well past
 * the size a 100-token matrix would get. Capped all the same: a 4 x 4 matrix
 * of enormous squares reads as decoration rather than data.
 */
const MAX_CELL = 44;
/** Below this, axis labels stop being legible and are dropped for the readout. */
const LABEL_THRESHOLD = 11;

/**
 * Canvas cannot resolve `var(--font-plex-mono)` in a font string, so read the
 * generated family name off the document and hand canvas a literal list.
 */
function monoFamily(): string {
  if (typeof window === "undefined") return "monospace";
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-plex-mono")
    .trim();
  return value ? `${value}, ui-monospace, monospace` : "ui-monospace, monospace";
}

export default function Heatmap({
  matrix,
  tokens,
  isCausal,
  boundary,
  max,
  selectedRow,
  hovered,
  onHover,
  onSelectRow,
}: HeatmapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(0);
  const [focusCell, setFocusCell] = useState<Cell | null>(null);
  // Axis labels are painted, not laid out, so a font arriving after the first
  // paint would leave them in the fallback face until something else redrew.
  const [fontsReady, setFontsReady] = useState(false);

  const n = matrix.length;

  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (n === 0 || width === 0) {
      return { cell: 0, marginLeft: 0, marginTop: 0, w: 0, h: 0, labels: false };
    }
    // Guess the label gutter from the longest token, then check whether cells
    // end up big enough for labels to be worth the space at all.
    const longest = tokens.reduce((a, t) => Math.max(a, axisLabel(t).length), 0);
    const provisional = Math.min(112, Math.max(44, longest * 6.6 + 12));
    const cellIfLabelled = Math.floor((width - provisional - 2) / n);
    const labels = cellIfLabelled >= LABEL_THRESHOLD;

    const marginLeft = labels ? provisional : 0;
    const marginTop = labels ? provisional : 0;
    const cell = Math.max(
      MIN_CELL,
      Math.min(MAX_CELL, Math.floor((width - marginLeft - 2) / n)),
    );
    return {
      cell,
      marginLeft,
      marginTop,
      w: marginLeft + cell * n,
      h: marginTop + cell * n,
      labels,
    };
  }, [n, width, tokens]);

  /** Diagonal hatch for the causal mask. No real value ever has texture. */
  const makeHatch = useCallback((ctx: CanvasRenderingContext2D) => {
    const tile = document.createElement("canvas");
    tile.width = 6;
    tile.height = 6;
    const t = tile.getContext("2d");
    if (!t) return null;
    t.fillStyle = PALETTE.surface;
    t.fillRect(0, 0, 6, 6);
    t.strokeStyle = PALETTE.lineStrong;
    t.lineWidth = 1;
    t.beginPath();
    t.moveTo(-1, 5);
    t.lineTo(5, -1);
    t.moveTo(1, 7);
    t.lineTo(7, 1);
    t.stroke();
    return ctx.createPattern(tile, "repeat");
  }, []);

  // Base layer: cells, mask, gridlines, axis labels, segment rule.
  useEffect(() => {
    const { cell, marginLeft, marginTop, w, h, labels } = layout;
    if (!cell || !w || !h) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const base = baseRef.current ?? document.createElement("canvas");
    baseRef.current = base;
    base.width = Math.round(w * dpr);
    base.height = Math.round(h * dpr);
    const ctx = base.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = PALETTE.surface;
    ctx.fillRect(0, 0, w, h);

    const hatch = makeHatch(ctx);

    for (let i = 0; i < n; i++) {
      const row = matrix[i];
      for (let j = 0; j < n; j++) {
        const x = marginLeft + j * cell;
        const y = marginTop + i * cell;

        // A causal model cannot see the future. Those cells are not a weight
        // of zero, they are a place where no weight exists. The API sends
        // them as 0, numerically identical to a genuine zero, so the mask has
        // to be derived structurally and drawn as something no value can be.
        if (isCausal && j > i) {
          if (hatch) {
            ctx.fillStyle = hatch;
            ctx.fillRect(x, y, cell, cell);
          }
          continue;
        }

        const value = row[j];
        ctx.fillStyle =
          value === null ? PALETTE.line : rgbCss(magma(max > 0 ? value / max : 0));
        ctx.fillRect(x, y, cell, cell);
      }
    }

    if (cell >= 9) {
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k <= n; k++) {
        const p = k * cell;
        ctx.moveTo(marginLeft + p + 0.5, marginTop);
        ctx.lineTo(marginLeft + p + 0.5, marginTop + n * cell);
        ctx.moveTo(marginLeft, marginTop + p + 0.5);
        ctx.lineTo(marginLeft + n * cell, marginTop + p + 0.5);
      }
      ctx.stroke();
    }

    if (boundary !== null) {
      // Annotation, not a value: this blue appears nowhere in magma, so the
      // line can never be mistaken for a weight.
      ctx.strokeStyle = PALETTE.mark;
      ctx.lineWidth = 2;
      const p = marginTop + boundary * cell;
      const q = marginLeft + boundary * cell;
      ctx.beginPath();
      ctx.moveTo(marginLeft, p);
      ctx.lineTo(marginLeft + n * cell, p);
      ctx.moveTo(q, marginTop);
      ctx.lineTo(q, marginTop + n * cell);
      ctx.stroke();
    }

    if (labels) {
      const size = Math.min(12, Math.max(9, cell - 3));
      ctx.font = `${size}px ${monoFamily()}`;
      ctx.textBaseline = "middle";

      for (let i = 0; i < n; i++) {
        const token = tokens[i];
        ctx.fillStyle = token.kind === "special" ? PALETTE.faint : PALETTE.muted;
        ctx.textAlign = "right";
        ctx.fillText(axisLabel(token), marginLeft - 8, marginTop + i * cell + cell / 2);

        ctx.save();
        ctx.translate(marginLeft + i * cell + cell / 2, marginTop - 8);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "left";
        ctx.fillText(axisLabel(token), 0, 0);
        ctx.restore();
      }
    }
  }, [layout, matrix, n, tokens, isCausal, boundary, max, makeHatch, fontsReady]);

  // Composite layer: blit the base, then draw the transient highlights.
  useEffect(() => {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    const { cell, marginLeft, marginTop, w, h } = layout;
    if (!canvas || !base || !cell) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(base, 0, 0, w, h);

    const strokeRow = (row: number, colour: string, lineWidth: number) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(
        marginLeft - lineWidth / 2,
        marginTop + row * cell - lineWidth / 2,
        n * cell + lineWidth,
        cell + lineWidth,
      );
    };

    // The pinned row, always visible so you never lose your place.
    strokeRow(selectedRow, "rgba(255,255,255,0.75)", 1.5);

    const active = hovered ?? focusCell;
    if (active) {
      strokeRow(active.row, "#ffffff", 2);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        marginLeft + active.col * cell - 0.5,
        marginTop - 0.5,
        cell + 1,
        n * cell + 1,
      );
    }

    if (focusCell) {
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        marginLeft + focusCell.col * cell - 1,
        marginTop + focusCell.row * cell - 1,
        cell + 2,
        cell + 2,
      );
    }
  }, [layout, selectedRow, hovered, focusCell, n]);

  const cellFromEvent = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): Cell | null => {
      const canvas = canvasRef.current;
      const { cell, marginLeft, marginTop } = layout;
      if (!canvas || !cell) return null;
      const rect = canvas.getBoundingClientRect();
      const col = Math.floor((event.clientX - rect.left - marginLeft) / cell);
      const row = Math.floor((event.clientY - rect.top - marginTop) / cell);
      if (row < 0 || col < 0 || row >= n || col >= n) return null;
      return { row, col };
    },
    [layout, n],
  );

  const moveFocus = useCallback(
    (dRow: number, dCol: number) => {
      setFocusCell((current) => {
        const from = current ?? { row: selectedRow, col: 0 };
        const next = {
          row: Math.min(n - 1, Math.max(0, from.row + dRow)),
          col: Math.min(n - 1, Math.max(0, from.col + dCol)),
        };
        onHover(next);
        return next;
      });
    },
    [n, selectedRow, onHover],
  );

  function handleKeyDown(event: React.KeyboardEvent<HTMLCanvasElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      moveFocus(move[0], move[1]);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (focusCell) onSelectRow(focusCell.row);
    }
  }

  return (
    <div ref={wrapRef} className="w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={`Attention matrix, ${n} by ${n} tokens. Use the arrow keys to move between cells and Enter to pin a row.`}
        className="max-w-full cursor-crosshair touch-none"
        onPointerMove={(event) => onHover(cellFromEvent(event))}
        onPointerLeave={() => onHover(null)}
        onPointerDown={(event) => {
          const cell = cellFromEvent(event);
          if (cell) {
            setFocusCell(cell);
            onSelectRow(cell.row);
          }
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setFocusCell(null)}
      />
    </div>
  );
}
