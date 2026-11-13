"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BreinData, BreinNeuron } from "@/lib/rag/brein";
import type { BreinHandle, Indeling } from "@/components/admin/brein/scene";
import { themaKleur } from "@/components/admin/brein/kleuren";

// Het Brein (3D) op Admin → Kennisgraaf: elk geheugenstuk een neuron. Dit bestand laadt three.js pas
// als het Brein gekozen is (dynamische import van brein/scene.ts) en haalt de echte gegevens van de
// server (/api/admin/kennisgraaf?brein=1). Eromheen in gewone HTML:
//   - Vraag het brein: de vraag gaat door hetzelfde geheugen als Jarvis (/api/admin/rag/ask); het
//     antwoord komt met bronnen, en de neuronen die het brein gebruikte lichten op (camera erheen);
//   - twee indelingen: per bron/thema, of per thema dat het brein zelf op betekenis ontdekte;
//   - synapsen (echte betekenisverwanten) en gewone stralen aan/uit, gloed, lichte stand, foto;
//   - zoeken (vliegt naar een neuron), de clusters als knoppen met "Leg uit" (uitleg door het model
//     uit de echte stukken), vliegtocht, aanwijzen (tooltip), detailpaneel met focus op verwanten;
//   - onderaan de balk "Voed het brein": wat een beheerder typt wordt echt kennis en verschijnt met
//     stralen naar de stukken waarmee het brein het verbond.
// Zonder WebGL: een nette melding met de weg terug.

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

interface Antwoord {
  vraag: string;
  answer: string;
  sources: { sourceType: string; sourceRef: string; title: string; score: number }[];
  /** de neuronen (stuk-id's) die bij de bronnen horen */
  neuronen: string[];
}

interface Uitleg {
  clusterId: string;
  naam: string;
  tekst: string;
  stukken: number;
  bron: "model" | "geen-model" | "storing";
}

