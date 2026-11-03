"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Taak, TaakKort, TaakStaat, TaakStap } from "@/lib/bouwer/werker";
import { VoorbeeldPaneel } from "@/components/admin/bouwer/VoorbeeldPaneel";

// ---------------------------------------------------------------------------
// Bouwer — pane in de ZekerFlex AI-studio. Geef een opdracht in gewone taal; de
// AI-programmeur op de server (deploy/bouwer/werker) zoekt, wijzigt en
// controleert in een eigen kopie, en je kijkt live mee. Daarna zie je precies
// welke regels veranderen en kies je: goedkeuren (en live zetten), bijsturen
// of weggooien. Zonder goedkeuring komt er niets op GitHub of live.
// ---------------------------------------------------------------------------

interface Overzicht {
  geinstalleerd: boolean;
  online: boolean;
  bezig: string | null;
  taken: TaakKort[];
  instellingen: { model: string; modelGekozen: boolean; githubSleutel: boolean };
}

type Detail = Taak & { live?: "gestart" | "bezig" | null };

const STAAT: Record<TaakStaat, { label: string; kleur: string }> = {
  bezig: { label: "Aan het werk", kleur: "bg-[rgba(124,197,255,0.14)] text-[#7CC5FF]" },
  klaar: { label: "Klaar voor jouw oordeel", kleur: "bg-[rgba(79,224,160,0.14)] text-brand-mint" },
  mislukt: { label: "Niet gelukt", kleur: "bg-[rgba(240,124,107,0.14)] text-[#F07C6B]" },
  conflict: { label: "Botst met main", kleur: "bg-[rgba(255,196,107,0.14)] text-[#FFC46B]" },
  goedkeuren: { label: "Naar GitHub…", kleur: "bg-[rgba(124,197,255,0.14)] text-[#7CC5FF]" },
  gepusht: { label: "Op GitHub", kleur: "bg-[rgba(79,224,160,0.14)] text-brand-mint" },
  weggegooid: { label: "Weggegooid", kleur: "bg-white/10 text-white/50" },
};

const STAP_TEKEN: Record<TaakStap["soort"], string> = { info: "·", denk: "💭", tool: "⚙", bestand: "✎", fout: "!", klaar: "✓" };

const GITHUB = "https://github.com/briando979-netizen/zekerflex-finale";

function tijd(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" });
}

async function verstuur<T>(url: string, method: "POST" | "PUT", body: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } | string };
  if (!res.ok) {
    const msg = typeof d.error === "string" ? d.error : d.error?.message;
    throw new Error(msg || `Mislukt (${res.status})`);
  }
  return d;
}

