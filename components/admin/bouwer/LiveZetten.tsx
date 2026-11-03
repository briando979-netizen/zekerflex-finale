"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Versie } from "@/lib/bouwer/versie";
import type { Commit, GithubOverzicht, LiveHartslag, LiveStatus, LiveVerzoek } from "@/lib/bouwer/live";
import type { LiveMoment } from "@/lib/bouwer/geschiedenis";

// ---------------------------------------------------------------------------
// Live zetten — pane in de ZekerFlex AI-studio. Laat zien welke versie live
// staat, wat er nieuw is op GitHub main, en zet met één klik de nieuwste versie
// live via de live-zetter op de server (deploy/bouwer/zf-live.py). Database-
// wijzigingen gaan alleen mee na akkoord hier; een ongezonde nieuwe versie
// zet de server zelf terug.
// ---------------------------------------------------------------------------

interface Stand {
  live: Versie | null;
  github: GithubOverzicht | null;
  githubFout: string | null;
  status: LiveStatus | null;
  log: string[];
  verzoek: LiveVerzoek | null;
  agent: { leeft: boolean; hartslag: LiveHartslag | null };
  bezig: boolean;
  geschiedenis: LiveMoment[];
}

const STAAT: Record<LiveStatus["staat"], { label: string; kleur: string }> = {
  bezig: { label: "Bezig", kleur: "bg-[rgba(124,197,255,0.14)] text-[#7CC5FF]" },
  "wacht-op-akkoord": { label: "Wacht op akkoord", kleur: "bg-[rgba(255,196,107,0.14)] text-[#FFC46B]" },
  klaar: { label: "Klaar", kleur: "bg-[rgba(79,224,160,0.14)] text-brand-mint" },
  mislukt: { label: "Niet gelukt", kleur: "bg-[rgba(240,124,107,0.14)] text-[#F07C6B]" },
  teruggezet: { label: "Teruggezet", kleur: "bg-[rgba(255,196,107,0.14)] text-[#FFC46B]" },
};

