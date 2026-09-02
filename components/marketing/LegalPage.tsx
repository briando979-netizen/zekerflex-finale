import type { ReactNode } from "react";

export function LegalPage({
  title,
  updated,
  intro,
  note,
  children,
}: {
  title: string;
  updated: string;
  intro?: string;
  /** Footer note. Pass `null` to hide the default demo notice. */
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <p className="eyebrow text-brand-mint">Juridisch</p>
          <h1 className="mt-3 font-display text-3xl font-bold md:text-4xl">{title}</h1>
          <p className="mt-3 font-mono text-xs text-white/50">Laatst bijgewerkt: {updated}</p>
          {intro && <p className="mt-5 max-w-2xl text-white/70">{intro}</p>}
        </div>
      </div>
      <section className="bg-paper">
        <div className="shell py-16">
          <div className="prose-legal max-w-2xl space-y-6 text-[0.975rem] leading-relaxed text-ink-soft">
            {children}
          </div>
          {note !== null && (
            <p className="mt-10 max-w-2xl rounded-xl border border-hair bg-paper-soft p-4 text-sm text-neutralx-600">
              {note ?? (
                <>
                  Vragen over dit document? Mail{" "}
                  <a href="mailto:info@zekerflex.com" className="text-brand-600 underline">
                    info@zekerflex.com
                  </a>
                  .
                </>
              )}
            </p>
          )}
        </div>
      </section>
    </>
  );
}

export function LegalSection({
  heading,
  body,
  list,
}: {
  heading?: string;
  body?: string;
  list?: string[];
}) {
  return (
    <div>
      {heading && <h2 className="font-display text-lg font-semibold text-ink">{heading}</h2>}
      {body && <p className={heading ? "mt-1.5" : ""}>{body}</p>}
      {list && list.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {list.map((li) => (
            <li key={li} className="flex gap-2.5">
              <span className="mt-0.5 flex-shrink-0 text-brand-mint">·</span>
              <span>{li}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