export function Brein({ onVlak }: { onVlak: () => void }) {
  const host = useRef<HTMLDivElement | null>(null);
  const handle = useRef<BreinHandle | null>(null);
  const [data, setData] = useState<BreinData | null>(null);
  const [stand, setStand] = useState<"laden" | "klaar" | "geen-webgl" | "fout">("laden");
  const [licht, setLicht] = useState(false);
  const [bloom, setBloom] = useState(true);
  const [lijnen, setLijnen] = useState(true);
  const [synapsen, setSynapsen] = useState(true);
  const [indeling, setIndeling] = useState<Indeling>("bron");
  const [tocht, setTocht] = useState(false);
  const [zoek, setZoek] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [vraag, setVraag] = useState("");
  const [vraagBezig, setVraagBezig] = useState(false);
  const [antwoord, setAntwoord] = useState<Antwoord | null>(null);
  const [voer, setVoer] = useState("");
  const [voedBezig, setVoedBezig] = useState(false);
  const [laatsteVoeding, setLaatsteVoeding] = useState<Voedsel | null>(null);
  const [uitleg, setUitleg] = useState<Uitleg | null>(null);
  const [uitlegBezig, setUitlegBezig] = useState<string | null>(null);
  const [herstart, setHerstart] = useState(0);

  useEffect(() => {
    const l = lichtStandaard();
    setLicht(l);
    setBloom(!l);
  }, []);

  const byId = useMemo(() => new Map((data?.neuronen ?? []).map((n) => [n.id, n])), [data]);
  const burenVan = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (!data) return m;
    const voeg = (a: number, b: number) => {
      const na = data.neuronen[a];
      const nb = data.neuronen[b];
      if (!na || !nb) return;
      (m.get(na.id) ?? m.set(na.id, new Set()).get(na.id))!.add(nb.id);
      (m.get(nb.id) ?? m.set(nb.id, new Set()).get(nb.id))!.add(na.id);
    };
    for (const [a, b] of data.lijnen) voeg(a, b);
    for (const [a, b] of data.synapsen) voeg(a, b);
    return m;
  }, [data]);
  const synapsenVan = useMemo(() => {
    const m = new Map<string, { id: string; s: number }[]>();
    if (!data) return m;
    for (const [a, b, s] of data.synapsen) {
      const na = data.neuronen[a];
      const nb = data.neuronen[b];
      if (!na || !nb) continue;
      m.set(na.id, [...(m.get(na.id) ?? []), { id: nb.id, s }]);
      m.set(nb.id, [...(m.get(nb.id) ?? []), { id: na.id, s }]);
    }
    for (const lijst of m.values()) lijst.sort((x, y) => y.s - x.s);
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
        synapsen,
        indeling: d.ontdekt ? indeling : "bron",
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
    // gloed, lijnen, synapsen en indeling gaan via de handle; alleen de kwaliteit (licht) of een herstart bouwt opnieuw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licht, herstart, laadData]);

  useEffect(() => {
    handle.current?.setBloom(bloom);
  }, [bloom, stand]);
  useEffect(() => {
    handle.current?.setLijnen(lijnen);
  }, [lijnen, stand]);
  useEffect(() => {
    handle.current?.setSynapsen(synapsen);
  }, [synapsen, stand]);
  useEffect(() => {
    handle.current?.setIndeling(indeling);
  }, [indeling, stand]);

  const zoekLager = zoek.trim().toLowerCase();
  const treffers = useMemo(() => (zoekLager && data ? data.neuronen.filter((n) => n.t.toLowerCase().includes(zoekLager) || n.ref.toLowerCase().includes(zoekLager)).slice(0, 60) : []), [data, zoekLager]);
  useEffect(() => {
    handle.current?.setZoek(treffers.length > 0 ? new Set(treffers.map((t) => t.id)) : null);
  }, [treffers, stand]);

  const focusOp = (id: string) => {
    const set = new Set<string>([id, ...(burenVan.get(id) ?? [])]);
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

  /** Vraag het brein: hetzelfde geheugen als Jarvis; de gebruikte neuronen lichten op. */
  const stelVraag = async () => {
    const v = vraag.trim();
    if (v.length < 3 || vraagBezig) return;
    setVraagBezig(true);
    setMelding(null);
    const r = await fetch("/api/admin/rag/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: v.slice(0, 500) }) }).catch(() => null);
    setVraagBezig(false);
    const body = (await r?.json().catch(() => null)) as { answer?: string; sources?: Antwoord["sources"]; error?: { message?: string } } | null;
    if (!r?.ok || !body || typeof body.answer !== "string") {
      setMelding(body?.error?.message ?? "Het brein kon de vraag nu niet beantwoorden.");
      return;
    }
    const bronnen = body.sources ?? [];
    const refs = new Set(bronnen.map((s) => s.sourceRef));
    const neuronen = (data?.neuronen ?? []).filter((n) => refs.has(n.ref)).map((n) => n.id);
    setAntwoord({ vraag: v, answer: body.answer, sources: bronnen, neuronen });
    setGekozen(null);
    handle.current?.setOplichten(neuronen.length > 0 ? neuronen : null);
    if (neuronen.length === 0 && bronnen.length > 0) setMelding("Het antwoord komt uit de kennisbank zelf; die stukken staan niet als losse neuronen in dit beeld.");
  };
  const antwoordWeg = () => {
    setAntwoord(null);
    handle.current?.setOplichten(null);
  };

  const legUit = async (clusterId: string) => {
    setUitlegBezig(clusterId);
    const r = await fetch(`/api/admin/kennisgraaf?uitleg=${encodeURIComponent(clusterId)}`, { cache: "no-store" }).catch(() => null);
    setUitlegBezig(null);
    if (!r?.ok) {
      setMelding("De uitleg kon niet worden opgehaald.");
      return;
    }
    setUitleg((await r.json()) as Uitleg);
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
  const clusterNaam = (n: BreinNeuron | undefined) => {
    if (!n || !data) return "";
    if (indeling === "betekenis" && data.ontdekt && n.o !== undefined) return data.ontdekt.clusters[n.o]?.naam ?? "";
    return data.clusters[n.c]?.naam ?? "";
  };
  const clusterKleur = (n: BreinNeuron | undefined) => themaKleur(n ? (indeling === "betekenis" && data?.ontdekt && n.o !== undefined ? n.o : n.c) + 1 : undefined);
  const vuurTekst = (n: BreinNeuron) => (!data?.vuur.gemeten ? "nog geen raadplegingen gemeten" : n.v === 0 ? `niet geraadpleegd in ${data.vuur.dagen} dagen` : `${n.v} keer geraadpleegd in ${data.vuur.dagen} dagen`);
  const clusterLijst = indeling === "betekenis" && data?.ontdekt ? data.ontdekt.clusters : (data?.clusters ?? []);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#04060b] text-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-[11px] text-white/60">
        <span className="font-semibold text-white/85">
          {data ? `${data.neuronen.length.toLocaleString("nl-NL")} neuronen · ${data.synapsen.length.toLocaleString("nl-NL")} synapsen · ${data.lijnen.length.toLocaleString("nl-NL")} stralen` : "Brein"}
          {data ? (data.vuur.gemeten ? ` · ${data.vuur.totaal.toLocaleString("nl-NL")} raadplegingen in ${data.vuur.dagen} dagen` : " · nog geen raadplegingen gemeten") : ""}
        </span>
        <form
          className="ml-2 flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void stelVraag();
          }}
        >
          <label className="sr-only" htmlFor="brein-vraag">
            Vraag het brein
          </label>
          <input
            id="brein-vraag"
            value={vraag}
            onChange={(e) => setVraag(e.target.value)}
            maxLength={500}
            placeholder="Vraag het brein… het antwoord komt met bronnen en de neuronen lichten op"
            className="w-80 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white placeholder:text-white/35 focus:border-brand-mint focus:outline-none"
          />
          <button type="submit" disabled={vraagBezig || vraag.trim().length < 3 || stand !== "klaar"} className="rounded-md bg-brand-mint px-2.5 py-1 text-[11px] font-semibold text-ink disabled:opacity-50">
            {vraagBezig ? "Denkt…" : "Vraag"}
          </button>
        </form>
        <form
          className="flex items-center gap-1.5"
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
            placeholder="Zoek een neuron…"
            className="w-44 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white placeholder:text-white/35 focus:border-brand-mint focus:outline-none"
          />
          {zoekLager && <span className="text-white/35">{treffers.length} {treffers.length === 1 ? "treffer" : "treffers"}</span>}
        </form>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1" role="group" aria-label="Indeling">
            <span className="text-white/35">Indeling</span>
            <button type="button" aria-pressed={indeling === "bron"} onClick={() => setIndeling("bron")} className={indeling === "bron" ? knopAan : knop}>
              bron en thema
            </button>
            <button type="button" aria-pressed={indeling === "betekenis"} onClick={() => setIndeling("betekenis")} className={indeling === "betekenis" ? knopAan : knop} disabled={!data?.ontdekt} title={data?.ontdekt ? "De thema's die het brein zelf op betekenis ontdekte" : "Het brein heeft zijn thema's nog niet ontdekt; dat gebeurt vannacht"}>
              betekenis (zelf ontdekt)
            </button>
          </span>
          <button type="button" onClick={vliegtocht} aria-pressed={tocht} className={tocht ? knopAan : knop} disabled={stand !== "klaar"}>
            {tocht ? "Vliegtocht stoppen" : "Vliegtocht"}
          </button>
          <button type="button" onClick={() => setSynapsen((v) => !v)} aria-pressed={synapsen} className={synapsen ? knopAan : knop} disabled={stand !== "klaar" || !data || data.synapsen.length === 0} title="Echte betekenisverwanten uit de embeddings">
            Synapsen
          </button>
          <button type="button" onClick={() => setLijnen((v) => !v)} aria-pressed={lijnen} className={lijnen ? knopAan : knop} disabled={stand !== "klaar"} title="Opeenvolgende stukken van een bron en verbonden documenten">
            Stralen
          </button>
          <button type="button" onClick={() => setBloom((b) => !b)} aria-pressed={bloom && !licht} className={bloom && !licht ? knopAan : knop} disabled={licht || stand !== "klaar"}>
            Gloed
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
        {clusterLijst.map((c, i) => (
          <span key={c.id} className="inline-flex max-w-[20rem] items-center gap-1 rounded-full border border-white/15 pl-2 pr-1">
            <button type="button" onClick={() => handle.current?.vliegNaarCluster(i)} className="inline-flex min-w-0 items-center gap-1.5 py-0.5 hover:underline" title={`${c.naam}: vlieg erheen`}>
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: themaKleur(i + 1) }} />
              <span className="truncate">{c.naam}</span>
              <span className="text-white/35">
                {c.aantal.toLocaleString("nl-NL")}
                {c.vuurt === null ? "" : ` · ${c.vuurt}%`}
              </span>
            </button>
            <button type="button" onClick={() => void legUit(c.id)} disabled={uitlegBezig !== null} className="rounded-full px-1.5 py-0.5 text-[10px] text-white/45 hover:bg-white/10 hover:text-white" title="Laat het taalmodel uitleggen wat dit cluster gemeen heeft">
              {uitlegBezig === c.id ? "…" : "Leg uit"}
            </button>
          </span>
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
              {clusterNaam(hoverNode)} · {BRON_KORT[hoverNode.bron] ?? hoverNode.bron} · {vuurTekst(hoverNode)} · klik voor details
            </p>
          </div>
        )}

        {gekozen && gekozenNode && (
          <aside className="absolute right-3 top-3 flex max-h-[calc(70vh-5rem)] w-80 flex-col overflow-hidden rounded-xl border border-white/15 bg-[#0e1116]/95 text-xs shadow-xl backdrop-blur" aria-live="polite">
            <div className="flex items-start gap-2 border-b border-white/10 px-3 py-2">
              <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: clusterKleur(gekozenNode) }} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white/90">{gekozenNode.t}</p>
                <p className="text-[10px] text-white/40">
                  {clusterNaam(gekozenNode)} · {BRON_KORT[gekozenNode.bron] ?? gekozenNode.bron}
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
              {gekozenNode.doc && <p className="mt-1 text-[11px]">document in de kennisgraaf: {gekozenNode.doc}</p>}
              {(synapsenVan.get(gekozen) ?? []).length > 0 && (
                <>
                  <p className="mb-1 mt-3 text-[10px] uppercase tracking-[0.14em] text-white/35">Synapsen (betekenisverwant)</p>
                  <ul className="space-y-1">
                    {(synapsenVan.get(gekozen) ?? []).slice(0, 8).map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            handle.current?.vliegNaar(s.id);
                            setGekozen(s.id);
                          }}
                          className="flex w-full items-center gap-2 text-left hover:underline"
                        >
                          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: clusterKleur(byId.get(s.id)) }} />
                          <span className="min-w-0 flex-1 truncate text-white/80">{byId.get(s.id)?.t ?? s.id}</span>
                          <span className="flex-shrink-0 text-[10px] text-white/35">{Math.round(s.s * 100)}%</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="mt-2 text-[11px]">
                {(burenVan.get(gekozen)?.size ?? 0).toLocaleString("nl-NL")} {(burenVan.get(gekozen)?.size ?? 0) === 1 ? "verbinding" : "verbindingen"} in totaal
              </p>
            </div>
          </aside>
        )}

        {antwoord && !gekozen && (
          <aside className="absolute left-3 top-3 flex max-h-[calc(70vh-5rem)] w-96 flex-col overflow-hidden rounded-xl border border-brand-mint/40 bg-[#0e1116]/95 text-xs shadow-xl backdrop-blur" aria-live="polite">
            <div className="flex items-start gap-2 border-b border-white/10 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white/90">Het brein over: „{antwoord.vraag}”</p>
                <p className="text-[10px] text-white/40">
                  {antwoord.sources.length} {antwoord.sources.length === 1 ? "bron" : "bronnen"} · {antwoord.neuronen.length} {antwoord.neuronen.length === 1 ? "neuron licht op" : "neuronen lichten op"}
                </p>
              </div>
              <button type="button" onClick={antwoordWeg} aria-label="Sluiten" className="text-white/45 hover:text-white">
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-white/85">{antwoord.answer}</p>
              {antwoord.sources.length > 0 && (
                <>
                  <p className="mb-1 mt-3 text-[10px] uppercase tracking-[0.14em] text-white/35">Bronnen</p>
                  <ol className="space-y-1">
                    {antwoord.sources.map((s, i) => {
                      const ne = (data?.neuronen ?? []).find((n) => n.ref === s.sourceRef);
                      return (
                        <li key={`${s.sourceRef}-${i}`}>
                          <button
                            type="button"
                            disabled={!ne}
                            onClick={() => {
                              if (!ne) return;
                              handle.current?.vliegNaar(ne.id);
                              setGekozen(ne.id);
                            }}
                            className="flex w-full items-center gap-2 text-left hover:underline disabled:cursor-default disabled:no-underline"
                          >
                            <span className="w-4 flex-shrink-0 text-white/35">[{i + 1}]</span>
                            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: clusterKleur(ne) }} />
                            <span className="min-w-0 flex-1 truncate text-white/80">{s.title}</span>
                            <span className="flex-shrink-0 text-[10px] text-white/35">{Math.round(s.score * 100)}%</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </div>
          </aside>
        )}

        {uitleg && (
          <aside className="absolute bottom-16 right-3 w-80 rounded-xl border border-white/15 bg-[#0e1116]/95 p-3 text-xs shadow-xl backdrop-blur" aria-live="polite">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 font-semibold text-white/90">Uitleg: {uitleg.naam}</p>
              <button type="button" onClick={() => setUitleg(null)} aria-label="Sluiten" className="text-white/45 hover:text-white">
                ✕
              </button>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-white/80">{uitleg.tekst}</p>
            <p className="mt-1.5 text-[10px] text-white/40">{uitleg.bron === "model" ? `door het taalmodel, uit ${uitleg.stukken} echte stukken van dit cluster` : uitleg.bron === "geen-model" ? "geen taalmodel beschikbaar" : "het model antwoordde niet"}</p>
          </aside>
        )}

        {laatsteVoeding && !gekozen && !antwoord && (
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
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: clusterKleur(byId.get(b.id)) }} />
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
