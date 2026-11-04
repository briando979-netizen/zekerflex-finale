"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { contrastChecks, normalizeThema, zelfdeThema, type OntwerpStaat, type OntwerpVersie, type Thema } from "@/lib/ontwerp/thema";
import { StijlPaneel } from "@/components/admin/ontwerper/StijlPaneel";
import { TekstenPaneel } from "@/components/admin/ontwerper/TekstenPaneel";
import { AiPaneel } from "@/components/admin/ontwerper/AiPaneel";
import { GeschiedenisPaneel } from "@/components/admin/ontwerper/GeschiedenisPaneel";
import { Voorbeeld } from "@/components/admin/ontwerper/Voorbeeld";
import { PaginasPaneel } from "@/components/admin/ontwerper/PaginasPaneel";
import { MediaPaneel } from "@/components/admin/ontwerper/Media";
import { MenuPaneel } from "@/components/admin/ontwerper/MenuPaneel";
import { HomePaneel } from "@/components/admin/ontwerper/HomePaneel";
import { Assistent } from "@/components/admin/ontwerper/Assistent";

// ---------------------------------------------------------------------------
// De Site-ontwerper: links de keuzes, rechts de echte site als voorbeeld.
// Elke wijziging is meteen te zien, wordt na een tel als concept bewaard en
// kan ongedaan worden gemaakt (Ctrl+Z / Ctrl+Y). Publiceren zet het concept
// live; de vorige versie blijft in Geschiedenis.
// ---------------------------------------------------------------------------

