"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BreinData, BreinNeuron } from "@/lib/rag/brein";
import type { BreinHandle } from "@/components/admin/brein/scene";
import { themaKleur } from "@/components/admin/brein/kleuren";

// Het Brein (3D) op Admin → Kennisgraaf: elk geheugenstuk een neuron. Dit bestand laadt three.js pas
// als het Brein gekozen is (dynamische import van brein/scene.ts) en haalt de echte gegevens van de
// server (/api/admin/kennisgraaf?brein=1). Eromheen in gewone HTML: zoeken (vliegt naar een neuron),
// de clusters als knoppen (vlieg erheen), vliegtocht, gloed en lijnen aan/uit, lichte stand, foto,
// het aangewezen neuron, een detailpaneel met focus op de verwanten, en onderaan de balk "Voed het
// brein": wat een beheerder typt wordt echt kennis in het geheugen en verschijnt met stralen naar de
// stukken waarmee het brein het verbond. Zonder WebGL: een nette melding met de weg terug.

const BRON_KORT: Record<string, string> = { CODE: "code", AUDIT: "auditspoor", DATABASE: "platformstand", LEGAL: "wetgeving en kennisbank", SALES: "sales", INTERACTION: "gesprekken en voeding" };
const knop = "rounded-md border border-white/15 px-2 py-1 hover:bg-white/10 disabled:opacity-40";
const knopAan = "rounded-md border border-brand-mint/60 bg-brand-mint/15 px-2 py-1 text-white";

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Zwak apparaat of "minder beweging": standaard de lichte stand (geen gloed, minder sterren, geen draaien). */
function lichtStandaard(): boolean {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches || (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  } catch {
    return false;
  }
}

interface Voedsel {
  id: string;
  titel: string;
  chunkIds: string[];
  buren: { id: string; title: string; sourceType: string; sourceRef: string; score: number }[];
}

