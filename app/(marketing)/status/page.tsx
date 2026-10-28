"use client";

import { useEffect, useState } from "react";

type State = "operational" | "degraded" | "down" | "unknown";

interface StatusPayload {
  checkedAt: string;
  overall: State;
  components: { key: string; label: string; state: State; latencyMs: number }[];
}

const TONE: Record<State, { dot: string; text: string; label: string }> = {
  operational: { dot: "bg-ok", text: "text-ok", label: "Operationeel" },
  degraded: { dot: "bg-warn", text: "text-warn", label: "Verminderd" },
  down: { dot: "bg-crit", text: "text-crit", label: "Storing" },
  unknown: { dot: "bg-neutralx-300", text: "text-neutralx-500", label: "Onbekend" },
};

export default function StatusPage() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as StatusPayload;
        if (alive) {
          setData(json);
          setErr(false);
        }
      } catch {
        if (alive) setErr(true);
      }
    };
    void load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const overall = data?.overall ?? "unknown";
  const tone = TONE[overall];

  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <p className="eyebrow text-brand-mint">Systeemstatus</p>
          <h1 className="mt-3 font-display text-3xl font-bold md:text-5xl">
            {err
              ? "Status tijdelijk niet op te halen"
              : overall === "operational"
                ? "Alle systemen operationeel"
                : overall === "degraded"
                  ? "Sommige systemen verminderd"
                  : overall === "unknown"
                    ? "Status wordt gecontroleerd"
                    : "We werken aan een storing"}
          </h1>
          <div className="mt-5 flex items-center gap-2.5 text-sm text-white/60" aria-live="polite">
            <span className={`h-2.5 w-2.5 rounded-full ${err ? "bg-warn" : tone.dot} animate-pulse-dot`} />
            {data
              ? `${err ? "Laatst succesvol gecontroleerd" : "Laatst gecontroleerd"} ${new Date(data.checkedAt).toLocaleTimeString("nl-NL")}`
              : err
                ? "Statuscontrole mislukt"
                : "Status controleren..."}
          </div>
        </div>
      </div>

      <section id="componenten" className="scroll-mt-24 bg-paper">
        <div className="shell py-16">
          <h2 className="font-display text-xl font-semibold">Componenten</h2>
          <div className="mt-6 overflow-hidden rounded-xl2 border border-hair">
            {(data?.components ?? PLACEHOLDER).map((c, i) => {
              const t = TONE[c.state];
              return (
                <div
                  key={c.key}
                  className={`flex items-center justify-between gap-4 px-5 py-4 ${
                    i > 0 ? "border-t border-hair" : ""
                  }`}
                >
                  <span className="font-medium text-ink">{c.label}</span>
                  <span className={`flex items-center gap-2 text-sm font-medium ${t.text}`}>
                    {c.latencyMs > 0 && (
                      <span className="num font-mono text-xs text-neutralx-400">
                        {c.latencyMs} ms
                      </span>
                    )}
                    <span className={`h-2 w-2 rounded-full ${t.dot}`} />
                    {t.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="verificaties" className="scroll-mt-24 bg-paper-soft">
        <div className="shell py-16">
          <h2 className="font-display text-xl font-semibold">Over deze status</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutralx-600">
            De componenten hierboven worden bij het openen en daarna elke 15 seconden gecontroleerd.
            Als de statusdienst niet bereikbaar is, tonen we de laatste succesvolle meting of geven
            we de status als onbekend weer.
          </p>
        </div>
      </section>
    </>
  );
}

const PLACEHOLDER: StatusPayload["components"] = [
  { key: "web", label: "Website & app", state: "unknown", latencyMs: 0 },
  { key: "database", label: "Database", state: "unknown", latencyMs: 0 },
  { key: "cache", label: "Realtime & wachtrijen", state: "unknown", latencyMs: 0 },
  { key: "payments", label: "Uitbetalingen (SEPA, niet automatisch gecontroleerd)", state: "unknown", latencyMs: 0 },
  { key: "assistant", label: "AI-assistent", state: "unknown", latencyMs: 0 },
  { key: "notifications", label: "Meldingen (push)", state: "unknown", latencyMs: 0 },
];