function tijd(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const kort = (sha: string | undefined) => (sha ? sha.slice(0, 7) : "—");

export function LiveZetten() {
  const [stand, setStand] = useState<Stand | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [verstuurt, setVerstuurt] = useState(false);
  const [gezien, setGezien] = useState(false);
  const [destructiefOk, setDestructiefOk] = useState(false);
  const logRef = useRef<HTMLPreElement | null>(null);

  const laad = useCallback(async (vers = false) => {
    try {
      const res = await fetch(`/api/admin/bouwer/live${vers ? "?vers=1" : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Laden mislukt (${res.status})`);
      setStand((await res.json()) as Stand);
      setFout(null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Laden mislukt");
    }
  }, []);

  const actief = Boolean(stand?.bezig || stand?.verzoek);
  useEffect(() => {
    void laad();
  }, [laad]);
  useEffect(() => {
    const id = setInterval(() => void laad(), actief ? 3000 : 20_000);
    return () => clearInterval(id);
  }, [laad, actief]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [stand?.log]);

  // akkoord-vinkjes horen bij één wachtende uitrol
  const statusId = stand?.status?.id;
  useEffect(() => {
    setGezien(false);
    setDestructiefOk(false);
  }, [statusId]);

  const stuur = useCallback(
    async (body: Record<string, unknown>) => {
      setVerstuurt(true);
      try {
        const res = await fetch("/api/admin/bouwer/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } | string };
          const msg = typeof d.error === "string" ? d.error : d.error?.message;
          throw new Error(msg || `Mislukt (${res.status})`);
        }
        await laad();
      } catch (e) {
        setFout(e instanceof Error ? e.message : "Mislukt");
      } finally {
        setVerstuurt(false);
      }
    },
    [laad],
  );

  if (!stand) {
    return (
      <div className="grid flex-1 place-items-center text-xs text-white/40">
        {fout ? <p role="alert" className="text-[#F07C6B]">{fout}</p> : "Live-stand laden…"}
      </div>
    );
  }

  const { live, github, status, agent } = stand;
  const wacht = status?.staat === "wacht-op-akkoord" ? status : null;
  const destructief = wacht?.migraties.some((m) => m.destructief) ?? false;
  const upToDate = github?.vergelijking === "identical";
  const kanKlikken = agent.leeft && !actief && !verstuurt;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-[#0b0e13] p-4 text-sm">
      <div className="mx-auto w-full max-w-4xl space-y-4">
        {/* server-agent */}
        {!agent.leeft && (
          <div className="rounded-xl border border-[#FFC46B]/30 bg-[rgba(255,196,107,0.07)] p-4 text-xs leading-relaxed text-white/75">
            <p className="font-semibold text-[#FFC46B]">De live-zetter op de server reageert niet</p>
            <p className="mt-1">
              {agent.hartslag
                ? `Laatste teken van leven: ${tijd(agent.hartslag.op)}. Hij herstart normaal vanzelf binnen een minuut.`
                : "Hij is nog niet geïnstalleerd. Eenmalig op de server, in de projectmap:"}
            </p>
            {!agent.hartslag && (
              <code className="mt-2 block rounded-md bg-black/40 px-3 py-2 font-mono text-[11px] text-white/85">
                sudo bash deploy/bouwer/installeer-live.sh
              </code>
            )}
          </div>
        )}

        {/* versies */}
        <div className="grid gap-3 sm:grid-cols-2">
          <VersieKaart titel="Live nu" sha={live?.sha} onderwerp={live?.onderwerp ?? "Versie onbekend (oudere uitrol)"} datum={live?.datum} />
          <VersieKaart
            titel="Nieuwste op GitHub"
            sha={github?.main?.sha}
            onderwerp={github?.main?.onderwerp ?? (stand.githubFout ? `GitHub: ${stand.githubFout}` : "—")}
            datum={github?.main?.datum}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!kanKlikken}
            onClick={() => void stuur({ actie: "uitrollen" })}
            className="rounded-lg bg-brand-mint px-4 py-2 text-sm font-semibold text-ink transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {actief ? "Bezig met live zetten…" : upToDate ? "Opnieuw controleren" : "Zet nieuwste versie live"}
          </button>
          <button
            type="button"
            disabled={!kanKlikken}
            onClick={() => {
              if (window.confirm("De vorige versie terugzetten? Database-wijzigingen blijven staan.")) void stuur({ actie: "terug" });
            }}
            className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Vorige versie terugzetten
          </button>
          <button
            type="button"
            onClick={() => void laad(true)}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/50 hover:bg-white/5"
          >
            ↻ Vernieuwen
          </button>
          <span className="ml-auto text-[11px] text-white/40">
            {github?.vergelijking === "ahead" && `${github.aantalNieuw} nieuwe wijziging${github.aantalNieuw === 1 ? "" : "en"}`}
            {upToDate && "Live is up-to-date"}
            {(github?.vergelijking === "behind" || github?.vergelijking === "diverged") && "Live bevat iets dat niet op GitHub staat"}
          </span>
        </div>

        {fout && (
          <p role="alert" className="text-xs text-[#F07C6B]">
            {fout}
          </p>
        )}

        {stand.verzoek && (
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#7CC5FF]" />
            Verzoek ligt klaar, de server pakt het binnen enkele seconden op.
            <button type="button" onClick={() => void stuur({ actie: "intrekken" })} className="ml-auto text-white/45 underline hover:text-white/80">
              intrekken
            </button>
          </div>
        )}

        {/* status van de laatste uitrol */}
        {status && (
          <section className="rounded-xl border border-white/10 bg-[#0e1116] p-4" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STAAT[status.staat].kleur}`}>{STAAT[status.staat].label}</span>
              <span className="text-xs text-white/80">{status.stap}</span>
              <span className="ml-auto text-[11px] text-white/35">
                {status.actie === "terug" ? "terugzetten" : "uitrol"} door {status.door} · {tijd(status.begon)}
              </span>
            </div>
            {status.bericht && <p className="mt-2 text-xs leading-relaxed text-white/70">{status.bericht}</p>}
            {status.doel && (
              <p className="mt-1 font-mono text-[11px] text-white/35">
                doel {kort(status.doel)} · {status.doelOnderwerp}
              </p>
            )}

            {wacht && (
              <div className="mt-3 space-y-2">
                {wacht.migraties.map((m) => (
                  <details key={m.naam} className="rounded-lg border border-white/10 bg-black/30">
                    <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 font-mono text-[11px] text-white/80">
                      {m.destructief && <span className="rounded bg-[rgba(240,124,107,0.18)] px-1.5 py-0.5 font-sans text-[10px] font-semibold text-[#F07C6B]">verwijdert gegevens</span>}
                      {m.naam}
                    </summary>
                    <pre className="max-h-64 overflow-auto border-t border-white/10 px-3 py-2 font-mono text-[11px] leading-relaxed text-white/65">{m.sql || "(leeg)"}</pre>
                  </details>
                ))}
                <label className="flex items-center gap-2 text-xs text-white/75">
                  <input type="checkbox" checked={gezien} onChange={(e) => setGezien(e.target.checked)} />
                  Ik heb de database-wijzigingen bekeken
                </label>
                {destructief && (
                  <label className="flex items-center gap-2 text-xs text-[#F07C6B]">
                    <input type="checkbox" checked={destructiefOk} onChange={(e) => setDestructiefOk(e.target.checked)} />
                    Ik begrijp dat hierbij gegevens of kolommen verdwijnen (de nachtelijke back-up staat klaar)
                  </label>
                )}
                <button
                  type="button"
                  disabled={!kanKlikken || !gezien || (destructief && !destructiefOk)}
                  onClick={() =>
                    void stuur({ actie: "uitrollen", migraties: wacht.migraties.map((m) => m.naam), destructiefAkkoord: destructief && destructiefOk })
                  }
                  className="rounded-lg bg-[#FFC46B] px-4 py-2 text-xs font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Akkoord: toepassen en live zetten
                </button>
              </div>
            )}

            {status.kanForceren && !actief && (status.staat === "mislukt" || status.staat === "klaar") && (
              <button
                type="button"
                disabled={!kanKlikken}
                onClick={() => {
                  if (window.confirm("Toch de GitHub-versie live zetten? Wat alleen live staat en niet op GitHub, verdwijnt dan van de site."))
                    void stuur({ actie: "uitrollen", forceer: true });
                }}
                className="mt-3 rounded-lg border border-[#FFC46B]/40 px-3 py-1.5 text-xs text-[#FFC46B] hover:bg-[rgba(255,196,107,0.08)] disabled:opacity-40"
              >
                Toch live zetten
              </button>
            )}

            {stand.log.length > 0 && (
              <pre
                ref={logRef}
                className="mt-3 max-h-72 overflow-auto rounded-lg bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-white/60"
              >
                {stand.log.join("\n")}
              </pre>
            )}
          </section>
        )}

        {/* wat er nieuw is */}
        {github && github.nieuw.length > 0 && !upToDate && (
          <section className="rounded-xl border border-white/10 bg-[#0e1116]">
            <h3 className="border-b border-white/10 px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-white/40">
              {live ? "Nieuw sinds de live versie" : "Laatste wijzigingen op GitHub"}
              {github.nieuweMigraties.length > 0 && (
                <span className="ml-2 normal-case tracking-normal text-[#FFC46B]">
                  · {github.nieuweMigraties.length} database-wijziging{github.nieuweMigraties.length === 1 ? "" : "en"}
                </span>
              )}
            </h3>
            <ul className="divide-y divide-white/5">
              {github.nieuw.map((c) => (
                <CommitRij key={c.sha} c={c} />
              ))}
            </ul>
            {github.aantalNieuw > github.nieuw.length && (
              <p className="px-4 py-2 text-[11px] text-white/35">en nog {github.aantalNieuw - github.nieuw.length} oudere…</p>
            )}
          </section>
        )}

        {/* wat er eerder live stond (vastgelegd elke 30 minuten; dagoverzicht per mail na 18:00) */}
        {stand.geschiedenis.length > 1 && (
          <section className="rounded-xl border border-white/10 bg-[#0e1116]">
            <h3 className="border-b border-white/10 px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-white/40">Eerder live</h3>
            <ul className="divide-y divide-white/5">
              {stand.geschiedenis.map((m, i) => (
                <li key={m.sha} className="flex items-baseline gap-3 px-4 py-2">
                  <span className="font-mono text-[11px] text-white/35">{kort(m.sha)}</span>
                  <span className={`min-w-0 flex-1 truncate text-xs ${i === 0 ? "text-brand-mint" : "text-white/70"}`} title={m.onderwerp}>
                    {m.onderwerp}
                  </span>
                  <span className="flex-shrink-0 text-[11px] text-white/30">{i === 0 ? "nu live" : `live vanaf ${tijd(m.gezienOp)}`}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function VersieKaart({ titel, sha, onderwerp, datum }: { titel: string; sha: string | undefined; onderwerp: string; datum: string | undefined }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0e1116] p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">{titel}</p>
      <p className="mt-1 line-clamp-2 text-sm text-white/90">{onderwerp}</p>
      <p className="mt-1 font-mono text-[11px] text-white/35">
        {kort(sha)}
        {datum ? ` · ${tijd(datum)}` : ""}
      </p>
    </div>
  );
}

function CommitRij({ c }: { c: Commit }) {
  return (
    <li className="flex items-baseline gap-3 px-4 py-2">
      <span className="font-mono text-[11px] text-white/35">{kort(c.sha)}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-white/80" title={c.onderwerp}>
        {c.onderwerp}
      </span>
      <span className="flex-shrink-0 text-[11px] text-white/30">{tijd(c.datum)}</span>
    </li>
  );
}
