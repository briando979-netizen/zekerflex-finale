"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Begrip, GraafKnoop, GraafLijn } from "@/lib/rag/graph-analyse";
import type { Layout3D } from "@/lib/rag/graph-layout3d";
import type { SterHandle } from "@/components/admin/sterrenstelsel/scene";
import { themaKleur } from "@/components/admin/sterrenstelsel/kleuren";

// De Kennisgraaf als sterrenstelsel (3D). Dit bestand laadt three.js pas als het in beeld komt
// (dynamische import van sterrenstelsel/scene.ts) en haalt de vooraf berekende 3D-layout van de
// server (/api/admin/kennisgraaf?layout=3d). Eromheen in gewone HTML: zoeken (vliegt naar een ster),
// vliegtocht langs de thema's, gloed en lijnen aan/uit, lichte stand, een foto, de legenda van de
// thema's, aanwijzen (tooltip) en een detailpaneel met focus (buurt) en het kortste pad, via dezelfde
// API als de vlakke grafiek. Zonder WebGL: een nette melding met de weg terug naar de vlakke weergave.

interface Detail {
  node: GraafKnoop;
  passages: { id: string; title: string; tekst: string; href?: string }[];
  buren: { id: string; label: string; group: string; weight: number; soort: GraafLijn["soort"] }[];
  begrippen: string[];
  publiek: string[];
  thema: { id: number; naam: string } | null;
  scores: { centraal: number; brug: number } | null;
}

interface Pad {
  knopen: { id: string; label: string; group: string }[];
  lijnen: GraafLijn[];
}

export interface SterrenstelselProps {
  nodes: GraafKnoop[];
  edges: GraafLijn[];
  begrippen: Begrip[];
  themas: { id: number; naam: string; grootte: number }[];
  bruggen: string[];
  /** terug naar de vlakke weergave */
  onVlak: () => void;
}

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

/** Zwak apparaat of "minder beweging": dan standaard de lichte stand (geen gloed, minder sterren, geen draaien). */
function lichtStandaard(): boolean {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return reduced || (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  } catch {
    return false;
  }
}

