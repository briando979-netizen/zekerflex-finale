"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * Tabs for the homepage: one calm section instead of five long ones. Every
 * panel is server-rendered and stays in the HTML (inactive ones are `hidden`),
 * so search engines and AI crawlers still read all of it.
 */
export function HomeTabs({
  tabs,
  tone = "light",
}: {
  tabs: { id: string; label: string; hint?: string; content: ReactNode }[];
  tone?: "light" | "dark";
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  const base = useId();
  const dark = tone === "dark";
  return (
    <div>
      <div
        role="tablist"
        className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-full p-1 ${dark ? "bg-white/10" : "bg-white shadow-card ring-1 ring-hair"}`}
      >
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              id={`${base}-${t.id}-tab`}
              aria-selected={on}
              aria-controls={`${base}-${t.id}`}
              onClick={() => setActive(t.id)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300 sm:px-5 sm:py-2.5 ${
                on
                  ? dark
                    ? "bg-brand-mint text-ink shadow-glow"
                    : "bg-brand-500 text-white shadow-glow"
                  : dark
                    ? "text-white/70 hover:text-white"
                    : "text-neutralx-600 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-${t.id}`}
          aria-labelledby={`${base}-${t.id}-tab`}
          hidden={t.id !== active}
          className="mt-10 animate-slide-up-fade"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
