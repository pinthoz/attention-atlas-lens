"use client";

/**
 * The sentence, and the controls that decide what runs.
 *
 * The input is set in the serif at reading size rather than boxed in a form
 * field: on this page the sentence is the specimen, and it should look like
 * language right up until the moment it becomes tokens.
 */

import { useEffect, useRef } from "react";
import { EXAMPLES } from "@/lib/examples";
import { MAX_CHARS } from "@/lib/api";
import type { ModelInfo } from "@/lib/types";

interface ComposerProps {
  text: string;
  onTextChange: (text: string) => void;
  model: string;
  onModelChange: (model: string) => void;
  models: ModelInfo[];
  busy: boolean;
  onSubmit: () => void;
}

export default function Composer({
  text,
  onTextChange,
  model,
  onModelChange,
  models,
  busy,
  onSubmit,
}: ComposerProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Grow with the content; a scrollbar inside a one-sentence field is a
  // needless thing to fight.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const bert = models.filter((m) => m.family === "bert");
  const gpt2 = models.filter((m) => m.family === "gpt2");
  const tooLong = text.length > MAX_CHARS;

  return (
    <div>
      <label htmlFor="sentence" className="eyebrow">
        Sentence
      </label>

      <textarea
        ref={areaRef}
        id="sentence"
        value={text}
        rows={1}
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
        className="font-language mt-2 w-full resize-none overflow-hidden border-b border-rule-strong bg-transparent pb-3 text-[clamp(1.35rem,3.4vw,2rem)] leading-snug font-light text-ink placeholder:text-graphite/60 focus:border-ink"
      />

      {tooLong && (
        <p className="mt-2 text-[13px] text-ink">
          That is {text.length.toLocaleString()} characters. The limit is{" "}
          {MAX_CHARS.toLocaleString()} — shorten it and run again.
        </p>
      )}

      <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-8">
        <div className="min-w-0 sm:flex-1">
          <p className="eyebrow mb-2">Or start from one of these</p>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => {
              const active = example.text === text;
              return (
                <button
                  key={example.label}
                  type="button"
                  title={example.hint}
                  onClick={() => onTextChange(example.text)}
                  className={`rounded-full border px-3 py-1 text-[13px] transition-colors duration-100 ${
                    active
                      ? "border-ink bg-ink text-surface"
                      : "border-rule-strong text-graphite hover:border-ink hover:text-ink"
                  }`}
                >
                  {example.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1 sm:flex-none">
            <label htmlFor="model" className="eyebrow">
              Model
            </label>
            {/* A native select is as wide as its longest option, and the
                optgroup labels below are sentences. Without an explicit width
                it drags the whole page past the viewport on a phone. */}
            <select
              id="model"
              value={model}
              onChange={(event) => onModelChange(event.target.value)}
              className="font-data mt-1.5 block w-full max-w-full rounded-[3px] border border-rule-strong bg-surface px-2.5 py-2 text-[13px] text-ink hover:border-ink focus:border-ink sm:w-[210px]"
            >
              {/* A value with no matching option makes a native select show
                  its first entry instead, quietly misreporting what is about
                  to run. Carry the unknown id as its own option. */}
              {!models.some((m) => m.id === model) && (
                <option value={model}>{model}</option>
              )}
              {bert.length > 0 && (
                <optgroup label="BERT — reads in both directions">
                  {bert.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {gpt2.length > 0 && (
                <optgroup label="GPT-2 — reads left to right only">
                  {gpt2.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || text.trim().length === 0 || tooLong}
            className="rounded-[3px] bg-ink px-5 py-2 text-[13px] font-medium text-surface transition-opacity duration-100 hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {busy ? "Running" : "Run"}
          </button>
        </div>
      </div>
    </div>
  );
}
