"use client";

import { useState, useRef } from "react";

const MAX = 10;

export function VaardighedenInput({ initial = [] }: { initial?: string[] }) {
  const [tags, setTags] = useState<string[]>(initial);
  const [invoer, setInvoer] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function voegToe() {
    const nieuw = invoer.trim();
    if (!nieuw || tags.length >= MAX || tags.some((t) => t.toLowerCase() === nieuw.toLowerCase())) {
      setInvoer("");
      return;
    }
    setTags((prev) => [...prev, nieuw]);
    setInvoer("");
    inputRef.current?.focus();
  }

  function verwijder(i: number) {
    setTags((prev) => prev.filter((_, idx) => idx !== i));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      voegToe();
    }
  }

  return (
    <div>
      {/* hidden input zodat de form de waarden meestuurt */}
      <input type="hidden" name="vaardigheden" value={tags.join(",")} />

      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700"
          >
            {tag}
            <button
              type="button"
              onClick={() => verwijder(i)}
              className="ml-0.5 text-brand-400 hover:text-brand-700"
              aria-label={`Verwijder ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {tags.length < MAX && (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={invoer}
            onChange={(e) => setInvoer(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={60}
            placeholder="Typ een vaardigheid en druk Enter"
            className="input flex-1 max-w-sm"
          />
          <button
            type="button"
            onClick={voegToe}
            disabled={!invoer.trim()}
            className="btn-ghost px-3 py-2 text-sm"
          >
            Toevoegen
          </button>
        </div>
      )}

      <p className="mt-1 text-xs text-neutralx-400">
        {tags.length}/{MAX} vaardigheden
      </p>
    </div>
  );
}