export function Bouwer({ onLiveZetten }: { onLiveZetten?: () => void } = {}) {
  const [overzicht, setOverzicht] = useState<Overzicht | null>(null);
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [opdracht, setOpdracht] = useState("");
  const [bijsturing, setBijsturing] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [bezigMet, setBezigMet] = useState<string | null>(null);
  const [instellingenOpen, setInstellingenOpen] = useState(false);

  const laadOverzicht = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/bouwer/taken", { cache: "no-store" });
      if (!res.ok) throw new Error(`Laden mislukt (${res.status})`);
      const d = (await res.json()) as Overzicht;
      setOverzicht(d);
      setGekozen((g) => g ?? d.taken[0]?.id ?? null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Laden mislukt");
    }
  }, []);

  const laadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/bouwer/taken/${id}`, { cache: "no-store" });
      if (res.ok) setDetail((await res.json()) as Detail);
    } catch {
      /* volgende peiling */
    }
  }, []);

  useEffect(() => {
    void laadOverzicht();
    const id = setInterval(() => void laadOverzicht(), 10_000);
    return () => clearInterval(id);
  }, [laadOverzicht]);

  const werkt = detail?.staat === "bezig" || detail?.staat === "goedkeuren";
  useEffect(() => {
    if (!gekozen) return;
    void laadDetail(gekozen);
    const id = setInterval(() => void laadDetail(gekozen), werkt ? 2000 : 15_000);
    return () => clearInterval(id);
  }, [gekozen, werkt, laadDetail]);

  const actie = useCallback(
    async (naam: string, fn: () => Promise<unknown>) => {
      setBezigMet(naam);
      setFout(null);
      try {
        await fn();
        await laadOverzicht();
        if (gekozen) await laadDetail(gekozen);
      } catch (e) {
        setFout(e instanceof Error ? e.message : "Mislukt");
      } finally {
        setBezigMet(null);
      }
    },
    [gekozen, laadDetail, laadOverzicht],
  );

  const start = () =>
    actie("start", async () => {
      const t = await verstuur<TaakKort>("/api/admin/bouwer/taken", "POST", { opdracht });
      setOpdracht("");
      setGekozen(t.id);
    });

  const taakActie = (naam: string, body: Record<string, unknown>) =>
    actie(naam, () => verstuur(`/api/admin/bouwer/taken/${gekozen}`, "POST", body));

  if (!overzicht) {
    return <div className="grid flex-1 place-items-center text-xs text-white/40">{fout ?? "Bouwer laden…"}</div>;
  }

  const openTaak = overzicht.taken.find((t) => ["bezig", "klaar", "mislukt", "conflict", "goedkeuren"].includes(t.staat));
  const kanStarten = overzicht.online && !overzicht.bezig && !openTaak && opdracht.trim().length >= 5 && !bezigMet;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#0b0e13] text-sm lg:flex-row">
      {/* links: nieuwe opdracht + lijst */}
      <aside className="flex w-full flex-shrink-0 flex-col border-b border-white/10 bg-[#0c0f15] lg:w-80 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-[11px]">
          <span className={`h-2 w-2 rounded-full ${overzicht.online ? "bg-brand-mint" : "bg-[#F07C6B]"}`} />
          <span className="text-white/60">{overzicht.online ? (overzicht.bezig ? "Bouwer is aan het werk" : "Bouwer staat klaar") : "Bouwer offline"}</span>
          <button type="button" onClick={() => setInstellingenOpen((o) => !o)} className="ml-auto text-white/45 hover:text-white/80" aria-expanded={instellingenOpen}>
            instellingen
          </button>
        </div>

        {instellingenOpen && <Instellingen onOpgeslagen={() => void laadOverzicht()} />}

        {!overzicht.geinstalleerd && (
          <p className="m-3 rounded-lg border border-[#FFC46B]/30 bg-[rgba(255,196,107,0.07)] p-3 text-[11px] leading-relaxed text-white/70">
            De Bouwer is nog niet geïnstalleerd op de server. Eenmalig, in de projectmap op de server:
            <code className="mt-1 block font-mono text-white/85">sudo bash deploy/bouwer/installeer-bouwer.sh</code>
          </p>
        )}

        <div className="space-y-2 p-3">
          <label htmlFor="bouwer-opdracht" className="text-[10px] uppercase tracking-[0.16em] text-white/40">
            Nieuwe opdracht
          </label>
          <textarea
            id="bouwer-opdracht"
            value={opdracht}
            onChange={(e) => setOpdracht(e.target.value)}
            rows={4}
            placeholder="Bv. Zet op de prijzenpagina onder de tabel een veelgestelde vraag over opzegtermijnen."
            className="w-full resize-y rounded-lg border border-white/15 bg-[#0b0e13] p-2.5 text-xs text-white placeholder:text-white/30 focus:border-brand-mint focus:outline-none"
          />
          <button
            type="button"
            disabled={!kanStarten}
            onClick={() => void start()}
            className="w-full rounded-lg bg-brand-mint px-3 py-2 text-xs font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            {bezigMet === "start" ? "Starten…" : "Bouw dit"}
          </button>
          {openTaak && !overzicht.bezig && (
            <p className="text-[11px] text-white/45">Rond eerst de open opdracht af: goedkeuren, bijsturen of weggooien.</p>
          )}
          <p className="text-[10px] leading-relaxed text-white/30">
            Model: {overzicht.instellingen.model}. De Bouwer wijzigt geen database, pakketten, beveiliging of uitrol-scripts.
          </p>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto border-t border-white/10">
          {overzicht.taken.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setGekozen(t.id)}
                className={`w-full border-b border-white/5 px-3 py-2 text-left transition ${gekozen === t.id ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"}`}
              >
                <span className="line-clamp-2 text-xs text-white/80">{t.opdracht}</span>
                <span className="mt-1 flex items-center gap-2 text-[10px] text-white/35">
                  <span className={`rounded-full px-1.5 py-px ${STAAT[t.staat].kleur}`}>{STAAT[t.staat].label}</span>
                  {tijd(t.begon)}
                </span>
              </button>
            </li>
          ))}
          {overzicht.taken.length === 0 && <li className="px-3 py-4 text-[11px] text-white/30">Nog geen opdrachten.</li>}
        </ul>
      </aside>

      {/* rechts: de gekozen opdracht */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4">
        {fout && (
          <p role="alert" className="mb-3 rounded-lg bg-[rgba(240,124,107,0.1)] px-3 py-2 text-xs text-[#F07C6B]">
            {fout}
          </p>
        )}
        {!detail ? (
          <p className="m-auto max-w-sm text-center text-xs leading-relaxed text-white/40">
            Geef links een opdracht in gewone taal. Je ziet hier live wat de Bouwer doet, en daarna precies welke regels veranderen.
          </p>
        ) : (
          <TaakDetail
            taak={detail}
            bezigMet={bezigMet}
            bijsturing={bijsturing}
            setBijsturing={setBijsturing}
            githubSleutel={overzicht.instellingen.githubSleutel}
            onActie={(naam, body) => void taakActie(naam, body).then(() => naam === "bijsturen" && setBijsturing(""))}
            {...(onLiveZetten ? { onLiveZetten } : {})}
          />
        )}
      </section>
    </div>
  );
}

