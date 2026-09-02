import type { ReactNode } from "react";
import Link from "next/link";

export function Section({
  children,
  className = "",
  tone = "paper",
}: {
  children: ReactNode;
  className?: string;
  tone?: "paper" | "soft" | "ink";
}) {
  const bg =
    tone === "ink" ? "hero-ink text-white" : tone === "soft" ? "bg-paper-soft" : "bg-paper";
  return (
    <section className={`${bg} ${className}`}>
      <div className="shell py-20 md:py-28">{children}</div>
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  intro,
  invert = false,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  invert?: boolean;
}) {
  return (
    <div className="max-w-2xl">
      {eyebrow ? (
        <p className={`eyebrow ${invert ? "text-brand-mint" : ""}`}>{eyebrow}</p>
      ) : null}
      <h2
        className={`mt-3 text-balance font-display text-3xl font-bold leading-tight tracking-tight md:text-[2.6rem] ${
          invert ? "text-white" : "text-ink"
        }`}
      >
        {title}
      </h2>
      {intro ? (
        <p
          className={`mt-4 text-lg leading-relaxed ${
            invert ? "text-white/65" : "text-neutralx-600"
          }`}
        >
          {intro}
        </p>
      ) : null}
    </div>
  );
}

export function Stat({
  value,
  label,
  invert = false,
}: {
  value: string;
  label: string;
  invert?: boolean;
}) {
  return (
    <div>
      <div
        className={`num font-display text-3xl font-bold md:text-4xl ${
          invert ? "text-brand-mint" : "text-brand-500"
        }`}
      >
        {value}
      </div>
      <div className={`mt-1 text-sm ${invert ? "text-white/60" : "text-neutralx-500"}`}>
        {label}
      </div>
    </div>
  );
}

export function CtaBand({
  title,
  body,
  primaryHref = "/register",
  primaryLabel = "Account aanmaken",
  secondaryHref = "/voor-bedrijven",
  secondaryLabel = "Voor bedrijven",
}: {
  title: string;
  body: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <section className="hero-ink text-white">
      <div className="shell py-20 md:py-24">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div className="max-w-xl">
            <h2 className="text-balance font-display text-3xl font-bold leading-tight md:text-4xl">
              {title}
            </h2>
            <p className="mt-3 text-lg text-white/65">{body}</p>
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-3">
            <Link href={primaryHref} className="btn-mint">
              {primaryLabel}
            </Link>
            <Link href={secondaryHref} className="btn-ghost-invert">
              {secondaryLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-hair border-y border-hair">
      {items.map((it) => (
        <details key={it.q} className="group py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-ink">
            {it.q}
            <span className="text-neutralx-400 transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-3 max-w-2xl text-[0.975rem] leading-relaxed text-neutralx-600">
            {it.a}
          </p>
        </details>
      ))}
    </div>
  );
}