export function Brein({ onVlak }: { onVlak: () => void }) {
  const host = useRef<HTMLDivElement | null>(null);
  const handle = useRef<BreinHandle | null>(null);
  const [data, setData] = useState<BreinData | null>(null);
  const [stand, setStand] = useState<"laden" | "klaar" | "geen-webgl" | "fout">("laden");
  const [licht, setLicht] = useState(false);
  const [bloom, setBloom] = useState(true);
  const [lijnen, setLijnen] = useState(true);
  const [tocht, setTocht] = useState(false);
  const [zoek, setZoek] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [voer, setVoer] = useState("");
  const [voedBezig, setVoedBezig] = useState(false);
  const [laatsteVoeding, setLaatsteVoeding] = useState<Voedsel | null>(null);
  const [herstart, setHerstart] = useState(0);
  const dataRef = useRef<BreinData | null>(null);
  dataRef.current = data;

  useEffect(() => {
    const l = lichtStandaard();
    setLicht(l);
    setBloom(!l);
  }, []);

  const byId = useMemo(() => new Map((data?.neuronen ?? []).map((n) => [n.id, n])), [data]);
  const burenVan = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (!data) return m;
    for (const [a, b] of data.lijnen) {
      const na = data.neuronen[a];
      const nb = data.neuronen[b];
      if (!na || !nb) continue;
      (m.get(na.id) ?? m.set(na.id, new Set()).get(na.id))!.add(nb.id);
      (m.get(nb.id) ?? m.set(nb.id, new Set()).get(nb.id))!.add(na.id);
    }
    return m;
  }, [data]);

  const laadData = useCallback(async (vers = false): Promise<BreinData | null> => {
    const r = await fetch(`/api/admin/kennisgraaf?brein=1${vers ? "&vers=1" : ""}`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return null;
    return (await r.json()) as BreinData;
  }, []);

  // three.js en de gegevens laden; opnieuw bij een andere kwaliteit (licht) of na "opnieuw"
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (!hasWebGL()) {
      setStand("geen-webgl");
      return;
    }
    let weg = false;
    setStand("laden");
    (async () => {
      const [{ createBrein }, d] = await Promise.all([import("@/components/admin/brein/scene"), laadData()]);
      if (weg) return;
      if (!d) throw new Error("brein");
      setData(d);
      const minderBeweging = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      handle.current = createBrein(el, d, {
        licht,
        bloom: bloom && !licht,
        lijnen,
        minderBeweging,
        onHover: (id) => setHover(id),
        onKlik: (id) => setGekozen(id),
        onVliegtochtStop: () => setTocht(false),
      });
      setStand("klaar");
    })().catch(() => {
      if (!weg) setStand("fout");
    });
    return () => {
      weg = true;
      handle.current?.dispose();
      handle.current = null;
    };
    // gloed en lijnen gaan via de handle; alleen de kwaliteit (licht) of een herstart bouwt opnieuw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licht, herstart, laadData]);

  useEffect(() => {
    handle.current?.setBloom(bloom);
  }, [bloom, stand]);
  useEffect(() => {
    handle.current?.setLijnen(lijnen);
  }, [lijnen, stand]);

  const zoekLager = zoek.trim().toLowerCase();
  const treffers = useMemo(() => (zoekLager && data ? data.neuronen.filter((n) => n.t.toLowerCase().includes(zoekLager) || n.ref.toLowerCase().includes(zoekLager)).slice(0, 60) : []), [data, zoekLager]);
  useEffect(() => {
    handle.current?.setZoek(treffers.length > 0 ? new Set(treffers.map((t) => t.id)) : null);
  }, [treffers, stand]);

  const focusOp = (id: string) => {
    const set = new Set<string>([id, ...(burenVan.get(id) ?? [])]);
    // ook de stukken van dezelfde bron
    const ne = byId.get(id);
    if (ne && data) for (const x of data.neuronen) if (x.ref === ne.ref) set.add(x.id);
    setFocus(id);
    handle.current?.setFocus(set);
    handle.current?.vliegNaar(id);
  };
  const focusUit = () => {
    setFocus(null);
    handle.current?.setFocus(null);
  };
  const vliegtocht = () => {
    const aan = !tocht;
    setTocht(aan);
    handle.current?.vliegtocht(aan);
  };
  const foto = () => {
    const url = handle.current?.foto();
    if (!url) {
      setMelding("Een foto maken lukte niet in deze browser.");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = "zekerflex-brein.png";
    a.click();
  };

  const voed = async () => {
    const tekst = voer.trim();
    if (tekst.length === 0 || voedBezig) return;
    setVoedBezig(true);
    setMelding(null);
    const r = await fetch("/api/admin/kennisgraaf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tekst }) }).catch(() => null);
    if (!r) {
      setVoedBezig(false);
      setMelding("Het brein was niet bereikbaar. Probeer het opnieuw.");
      return;
    }
    const body = (await r.json().catch(() => null)) as (Voedsel & { error?: { message?: string } }) | null;
    if (!r.ok || !body || !Array.isArray(body.chunkIds)) {
      setVoedBezig(false);
      setMelding(body?.error?.message ?? "Het brein kon dit niet opnemen.");
      return;
    }
    const d = await laadData(true);
    setVoedBezig(false);
    if (!d) {
      setMelding("Opgenomen, maar het beeld kon niet worden vernieuwd. Laad de pagina opnieuw.");
      return;
    }
    setData(d);
    setLaatsteVoeding(body);
    setVoer("");
    handle.current?.zetData(d, { ids: body.chunkIds, buren: body.buren.map((b) => b.id) });
    setMelding(body.buren.length > 0 ? `Opgenomen als "${body.titel}" en verbonden met ${body.buren.length} bestaande ${body.buren.length === 1 ? "stuk" : "stukken"}.` : `Opgenomen als "${body.titel}"; het brein vond nog geen verwante stukken.`);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGekozen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hoverNode = hover ? byId.get(hover) : undefined;
  const gekozenNode = gekozen ? byId.get(gekozen) : undefined;
  const cluster = (n: BreinNeuron | undefined) => (n && data ? data.clusters[n.c] : undefined);
  const vuurTekst = (n: BreinNeuron) => (!data?.vuur.gemeten ? "nog geen raadplegingen gemeten" : n.v === 0 ? `niet geraadpleegd in ${data.vuur.dagen} dagen` : `${n.v} keer geraadpleegd in ${data.vuur.dagen} dagen`);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#04060b] text-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-[11px] text-white/60">
        <span className="font-semibold text-white/85">
          {data ? `${data.neuronen.length.toLocaleString("nl-NL")} neuronen · ${data.clusters.length} clusters · ${data.lijnen.length.toLocaleString("nl-NL")} stralen` : "Brein"}
          {data ? (data.vuur.gemeten ? ` · ${data.vuur.totaal.toLocaleString("nl-NL")} raadplegingen in ${data.vuur.dagen} dagen` : " · nog geen raadplegingen gemeten") : ""}
        </span>
        <form
          className="ml-2 flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const eerste = treffers[0];
            if (eerste) {
              handle.current?.vliegNaar(eerste.id);
              setGekozen(eerste.id);
            }
          }}
        >
          <label className="sr-only" htmlFor="brein-zoek">
            Zoek een neuron
          </label>
          <input
            id="brein-zoek"
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek een neuron en vlieg erheen…"
            className="w-56 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white placeholder:text-white/35 focus:border-brand-mint focus:outline-none"
          />
          {zoekLager && (
            <span className="text-white/35">
              {treffers.length} {treffers.length === 1 ? "treffer" : "treffers"}
              {treffers.length > 0 ? " · Enter vliegt naar de eerste" : ""}
            </span>
          )}
        </form>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={vliegtocht} aria-pressed={tocht} className={tocht ? knopAan : knop} disabled={stand !== "klaar"}>
            {tocht ? "Vliegtocht stoppen" : "Vliegtocht"}
          </button>
          <button type="button" onClick={() => setBloom((b) => !b)} aria-pressed={bloom && !licht} className={bloom && !licht ? knopAan : knop} disabled={licht || stand !== "klaar"} title={licht ? "In de lichte stand staat de gloed uit" : "Gloed rond de neuronen"}>
            Gloed
          </button>
          <button type="button" onClick={() => setLijnen((v) => !v)} aria-pressed={lijnen} className={lijnen ? knopAan : knop} disabled={stand !== "klaar"}>
            Stralen
          </button>
          <button type="button" onClick={() => setLicht((v) => !v)} aria-pressed={licht} className={licht ? knopAan : knop} title="Minder sterren, geen gloed en geen draaien: voor zwakke apparaten">
            Lichte stand
          </button>
          <button type="button" onClick={() => handle.current?.reset()} className={knop} disabled={stand !== "klaar"}>
            Overzicht
          </button>
          <button type="button" onClick={foto} className={knop} disabled={stand !== "klaar"}>
            Foto
          </button>
          <button type="button" onClick={onVlak} className={knop}>
            Weergave: vlak
          </button>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-white/10 px-3 py-1.5 text-[11px] text-white/55">
        {(data?.clusters ?? []).map((c, i) => (
          <button key={c.id} type="button" onClick={() => handle.current?.vliegNaarCluster(i)} className="inline-flex max-w-[18rem] items-center gap-1.5 rounded-full border border-white/15 px-2 py-0.5 hover:bg-white/10" title={`${c.naam}: vlieg erheen`}>
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: themaKleur(i + 1) }} />
            <span className="truncate">{c.naam}</span>
            <span className="text-white/35">
              {c.aantal.toLocaleString("nl-NL")}
              {c.vuurt === null ? "" : ` · ${c.vuurt}%`}
            </span>
          </button>
        ))}
        {focus && (
          <button type="button" onClick={focusUit} className={knopAan}>
            Focus uit
          </button>
        )}
        <span className="ml-auto text-white/30">slepen = draaien · scroll = zoom · klik = details · vuurt % = neuronen die de laatste 7 dagen zijn geraadpleegd</span>
      </div>
      {melding && (
        <p role="status" className="border-b border-white/10 px-3 py-1.5 text-[11px] text-[#FFC46B]">
          {melding}
        </p>
      )}

      <div className="relative">
        <div ref={host} className="relative h-[70vh] w-full touch-none select-none" aria-label="Het brein van ZekerFlex: geheugenstukken als neuronen in 3D" role="img" />
        {stand === "laden" && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/60" aria-live="polite">
            Het brein wordt opgebouwd…
          </p>
        )}
        {stand === "geen-webgl" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-sm text-white/70">
            <p>Deze browser kan geen 3D tekenen (geen WebGL).</p>
            <button type="button" onClick={onVlak} className={knopAan}>
              Naar de vlakke weergave
            </button>
          </div>
        )}
        {stand === "fout" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-sm text-white/70">
            <p>Het brein kon niet worden geladen.</p>
            <span className="flex gap-2">
              <button type="button" onClick={() => setHerstart((v) => v + 1)} className={knop}>
                Opnieuw
              </button>
              <button type="button" onClick={onVlak} className={knopAan}>
                Naar de vlakke weergave
              </button>
            </span>
          </div>
        )}
        {hoverNode && !gekozen && (
          <div className="pointer-events-none absolute bottom-16 left-3 max-w-xs rounded-lg border border-white/15 bg-[#0e1116]/95 px-3 py-2 text-xs shadow-xl backdrop-blur" aria-live="polite">
            <p className="font-semibold text-white/90">{hoverNode.t}</p>
            <p className="text-[10px] text-white/45">
              {cluster(hoverNode)?.naam ?? ""} · {BRON_KORT[hoverNode.bron] ?? hoverNode.bron} · {vuurTekst(hoverNode)} · klik voor details
            </p>
          </div>
        )}

        {gekozen && gekozenNode && (
          <aside className="absolute right-3 top-3 flex max-h-[calc(70vh-5rem)] w-80 flex-col overflow-hidden rounded-xl border border-white/15 bg-[#0e1116]/95 text-xs shadow-xl backdrop-blur" aria-live="polite">
            <div className="flex items-start gap-2 border-b border-white/10 px-3 py-2">
              <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: themaKleur(gekozenNode.c + 1) }} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white/90">{gekozenNode.t}</p>
                <p className="text-[10px] text-white/40">
                  {cluster(gekozenNode)?.naam ?? ""} · {BRON_KORT[gekozenNode.bron] ?? gekozenNode.bron}
                </p>
              </div>
              <button type="button" onClick={() => setGekozen(null)} aria-label="Sluiten" className="text-white/45 hover:text-white">
                ✕
              </button>
            </div>
            <div className="flex flex-wrap gap-1 border-b border-white/10 px-3 py-1.5 text-[10px]">
              <button type="button" onClick={() => focusOp(gekozen)} className={focus === gekozen ? knopAan : knop}>
                Focus: verwanten
              </button>
              <button type="button" onClick={() => handle.current?.vliegNaar(gekozen)} className={knop}>
                Vlieg hierheen
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-white/70">
              <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-white/35">Herkomst</p>
              <p className="break-all text-[11px]">{gekozenNode.ref}</p>
              <p className="mt-2 text-[11px]">{vuurTekst(gekozenNode)}</p>
              <p className="mt-2 text-[11px]">
                {(burenVan.get(gekozen)?.size ?? 0).toLocaleString("nl-NL")} {(burenVan.get(gekozen)?.size ?? 0) === 1 ? "straal" : "stralen"} naar verwante stukken
                {gekozenNode.doc ? `; document in de kennisgraaf: ${gekozenNode.doc}` : ""}
              </p>
            </div>
          </aside>
        )}

        {laatsteVoeding && !gekozen && (
          <aside className="absolute left-3 top-3 max-h-[calc(70vh-5rem)] w-72 overflow-y-auto rounded-xl border border-[#FFC46B]/40 bg-[#0e1116]/95 p-3 text-xs shadow-xl backdrop-blur" aria-live="polite">
            <p className="font-semibold text-white/90">Zojuist gevoed: „{laatsteVoeding.titel}”</p>
            <p className="mt-0.5 text-[10px] text-white/40">
              {laatsteVoeding.chunkIds.length} {laatsteVoeding.chunkIds.length === 1 ? "nieuw neuron" : "nieuwe neuronen"}; het brein verbond het met:
            </p>
            <ol className="mt-2 space-y-1">
              {laatsteVoeding.buren.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      handle.current?.vliegNaar(b.id);
                      setGekozen(b.id);
                    }}
                    className="flex w-full items-center gap-2 text-left hover:underline"
                  >
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: themaKleur((byId.get(b.id)?.c ?? -1) + 1) }} />
                    <span className="min-w-0 flex-1 truncate text-white/85">{b.title}</span>
                    <span className="flex-shrink-0 text-[10px] text-white/35">{Math.round(b.score * 100)}%</span>
                  </button>
                </li>
              ))}
              {laatsteVoeding.buren.length === 0 && <li className="text-white/45">nog geen verwante stukken gevonden</li>}
            </ol>
            <button type="button" onClick={() => setLaatsteVoeding(null)} className="mt-2 text-white/45 underline hover:text-white/80">
              sluiten
            </button>
          </aside>
        )}

        {/* Voed het brein */}
        <form
          className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-xl border border-white/15 bg-[#0e1116]/90 px-3 py-2 shadow-xl backdrop-blur"
          onSubmit={(e) => {
            e.preventDefault();
            void voed();
          }}
        >
          <label className="sr-only" htmlFor="brein-voer">
            Voed het brein
          </label>
          <input
            id="brein-voer"
            value={voer}
            onChange={(e) => setVoer(e.target.value)}
            maxLength={4000}
            placeholder="Voed het brein… typ kennis die het moet onthouden"
            className="min-w-0 flex-1 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/35 focus:border-brand-mint focus:outline-none"
            disabled={stand !== "klaar" || voedBezig}
          />
          <button type="submit" disabled={stand !== "klaar" || voedBezig || voer.trim().length < 20} className="rounded-md bg-brand-mint px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-50">
            {voedBezig ? "Het brein legt verbanden…" : "Voeden"}
          </button>
        </form>
      </div>
    </div>
  );
}