function TaakDetail({
  taak,
  bezigMet,
  bijsturing,
  setBijsturing,
  githubSleutel,
  onActie,
  onLiveZetten,
}: {
  taak: Detail;
  bezigMet: string | null;
  bijsturing: string;
  setBijsturing: (v: string) => void;
  githubSleutel: boolean;
  onActie: (naam: string, body: Record<string, unknown>) => void;
  onLiveZetten?: () => void;
}) {
  const stappenRef = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    const el = stappenRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [taak.stappen.length]);

  const werkt = taak.staat === "bezig" || taak.staat === "goedkeuren";
  const open = ["klaar", "mislukt", "conflict"].includes(taak.staat);
  // een goedkeuring die halverwege misliep (bv. push), mag opnieuw
  const kanGoedkeuren = taak.staat === "klaar" || (taak.staat === "mislukt" && Boolean(taak.goedgekeurdDoor));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STAAT[taak.staat].kleur}`}>{STAAT[taak.staat].label}</span>
          <span className="text-[11px] text-white/35">
            {taak.door} · {tijd(taak.begon)} · {taak.model}
          </span>
          {werkt && taak.staat === "bezig" && (
            <button type="button" onClick={() => onActie("stop", { actie: "stop" })} className="ml-auto rounded-md border border-white/15 px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/10">
              Stop
            </button>
          )}
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-white/90">{taak.opdracht}</p>
      </header>

      {/* live meekijken */}
      <ol ref={stappenRef} aria-live="polite" className="max-h-80 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-[#0e1116] p-3 font-mono text-[11px] leading-relaxed">
        {taak.stappen.map((s, i) => (
          <li key={i} className={s.soort === "fout" ? "text-[#F07C6B]" : s.soort === "denk" ? "whitespace-pre-wrap font-sans text-xs text-white/80" : s.soort === "klaar" ? "text-brand-mint" : "text-white/55"}>
            <span className="mr-2 inline-block w-4 text-center text-white/30">{STAP_TEKEN[s.soort]}</span>
            {s.tekst}
          </li>
        ))}
        {werkt && <li className="animate-pulse text-white/35">…</li>}
      </ol>

      {taak.fout && taak.staat !== "bezig" && <p className="whitespace-pre-wrap rounded-lg bg-[rgba(240,124,107,0.08)] px-3 py-2 text-xs text-[#F07C6B]">{taak.fout}</p>}

      {taak.samenvatting && (
        <div className="rounded-xl border border-brand-mint/20 bg-[rgba(79,224,160,0.05)] p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-brand-mint/70">Wat de Bouwer deed</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-white/85">{taak.samenvatting}</p>
          {taak.commitbericht && <p className="mt-2 font-mono text-[11px] text-white/40">{taak.commitbericht}</p>}
        </div>
      )}

      {open && !werkt && <VoorbeeldPaneel />}

      {taak.controle && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          <ControleChip label="TypeScript" ok={taak.controle.tsc.ok} uit={taak.controle.tsc.uit} />
          <ControleChip label="eslint" ok={taak.controle.eslint.ok} uit={taak.controle.eslint.uit} />
          {taak.controle.tests && <ControleChip label="tests" ok={taak.controle.tests.ok} uit={taak.controle.tests.uit} />}
        </div>
      )}

      {/* beslissen */}
      {kanGoedkeuren && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-[#0e1116] p-3">
          {!githubSleutel && <p className="text-[11px] text-[#FFC46B]">Vul eerst bij instellingen een GitHub-sleutel in, dan kan de Bouwer zijn werk naar GitHub zetten.</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!githubSleutel || Boolean(bezigMet) || !taak.controle?.ok}
              onClick={() => onActie("goedkeuren", { actie: "goedkeuren", liveZetten: true })}
              className="rounded-lg bg-brand-mint px-4 py-2 text-xs font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              {taak.staat === "mislukt" ? "Opnieuw proberen en live zetten" : "Goedkeuren en live zetten"}
            </button>
            <button
              type="button"
              disabled={!githubSleutel || Boolean(bezigMet) || !taak.controle?.ok}
              onClick={() => onActie("goedkeuren", { actie: "goedkeuren", liveZetten: false })}
              className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/75 hover:bg-white/10 disabled:opacity-40"
            >
              Alleen naar GitHub
            </button>
          </div>
          {!taak.controle?.ok && <p className="text-[11px] text-white/45">Goedkeuren kan pas als TypeScript, eslint en de tests schoon zijn. Stuur bij of gooi weg.</p>}
        </div>
      )}

      {open && (
        <div className="flex flex-wrap items-start gap-2">
          <textarea
            value={bijsturing}
            onChange={(e) => setBijsturing(e.target.value)}
            rows={2}
            placeholder="Bijsturen: wat moet er anders?"
            aria-label="Bijsturing"
            className="min-w-[220px] flex-1 resize-y rounded-lg border border-white/15 bg-[#0b0e13] p-2 text-xs text-white placeholder:text-white/30 focus:border-brand-mint focus:outline-none"
          />
          <button
            type="button"
            disabled={bijsturing.trim().length < 2 || Boolean(bezigMet)}
            onClick={() => onActie("bijsturen", { actie: "bijsturen", bericht: bijsturing })}
            className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/75 hover:bg-white/10 disabled:opacity-40"
          >
            Bijsturen
          </button>
          <button
            type="button"
            disabled={Boolean(bezigMet)}
            onClick={() => {
              if (window.confirm("Deze wijziging weggooien? Er gaat niets naar GitHub.")) onActie("weggooien", { actie: "weggooien" });
            }}
            className="rounded-lg px-3 py-2 text-xs text-[#F07C6B]/80 hover:bg-[rgba(240,124,107,0.08)] disabled:opacity-40"
          >
            Weggooien
          </button>
        </div>
      )}

      {taak.staat === "gepusht" && taak.sha && (
        <p className="text-xs text-white/70">
          Op GitHub als{" "}
          <a href={`${GITHUB}/commit/${taak.sha}`} target="_blank" rel="noreferrer" className="font-mono text-brand-mint underline">
            {taak.sha.slice(0, 7)}
          </a>
          .{" "}
          {taak.liveZetten ? "De live-zetter is gestart" : "Nog niet live"}
          {onLiveZetten && (
            <>
              {" — "}
              <button type="button" onClick={onLiveZetten} className="text-brand-mint underline">
                bekijk Live zetten
              </button>
            </>
          )}
        </p>
      )}

      <Wijzigingen diff={taak.diff} bestanden={taak.bestanden} />
    </div>
  );
}

function ControleChip({ label, ok, uit }: { label: string; ok: boolean; uit: string }) {
  return (
    <details className={`rounded-lg px-2.5 py-1 ${ok ? "bg-[rgba(79,224,160,0.1)] text-brand-mint" : "bg-[rgba(240,124,107,0.1)] text-[#F07C6B]"}`}>
      <summary className="cursor-pointer">
        {label} {ok ? "schoon ✓" : "fouten"}
      </summary>
      {!ok && <pre className="mt-1 max-h-48 max-w-[80vw] overflow-auto whitespace-pre-wrap font-mono text-[10.5px] text-white/70">{uit}</pre>}
    </details>
  );
}

/** Unified diff per bestand, ingeklapt bij veel bestanden. */
function Wijzigingen({ diff, bestanden }: { diff: string; bestanden: { status: string; pad: string }[] }) {
  const blokken = useMemo(() => {
    if (!diff) return [] as { pad: string; regels: string[] }[];
    return diff
      .split(/^diff --git /m)
      .filter(Boolean)
      .map((blok) => {
        const regels = blok.split("\n");
        const kop = regels[0] ?? "";
        const pad = /^a\/(.+?) b\//.exec(kop)?.[1] ?? kop;
        const begin = regels.findIndex((r) => r.startsWith("@@"));
        return { pad, regels: begin >= 0 ? regels.slice(begin) : [] };
      });
  }, [diff]);

  if (!bestanden.length && !blokken.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] uppercase tracking-[0.16em] text-white/40">
        Wijzigingen · {bestanden.length} bestand{bestanden.length === 1 ? "" : "en"}
      </h3>
      {blokken.map((b) => (
        <details key={b.pad} open={blokken.length <= 4} className="overflow-hidden rounded-lg border border-white/10">
          <summary className="cursor-pointer bg-[#0e1116] px-3 py-1.5 font-mono text-[11px] text-white/75">{b.pad}</summary>
          <pre className="max-h-[28rem] overflow-auto bg-black/40 py-1 font-mono text-[11px] leading-[1.45]">
            {b.regels.slice(0, 1500).map((r, i) => (
              <div
                key={i}
                className={`px-3 ${
                  r.startsWith("+") ? "bg-[rgba(79,224,160,0.09)] text-[#9ef0c9]" : r.startsWith("-") ? "bg-[rgba(240,124,107,0.09)] text-[#f5a99d]" : r.startsWith("@@") ? "text-[#7CC5FF]/70" : "text-white/50"
                }`}
              >
                {r || " "}
              </div>
            ))}
          </pre>
        </details>
      ))}
    </section>
  );
}

function Instellingen({ onOpgeslagen }: { onOpgeslagen: () => void }) {
  const [data, setData] = useState<{ model: string; modelGekozen: boolean; githubSleutel: boolean; autoFouten: boolean; modellen: string[] } | null>(null);
  const [model, setModel] = useState("");
  const [sleutel, setSleutel] = useState("");
  const [melding, setMelding] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/bouwer/instellingen", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { model: string; modelGekozen: boolean; githubSleutel: boolean; autoFouten: boolean; modellen: string[] }) => {
        setData(d);
        setModel(d.modelGekozen ? d.model : "");
      })
      .catch(() => setMelding("Instellingen laden mislukt"));
  }, []);

  const bewaar = async (body: Record<string, unknown>) => {
    setMelding(null);
    try {
      const d = await verstuur<{ model: string; modelGekozen: boolean; githubSleutel: boolean; autoFouten: boolean }>("/api/admin/bouwer/instellingen", "PUT", body);
      setData((o) => (o ? { ...o, ...d } : o));
      setSleutel("");
      setMelding("Opgeslagen");
      onOpgeslagen();
    } catch (e) {
      setMelding(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  };

  if (!data) return <p className="p-3 text-[11px] text-white/40">{melding ?? "Laden…"}</p>;
  return (
    <div className="space-y-3 border-b border-white/10 bg-black/20 p-3 text-[11px] text-white/70">
      <div className="space-y-1">
        <label htmlFor="bouwer-model" className="block text-white/50">
          Model (leeg = het code-model uit de AI-instellingen)
        </label>
        <div className="flex gap-1.5">
          <input
            id="bouwer-model"
            list="bouwer-modellen"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={data.model}
            className="min-w-0 flex-1 rounded-md border border-white/15 bg-[#0b0e13] px-2 py-1 font-mono text-white focus:border-brand-mint focus:outline-none"
          />
          <datalist id="bouwer-modellen">
            {data.modellen.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button type="button" onClick={() => void bewaar({ model: model.trim() || null })} className="rounded-md border border-white/15 px-2 text-white/70 hover:bg-white/10">
            Bewaar
          </button>
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="bouwer-github" className="block text-white/50">
          GitHub-sleutel {data.githubSleutel ? <span className="text-brand-mint">ingesteld ✓</span> : <span className="text-[#FFC46B]">ontbreekt</span>}
        </label>
        <div className="flex gap-1.5">
          <input
            id="bouwer-github"
            type="password"
            autoComplete="off"
            value={sleutel}
            onChange={(e) => setSleutel(e.target.value)}
            placeholder="github_pat_…"
            className="min-w-0 flex-1 rounded-md border border-white/15 bg-[#0b0e13] px-2 py-1 font-mono text-white focus:border-brand-mint focus:outline-none"
          />
          <button type="button" disabled={!sleutel.trim()} onClick={() => void bewaar({ githubToken: sleutel.trim() })} className="rounded-md border border-white/15 px-2 text-white/70 hover:bg-white/10 disabled:opacity-40">
            Bewaar
          </button>
        </div>
        <p className="leading-relaxed text-white/35">
          Maak hem op GitHub: Settings → Developer settings → Fine-grained tokens → alleen de repo zekerflex-finale → Contents: Read and write. Hij wordt versleuteld bewaard.
          {data.githubSleutel && (
            <button type="button" onClick={() => void bewaar({ githubToken: null })} className="ml-1 text-[#F07C6B]/80 underline">
              verwijderen
            </button>
          )}
        </p>
      </div>
      <label className="flex items-start gap-2 leading-relaxed">
        <input type="checkbox" className="mt-0.5" checked={data.autoFouten} onChange={(e) => void bewaar({ autoFouten: e.target.checked })} />
        <span>
          <span className="text-white/80">Automatisch reparaties voorstellen</span>
          <span className="block text-white/35">
            Komt een fout uit het foutenlogboek minstens 3 keer terug, dan begint de Bouwer er zelf aan en krijg je een melding zodra er een reparatie klaarstaat. Goedkeuren doe je altijd zelf. Hooguit 3 per dag; nooit meldingen met tekst van bezoekers.
          </span>
        </span>
      </label>
      {melding && <p className="text-white/50">{melding}</p>}
    </div>
  );
}
