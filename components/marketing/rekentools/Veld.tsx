"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { trackEvent } from "@/components/analytics/AnalyticsBeacon";

/**
 * Reports once per page visit that someone actually used a rekentool, so
 * Admin → Analytics can tell readers from users. Only the tool name is sent,
 * never what was typed.
 */
export function useEersteGebruik(tool: string): () => void {
  const sent = useRef(false);
  return useCallback(() => {
    if (sent.current) return;
    sent.current = true;
    trackEvent("INTERACTION", `rekentool:${tool}`);
  }, [tool]);
}

// One labelled number field for the rekentools. Text + inputMode="decimal" so
// "15,50" works on every phone keyboard (type="number" rejects the comma in
// some browsers); lib/rekentools/invoer.ts parses it.
export function Veld({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  hint?: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="mt-1.5 flex items-center rounded-xl border border-hair bg-paper focus-within:outline focus-within:outline-2 focus-within:outline-brand-500">
        {prefix ? <span className="pl-4 text-neutralx-500" aria-hidden>{prefix}</span> : null}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="w-full min-w-0 bg-transparent px-3 py-2.5 text-base font-semibold text-ink outline-none"
        />
        {suffix ? <span className="whitespace-nowrap pr-4 text-sm text-neutralx-500">{suffix}</span> : null}
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs leading-relaxed text-neutralx-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Groep({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-hair bg-white p-5">
      <legend className="px-1 font-display text-base font-semibold text-ink">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