export function Sterrenstelsel({ nodes, edges, begrippen, themas, bruggen, onVlak }: SterrenstelselProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const handle = useRef<SterHandle | null>(null);
  const [stand, setStand] = useState<"laden" | "klaar" | "geen-webgl" | "fout">("laden");
  const [licht, setLicht] = useState(false);
  const [bloom, setBloom] = useState(true);
  const [alleLijnen, setAlleLijnen] = useState(false);
  const [tocht, setTocht] = useState(false);
  const [zoek, setZoek] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [focus, setFocus] = useState<{ id: string; diepte: number } | null>(null);
  const [padVan, setPadVan] = useState<string | null>(null);
  const [pad, setPad] = useState<Pad | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [herstart, setHerstart] = useState(0);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const padVanRef = useRef<string | null>(null);
  padVanRef.current = padVan;

  // de lichte stand één keer bepalen (na het laden, zodat server en browser hetzelfde eerste beeld geven)
  useEffect(() => {
    const l = lichtStandaard();
    setLicht(l);
    setBloom(!l);
  }, []);

  const kies = useCallback(async (id: string | null) => {
    setGekozen(id);
    setDetail(null);
    if (!id) return;
    const r = await fetch(`/api/admin/kennisgraaf?knoop=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setDetail((await r.json()) as Detail);
    else setMelding("Details van deze ster zijn niet te laden.");
  }, []);

  const klik = useCallback(
    async (id: string) => {
      const van = padVanRef.current;
      if (van && van !== id) {
        setPadVan(null);
        const r = await fetch(`/api/admin/kennisgraaf?van=${encodeURIComponent(van)}&naar=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
        if (!r?.ok) {
          setMelding("Het pad kon niet worden berekend.");
          return;
        }
        const p = (await r.json()) as Pad;
        setPad(p);
        handle.current?.setPad(p.knopen.length > 0 ? p.knopen.map((k) => k.id) : null);
        if (p.knopen.length === 0) setMelding("Er is geen pad tussen deze twee sterren: ze liggen in losse delen van het stelsel.");
        return;
      }
      await kies(id);
    },
    [kies],
  );

  // three.js en de layout laden; opnieuw bij een andere lichte stand (andere kwaliteit) of na "opnieuw"
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
      const [{ createSterrenstelsel }, r] = await Promise.all([
        import("@/components/admin/sterrenstelsel/scene"),
        fetch("/api/admin/kennisgraaf?layout=3d", { cache: "no-store" }).catch(() => null),
      ]);
      if (weg) return;
      if (!r?.ok) throw new Error("layout");
      const layout = (await r.json()) as Layout3D;
      if (weg) return;
      const minderBeweging = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      handle.current = createSterrenstelsel(
        el,
        { nodes, edges, themas, bruggen, layout },
        {
          licht,
          bloom: bloom && !licht,
          alleLijnen,
          minderBeweging,
          onHover: (id) => setHover(id),
          onKlik: (id) => void klik(id),
          onVliegtochtStop: () => setTocht(false),
        },
      );
      setStand("klaar");
    })().catch(() => {
      if (!weg) setStand("fout");
    });
    return () => {
      weg = true;
      handle.current?.dispose();
      handle.current = null;
    };
    // bloom en alleLijnen gaan via de handle; alleen de kwaliteit (licht) of een herstart bouwt opnieuw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, themas, bruggen, licht, herstart, klik]);

  useEffect(() => {
    handle.current?.setBloom(bloom);
  }, [bloom, stand]);
  useEffect(() => {
    handle.current?.setAlleLijnen(alleLijnen);
  }, [alleLijnen, stand]);

  const zoekLager = zoek.trim().toLowerCase();
  const treffers = useMemo(() => (zoekLager ? nodes.filter((n) => n.label.toLowerCase().includes(zoekLager)).slice(0, 50) : []), [nodes, zoekLager]);
  useEffect(() => {
    handle.current?.setZoek(treffers.length > 0 ? new Set(treffers.map((t) => t.id)) : null);
  }, [treffers, stand]);

  const focusOp = async (id: string, diepte: 1 | 2) => {
    const r = await fetch(`/api/admin/kennisgraaf?buurt=${encodeURIComponent(id)}&diepte=${diepte}`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) {
      setMelding("De buurt kon niet worden geladen.");
      return;
    }
    const b = (await r.json()) as { knopen: string[] };
    setFocus({ id, diepte });
    handle.current?.setFocus(new Set(b.knopen));
    handle.current?.vliegNaar(id);
  };
  const focusUit = () => {
    setFocus(null);
    handle.current?.setFocus(null);
  };
  const padWissen = () => {
    setPad(null);
    setPadVan(null);
    handle.current?.setPad(null);
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
    a.download = "zekerflex-kennisgraaf-sterrenstelsel.png";
    a.click();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setGekozen(null);
        setDetail(null);
        setPadVan(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hoverNode = hover ? byId.get(hover) : undefined;
  const gekozenNode = gekozen ? byId.get(gekozen) : undefined;
  const themaNaam = (id: number | undefined) => (id === undefined ? "" : themas.find((t) => t.id === id)?.naam ?? "");

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#05070c] text-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-[11px] text-white/60">
        <span className="font-semibold text-white/85">
          {nodes.length} sterren · {edges.length} verbindingen · {themas.length} zonnestelsels · {begrippen.length} begrippen
        </span>
        <form
          className="ml-2 flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const eerste = treffers[0];
            if (eerste) {
              handle.current?.vliegNaar(eerste.id);
              void kies(eerste.id);
            }
          }}
        >
          <label className="sr-only" htmlFor="ster-zoek">
            Zoek een ster
          </label>
          <input
            id="ster-zoek"
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek een ster en vlieg erheen…"
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
          <button type="button" onClick={() => setBloom((b) => !b)} aria-pressed={bloom && !licht} className={bloom && !licht ? knopAan : knop} disabled={licht || stand !== "klaar"} title={licht ? "In de lichte stand staat de gloed uit" : "Gloed rond de sterren"}>
            Gloed
          </button>
          <button type="button" onClick={() => setAlleLijnen((v) => !v)} aria-pressed={alleLijnen} className={alleLijnen ? knopAan : knop} disabled={stand !== "klaar"} title="Standaard alleen de sterkste verbindingen">
            Alle lijnen
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 px-3 py-1.5 text-[11px] text-white/55">
        {themas.map((t) => (
          <span key={t.id} className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-white/15 px-2 py-0.5" title={t.naam}>
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: themaKleur(t.id) }} />
            <span className="truncate">
              {t.id}. {t.naam}
            </span>
            <span className="text-white/35">{t.grootte}</span>
          </span>
        ))}
        {focus && (
          <button type="button" onClick={focusUit} className={knopAan}>
            Focus uit
          </button>
        )}
        {padVan && <span className="text-[#FFC46B]">Pad vanaf {byId.get(padVan)?.label ?? padVan}: klik op de bestemming (Esc = stop)</span>}
        {pad && !padVan && (
          <button type="button" onClick={padWissen} className={knopAan}>
            Pad wissen
          </button>
        )}
        <span className="ml-auto text-white/30">slepen = draaien · scroll = zoom · klik = details · heldere stralen = bruggen tussen thema&apos;s</span>
      </div>
      {melding && (
        <p role="status" className="border-b border-white/10 px-3 py-1.5 text-[11px] text-[#FFC46B]">
          {melding}
        </p>
      )}

      <div className="relative">
        <div ref={host} className="relative h-[70vh] w-full touch-none select-none" aria-label="Kennisgraaf als sterrenstelsel" role="img" />
        {stand === "laden" && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/60" aria-live="polite">
            Het sterrenstelsel wordt gebouwd…
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
            <p>Het sterrenstelsel kon niet worden geladen.</p>
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
          <div className="pointer-events-none absolute left-3 bottom-3 rounded-lg border border-white/15 bg-[#0e1116]/95 px-3 py-2 text-xs shadow-xl backdrop-blur" aria-live="polite">
            <p className="font-semibold text-white/90">{hoverNode.label}</p>
            <p className="text-[10px] text-white/45">
              {hoverNode.group === "begrip" ? "begrip" : "document"}
              {hoverNode.thema !== undefined ? ` · thema ${hoverNode.thema}: ${themaNaam(hoverNode.thema)}` : ""} · klik voor details
            </p>
          </div>
        )}

        {gekozen && (
          <aside className="absolute right-3 top-3 flex max-h-[calc(70vh-1.5rem)] w-80 flex-col overflow-hidden rounded-xl border border-white/15 bg-[#0e1116]/95 text-xs shadow-xl backdrop-blur" aria-live="polite">
            <div className="flex items-start gap-2 border-b border-white/10 px-3 py-2">
              <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: themaKleur(gekozenNode?.thema) }} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white/90">{detail?.node.label ?? gekozenNode?.label ?? gekozen}</p>
                <p className="text-[10px] text-white/40">
                  {gekozenNode?.group === "begrip" ? "begrip" : "document"}
                  {detail?.thema ? ` · thema ${detail.thema.id}: ${detail.thema.naam}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => void kies(null)} aria-label="Sluiten" className="text-white/45 hover:text-white">
                ✕
              </button>
            </div>
            <div className="flex flex-wrap gap-1 border-b border-white/10 px-3 py-1.5 text-[10px]">
              <button type="button" onClick={() => void focusOp(gekozen, 1)} className={focus?.id === gekozen && focus.diepte === 1 ? knopAan : knop}>
                Focus: buren
              </button>
              <button type="button" onClick={() => void focusOp(gekozen, 2)} className={focus?.id === gekozen && focus.diepte === 2 ? knopAan : knop}>
                Focus: 2 stappen
              </button>
              <button type="button" onClick={() => handle.current?.vliegNaar(gekozen)} className={knop}>
                Vlieg hierheen
              </button>
              <button
                type="button"
                onClick={() => {
                  setPadVan(gekozen);
                  setPad(null);
                  handle.current?.setPad(null);
                  setGekozen(null);
                  setDetail(null);
                  setMelding("Klik nu op de ster waar het pad naartoe moet.");
                }}
                className={knop}
              >
                Pad vanaf hier
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {!detail && <p className="text-white/40">Laden…</p>}
              {detail && (
                <>
                  {detail.node.href && (
                    <a href={detail.node.href} target="_blank" rel="noopener noreferrer" className="mb-2 inline-block text-brand-mint underline">
                      Open de bron ↗
                    </a>
                  )}
                  {detail.scores && (
                    <p className="mb-2 text-[10px] text-white/45">
                      centraliteit {detail.scores.centraal} · brugfunctie {detail.scores.brug} (× 1000) · {detail.buren.length} {detail.buren.length === 1 ? "verbinding" : "verbindingen"}
                    </p>
                  )}
                  {detail.begrippen.length > 0 && (
                    <p className="mb-2 flex flex-wrap gap-1">
                      {detail.begrippen.map((b) => (
                        <span key={b} className="rounded-full bg-[rgba(242,227,107,0.14)] px-1.5 py-0.5 text-[10px] text-[#F2E36B]">
                          {b}
                        </span>
                      ))}
                    </p>
                  )}
                  <ul className="space-y-2">
                    {detail.passages.slice(0, 6).map((ps) => (
                      <li key={ps.id} className="rounded-md bg-white/[0.04] px-2 py-1.5">
                        <p className="font-medium text-white/85">{ps.title}</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-white/55">{ps.tekst}</p>
                      </li>
                    ))}
                  </ul>
                  {detail.buren.length > 0 && (
                    <>
                      <p className="mb-1 mt-3 text-[10px] uppercase tracking-[0.14em] text-white/35">Verbonden met</p>
                      <ul className="space-y-1">
                        {detail.buren.map((b) => (
                          <li key={b.id}>
                            <button
                              type="button"
                              onClick={() => {
                                handle.current?.vliegNaar(b.id);
                                void kies(b.id);
                              }}
                              className="flex w-full items-center gap-2 text-left hover:underline"
                            >
                              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: themaKleur(byId.get(b.id)?.thema) }} />
                              <span className="min-w-0 flex-1 truncate text-white/80">{b.label}</span>
                              <span className="flex-shrink-0 text-[10px] text-white/35">{b.weight}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>
          </aside>
        )}

        {pad && !gekozen && pad.knopen.length > 0 && (
          <aside className="absolute left-3 top-3 max-h-[calc(70vh-1.5rem)] w-72 overflow-y-auto rounded-xl border border-[#FFC46B]/40 bg-[#0e1116]/95 p-3 text-xs shadow-xl backdrop-blur" aria-live="polite">
            <p className="font-semibold text-white/90">
              Kortste pad: {pad.knopen.length - 1} {pad.knopen.length - 1 === 1 ? "stap" : "stappen"}
            </p>
            <ol className="mt-2 space-y-1.5">
              {pad.knopen.map((k, i) => (
                <li key={k.id}>
                  <button
                    type="button"
                    onClick={() => {
                      handle.current?.vliegNaar(k.id);
                      void kies(k.id);
                    }}
                    className="flex w-full items-start gap-2 text-left hover:underline"
                  >
                    <span className="w-4 flex-shrink-0 text-white/35">{i + 1}.</span>
                    <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: themaKleur(byId.get(k.id)?.thema) }} />
                    <span className="min-w-0 flex-1 truncate text-white/85">{k.label}</span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>
    </div>
  );
}
