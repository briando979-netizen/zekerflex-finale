"use client";

import { useMemo, useState } from "react";
import { dateTimeNl } from "@/lib/admin/format";
import { Avatar, Empty, Pill } from "@/components/admin/kit";

export interface ApplicationView {
  id: string;
  at: string;
  name: string;
  email: string;
  phone?: string;
  skills: string[];
  motivationText?: string;
  files: { kind: string; filename: string; uploadId?: string }[];
}

/** Lijst links, de sollicitatie rechts. Op de telefoon onder elkaar. */
export function ApplicationsBoard({ applications }: { applications: ApplicationView[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(applications[0]?.id ?? null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return applications;
    return applications.filter((a) => `${a.name} ${a.email} ${a.skills.join(" ")} ${a.motivationText ?? ""}`.toLowerCase().includes(q));
  }, [applications, query]);
  const current = applications.find((a) => a.id === selected) ?? null;

  if (applications.length === 0) {
    return (
      <section className="a-panel">
        <Empty title="Nog geen sollicitaties" body="Iedereen die via /over-ons een open sollicitatie instuurt, komt hier binnen." />
      </section>
    );
  }

  return (
    <section className="a-panel grid overflow-hidden lg:grid-cols-[22rem_1fr]">
      <div className="min-w-0 lg:border-r" style={{ borderColor: "var(--a-border)" }}>
        <div className="p-3" style={{ borderBottom: "1px solid var(--a-border)" }}>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek op naam, interesse of tekst" aria-label="Zoek in sollicitaties" className="a-input text-[0.8125rem]" />
        </div>
        <ul className="max-h-[32rem] overflow-y-auto">
          {shown.length === 0 && <li className="px-4 py-8 text-center text-xs" style={{ color: "var(--a-mute)" }}>Geen resultaten.</li>}
          {shown.map((a) => {
            const on = a.id === selected;
            return (
              <li key={a.id} style={{ borderBottom: "1px solid var(--a-border)" }}>
                <button
                  type="button"
                  onClick={() => setSelected(a.id)}
                  aria-current={on ? "true" : undefined}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--a-panel-2)]"
                  style={on ? { background: "var(--a-panel-2)", boxShadow: "inset 2px 0 0 var(--a-accent)" } : undefined}
                >
                  <Avatar name={a.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>{a.name}</span>
                    <span className="block truncate text-xs" style={{ color: "var(--a-mute)" }}>{a.skills.length > 0 ? a.skills.join(", ") : a.email}</span>
                  </span>
                  <span className="flex-shrink-0 text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>{dateTimeNl(a.at).split(",")[0]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="min-w-0 p-4 sm:p-6">
        {!current ? (
          <Empty title="Kies een sollicitatie" />
        ) : (
          <article>
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight" style={{ color: "var(--a-text)" }}>{current.name}</h2>
                <p className="mt-0.5 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
                  <a href={`mailto:${current.email}`} className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>{current.email}</a>
                  {current.phone ? <>, <a href={`tel:${current.phone}`} className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>{current.phone}</a></> : null}
                </p>
              </div>
              <span className="text-xs" style={{ color: "var(--a-mute)" }}>{dateTimeNl(current.at)}</span>
            </header>

            {current.skills.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-medium" style={{ color: "var(--a-mute)" }}>Interesse</p>
                <div className="flex flex-wrap gap-1.5">
                  {current.skills.map((s) => <Pill key={s} dot={false}>{s}</Pill>)}
                </div>
              </div>
            )}

            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium" style={{ color: "var(--a-mute)" }}>Motivatie</p>
              {current.motivationText ? (
                <p className="whitespace-pre-wrap rounded-lg p-3.5 text-[0.8125rem] leading-relaxed" style={{ background: "var(--a-panel-2)", color: "var(--a-text)" }}>{current.motivationText}</p>
              ) : (
                <p className="text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>Geen tekst meegestuurd.</p>
              )}
            </div>

            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium" style={{ color: "var(--a-mute)" }}>Bijlagen</p>
              {current.files.length === 0 ? (
                <p className="text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>Geen bijlagen.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {current.files.map((f, i) =>
                    f.uploadId ? (
                      <a key={i} href={`/api/admin/sollicitaties/${current.id}/${f.uploadId}`} className="a-button text-xs">
                        <span className="font-medium capitalize">{f.kind}</span>
                        <span className="max-w-[14rem] truncate font-normal" style={{ color: "var(--a-mute)" }}>{f.filename}</span>
                      </a>
                    ) : (
                      <span key={i} className="text-xs" style={{ color: "var(--a-mute)" }}>{f.kind}: {f.filename} (oud record, niet downloadbaar)</span>
                    ),
                  )}
                </div>
              )}
            </div>

            <p className="mt-5 font-mono text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>ref {current.id}</p>
          </article>
        )}
      </div>
    </section>
  );
}