const TABS = [
  { id: "stijl", label: "Stijl" },
  { id: "teksten", label: "Teksten" },
  { id: "home", label: "Homepage" },
  { id: "paginas", label: "Pagina's" },
  { id: "menu", label: "Menu" },
  { id: "media", label: "Media" },
  { id: "ai", label: "AI-hulp" },
  { id: "geschiedenis", label: "Geschiedenis" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const MAX_STAPPEN = 80;
const SAMENVOEG_MS = 600;

type Status = "bewaard" | "gewijzigd" | "bezig" | "fout";

async function post<T>(body: unknown): Promise<T> {
  const r = await fetch("/api/admin/ontwerp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = (await r.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!r.ok || !d) throw new Error(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
  return d;
}

export function Ontwerper({ start }: { start: OntwerpStaat }) {
  const [thema, setThema] = useState<Thema>(start.concept);
  const [bewaard, setBewaard] = useState<Thema>(start.concept);
  const [live, setLive] = useState<Thema>(start.live);
  const [geschiedenis, setGeschiedenis] = useState<OntwerpVersie[]>(start.geschiedenis);
  const [status, setStatus] = useState<Status>("bewaard");
  const [tab, setTab] = useState<Tab>("stijl");
  const [teksten, setTeksten] = useState<Record<string, string>>({});
  const [gekozenTekst, setGekozenTekst] = useState<string | null>(null);
  const [voorbeeldPad, setVoorbeeldPad] = useState<string | null>(null);
  const [vernieuw, setVernieuw] = useState(0);
  const [injectie, setInjectie] = useState<{ key: string; waarde: string; n: number } | null>(null);
  const verversVoorbeeld = useCallback(() => setVernieuw((n) => n + 1), []);
  const [publiceerOpen, setPubliceerOpen] = useState(false);
  const [notitie, setNotitie] = useState("");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout?: boolean } | null>(null);
  const [stappen, setStappen] = useState({ terug: 0, vooruit: 0 });
  const terug = useRef<Thema[]>([]);
  const vooruit = useRef<Thema[]>([]);
  const laatsteStap = useRef(0);
  const huidig = useRef<Thema>(start.concept);

  const zetThema = useCallback((n: Thema) => {
    huidig.current = n;
    setThema(n);
    setStappen({ terug: terug.current.length, vooruit: vooruit.current.length });
  }, []);

  /** Elke wijziging: vorige stand op de ongedaan-stapel (snelle schuifbewegingen tellen als één stap). */
  const wijzig = useCallback(
    (next: Thema, samenvoegen = false) => {
      const n = normalizeThema(next);
      if (zelfdeThema(n, huidig.current)) return;
      const nu = Date.now();
      if (!(samenvoegen && nu - laatsteStap.current < SAMENVOEG_MS)) {
        terug.current = [...terug.current, huidig.current].slice(-MAX_STAPPEN);
        vooruit.current = [];
      }
      laatsteStap.current = nu;
      zetThema(n);
    },
    [zetThema],
  );

  const ongedaan = useCallback(() => {
    const vorige = terug.current.at(-1);
    if (!vorige) return;
    terug.current = terug.current.slice(0, -1);
    vooruit.current = [...vooruit.current, huidig.current];
    laatsteStap.current = 0;
    zetThema(vorige);
  }, [zetThema]);

  const opnieuw = useCallback(() => {
    const volgende = vooruit.current.at(-1);
    if (!volgende) return;
    vooruit.current = vooruit.current.slice(0, -1);
    terug.current = [...terug.current, huidig.current];
    laatsteStap.current = 0;
    zetThema(volgende);
  }, [zetThema]);

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, behalve in een tekstveld (daar doet de browser het zelf)
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      const doel = e.target as HTMLElement | null;
      if (doel && (doel.tagName === "INPUT" || doel.tagName === "TEXTAREA" || doel.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        ongedaan();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        opnieuw();
      }
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, [ongedaan, opnieuw]);

  // concept automatisch bewaren, een tel na de laatste wijziging
  useEffect(() => {
    if (zelfdeThema(thema, bewaard)) {
      setStatus((s) => (s === "gewijzigd" ? "bewaard" : s));
      return;
    }
    setStatus("gewijzigd");
    const t = window.setTimeout(async () => {
      setStatus("bezig");
      try {
        const d = await post<{ concept: Thema }>({ actie: "concept", thema });
        setBewaard(d.concept);
        setStatus("bewaard");
      } catch {
        setStatus("fout");
      }
    }, 1200);
    return () => window.clearTimeout(t);
  }, [thema, bewaard]);

  // nog niet bewaard: waarschuw bij weggaan
  useEffect(() => {
    if (status !== "gewijzigd" && status !== "bezig") return;
    const weg = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", weg);
    return () => window.removeEventListener("beforeunload", weg);
  }, [status]);

  async function publiceer() {
    setBezig(true);
    setMelding(null);
    try {
      if (!zelfdeThema(thema, bewaard)) {
        const d = await post<{ concept: Thema }>({ actie: "concept", thema });
        setBewaard(d.concept);
      }
      const d = await post<OntwerpStaat>({ actie: "publiceer", notitie });
      setLive(d.live);
      setGeschiedenis(d.geschiedenis);
      setStatus("bewaard");
      setPubliceerOpen(false);
      setNotitie("");
      setMelding({ tekst: "Gepubliceerd. Bezoekers zien de nieuwe stijl vanaf nu." });
    } catch (e) {
      setMelding({ tekst: e instanceof Error ? e.message : "Publiceren lukte niet.", fout: true });
    } finally {
      setBezig(false);
    }
  }

  async function zetTerug(v: OntwerpVersie) {
    setBezig(true);
    setMelding(null);
    try {
      const d = await post<{ concept: Thema }>({ actie: "terugzetten", id: v.id });
      wijzig(d.concept);
      setBewaard(d.concept);
      setTab("stijl");
      setMelding({ tekst: "Die versie staat nu in je concept. Bekijk hem in het voorbeeld en publiceer als het goed is." });
    } catch (e) {
      setMelding({ tekst: e instanceof Error ? e.message : "Terugzetten lukte niet.", fout: true });
    } finally {
      setBezig(false);
    }
  }

  const kiesTekst = useCallback((key: string) => {
    setTab("teksten");
    setGekozenTekst(key);
  }, []);
  const tekstKeuze = useCallback((key: string | null) => setGekozenTekst(key), []);
  const conceptAnders = !zelfdeThema(thema, live);
  const slecht = contrastChecks(thema).filter((c) => !c.ok);
  const statusTekst: Record<Status, string> = {
    bewaard: "Concept bewaard",
    gewijzigd: "Wijzigingen…",
    bezig: "Bezig met bewaren…",
    fout: "Bewaren lukte niet, we proberen het bij de volgende wijziging opnieuw",
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl p-3" style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)" }}>
        <span role="status" className="text-xs font-semibold" style={{ color: status === "fout" ? "var(--a-crit)" : "var(--a-mute)" }}>
          {statusTekst[status]}
        </span>
        {conceptAnders ? (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--a-warn-soft)", color: "var(--a-warn-ink)" }}>
            Concept is nog niet live
          </span>
        ) : (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--a-ok-soft)", color: "var(--a-ok-ink)" }}>
            Gelijk aan live
          </span>
        )}
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={ongedaan} disabled={!stappen.terug} className="a-button text-xs disabled:opacity-40" title="Ctrl+Z">
            ↶ Ongedaan maken
          </button>
          <button type="button" onClick={opnieuw} disabled={!stappen.vooruit} className="a-button text-xs disabled:opacity-40" title="Ctrl+Y">
            ↷ Opnieuw
          </button>
          <button type="button" onClick={() => wijzig(live)} disabled={!conceptAnders} className="a-button text-xs disabled:opacity-40">
            Concept weggooien
          </button>
          <button type="button" onClick={() => setPubliceerOpen(true)} disabled={!conceptAnders || bezig} className="a-button a-button-primary text-xs disabled:opacity-40">
            Publiceren…
          </button>
        </span>
      </div>

      {melding ? (
        <p role={melding.fout ? "alert" : "status"} className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: melding.fout ? "var(--a-crit-soft)" : "var(--a-ok-soft)", color: melding.fout ? "var(--a-crit)" : "var(--a-ok-ink)" }}>
          {melding.tekst}
        </p>
      ) : null}

      {publiceerOpen ? (
        <div role="dialog" aria-modal="true" aria-labelledby="publiceer-kop" className="space-y-3 rounded-xl p-4" style={{ background: "var(--a-panel)", border: "2px solid var(--a-accent)" }}>
          <h2 id="publiceer-kop" className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
            Dit concept live zetten?
          </h2>
          {slecht.length ? (
            <p className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "var(--a-warn-soft)", color: "var(--a-warn-ink)" }}>
              Let op: {slecht.map((c) => c.label.toLowerCase()).join("; ")} {slecht.length === 1 ? "is" : "zijn"} niet goed leesbaar (onder 4,5 : 1). Je kunt toch publiceren.
            </p>
          ) : (
            <p className="text-xs" style={{ color: "var(--a-ok-ink)" }}>
              Alle kleurcombinaties zijn goed leesbaar.
            </p>
          )}
          <label className="block">
            <span className="mb-1 block text-xs" style={{ color: "var(--a-mute)" }}>
              Notitie bij deze versie (mag leeg)
            </span>
            <input
              autoFocus
              value={notitie}
              onChange={(e) => setNotitie(e.target.value)}
              maxLength={200}
              placeholder="Bijvoorbeeld: najaarskleuren"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" }}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={publiceer} disabled={bezig} className="a-button a-button-primary text-sm">
              {bezig ? "Bezig…" : "Ja, publiceren"}
            </button>
            <button type="button" onClick={() => setPubliceerOpen(false)} className="a-button text-sm">
              Nog niet
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div role="tablist" aria-label="Onderdelen van de ontwerper" className="grid grid-cols-4 gap-1 rounded-xl p-1" style={{ background: "var(--a-elev)" }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`ontwerper-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`ontwerper-paneel-${t.id}`}
                onClick={() => setTab(t.id)}
                className="rounded-lg px-2 py-1.5 text-xs font-semibold"
                style={{ background: tab === t.id ? "var(--a-panel)" : "transparent", color: tab === t.id ? "var(--a-text)" : "var(--a-mute)", boxShadow: tab === t.id ? "var(--a-shadow-sm)" : "none" }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div id="ontwerper-paneel-stijl" role="tabpanel" aria-labelledby="ontwerper-tab-stijl" hidden={tab !== "stijl"}>
            <StijlPaneel thema={thema} onChange={wijzig} />
          </div>
          {/* blijft bestaan als je wisselt: ingetypte teksten gaan niet verloren */}
          <div id="ontwerper-paneel-teksten" role="tabpanel" aria-labelledby="ontwerper-tab-teksten" hidden={tab !== "teksten"}>
            <TekstenPaneel gekozen={gekozenTekst} onKies={tekstKeuze} onTeksten={setTeksten} injectie={injectie} />
          </div>
          {/* het concept staat op de server, dus dit paneel mag verdwijnen als je wisselt */}
          {tab === "home" ? (
            <div id="ontwerper-paneel-home" role="tabpanel" aria-labelledby="ontwerper-tab-home">
              <HomePaneel onVoorbeeldPad={setVoorbeeldPad} onVernieuw={verversVoorbeeld} />
            </div>
          ) : null}
          {/* blijft ook bestaan: een half bewerkte pagina gaat niet verloren als je even naar Stijl gaat */}
          <div id="ontwerper-paneel-paginas" role="tabpanel" aria-labelledby="ontwerper-tab-paginas" hidden={tab !== "paginas"}>
            <PaginasPaneel onVoorbeeldPad={setVoorbeeldPad} onVernieuw={verversVoorbeeld} />
          </div>
          {tab === "menu" ? (
            <div id="ontwerper-paneel-menu" role="tabpanel" aria-labelledby="ontwerper-tab-menu">
              <MenuPaneel onVernieuw={verversVoorbeeld} />
            </div>
          ) : null}
          {tab === "media" ? (
            <div id="ontwerper-paneel-media" role="tabpanel" aria-labelledby="ontwerper-tab-media">
              <MediaPaneel />
            </div>
          ) : null}
          {/* blijft bestaan: het gesprek met de assistent gaat niet verloren als je even wisselt */}
          <div id="ontwerper-paneel-ai" role="tabpanel" aria-labelledby="ontwerper-tab-ai" hidden={tab !== "ai"} className="space-y-3">
            <Assistent thema={thema} teksten={teksten} onStijl={(t) => wijzig(t)} onTekst={(key, waarde) => setInjectie({ key, waarde, n: Date.now() })} />
            <AiPaneel thema={thema} onProbeer={(t) => wijzig(t)} />
          </div>
          {tab === "geschiedenis" ? (
            <div id="ontwerper-paneel-geschiedenis" role="tabpanel" aria-labelledby="ontwerper-tab-geschiedenis">
              <GeschiedenisPaneel versies={geschiedenis} onTerug={zetTerug} bezig={bezig} />
            </div>
          ) : null}
        </div>
        <div className="xl:sticky xl:top-4 xl:h-[calc(100vh-7rem)]">
          <Voorbeeld thema={thema} teksten={teksten} tekstModus={tab === "teksten"} onKiesTekst={kiesTekst} vastPad={voorbeeldPad} vernieuw={vernieuw} />
        </div>
      </div>
    </div>
  );
}
