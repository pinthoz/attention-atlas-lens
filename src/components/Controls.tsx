"use client";

/**
 * The one card that decides what runs: sentence, examples, model, go.
 *
 * The measure that shades the head index is deliberately not here, it lives
 * in the header of the card it affects, where you can see the grid change as
 * you pick it.
 */

import { useEffect, useRef } from "react";
import { MAX_CHARS } from "@/lib/api";
import { EXAMPLES } from "@/lib/examples";
import type { ModelInfo } from "@/lib/types";

interface ControlsProps {
  text: string;
  onTextChange: (text: string) => void;
  model: string;
  onModelChange: (model: string) => void;
  models: ModelInfo[];
  /** Model ids the service currently holds in memory; these answer instantly. */
  loadedModels: string[];
  busy: boolean;
  onSubmit: () => void;
}

export default function Controls({
  text,
  onTextChange,
  model,
  onModelChange,
  models,
  loadedModels,
  busy,
  onSubmit,
}: ControlsProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Grow with the content; a scrollbar inside a one-sentence field is a
  // needless thing to fight.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const bert = models.filter((m) => m.family === "bert");
  const gpt2 = models.filter((m) => m.family === "gpt2");
  const tooLong = text.length > MAX_CHARS;

  const ready = new Set(loadedModels);
  // "loaded" means resident in memory, so it answers immediately. Anything
  // else may need a disk load or a first-time download, which is where the
  // long waits (and the failures on a machine that cannot reach Hugging Face)
  // come from. The label states the fact and promises nothing about the rest.
  const optionLabel = (m: ModelInfo) =>
    ready.has(m.id) ? `${m.name}, loaded` : m.name;

  return (
    <div className="card">
      <label htmlFor="sentence" className="field-label mb-2">
        Sentence
      </label>

      <textarea
        ref={areaRef}
        id="sentence"
        value={text}
        rows={2}
        spellCheck={false}
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={(event) => {
          // Enter runs it; Shift+Enter is still a line break.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Type a sentence to look inside."
        className="field w-full resize-none px-3.5 py-3 text-[17px] leading-relaxed"
      />

      {tooLong && (
        <p className="mt-2 text-sm text-brand-active">
          That is {text.length.toLocaleString()} characters and the limit is{" "}
          {MAX_CHARS.toLocaleString()}. Shorten it and run again.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((example) => {
          const active = example.text === text;
          return (
            <button
              key={example.label}
              type="button"
              title={example.hint}
              onClick={() => onTextChange(example.text)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                active
                  ? "bg-brand text-white"
                  : "bg-canvas text-muted ring-1 ring-line hover:text-ink hover:ring-line-strong"
              }`}
            >
              {example.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <label htmlFor="model" className="field-label mb-1.5">
            Model
          </label>
          {/* A native select is as wide as its longest option, and the optgroup
              labels below are sentences. An explicit width keeps it from
              dragging the page past the viewport on a phone. */}
          <select
            id="model"
            value={model}
            onChange={(event) => onModelChange(event.target.value)}
            className="field w-full px-3 py-2 font-mono text-[13px] sm:w-64"
          >
            {!models.some((m) => m.id === model) && (
              <option value={model}>{model}</option>
            )}
            {bert.length > 0 && (
              <optgroup label="BERT (reads both directions)">
                {bert.map((m) => (
                  <option key={m.id} value={m.id}>
                    {optionLabel(m)}
                  </option>
                ))}
              </optgroup>
            )}
            {gpt2.length > 0 && (
              <optgroup label="GPT-2 (reads left to right)">
                {gpt2.map((m) => (
                  <option key={m.id} value={m.id}>
                    {optionLabel(m)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {!ready.has(model) && loadedModels.length > 0 && (
            <p className="mt-1.5 text-xs leading-snug text-muted">
              Not loaded yet, the first run fetches it, which can take a while.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || text.trim().length === 0 || tooLong}
          className="pill bg-brand px-8 py-2.5 text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-line-strong"
        >
          {busy ? "Running…" : "Run"}
        </button>
      </div>
    </div>
  );
}
