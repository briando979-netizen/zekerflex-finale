"use client";

import { useEffect, useRef, useState } from "react";
import { HOME_SECTIES, MAX_EIGEN_BLOKKEN, eigenSleutel, isStandaardHomeIndeling, normalizeHomeIndeling, type HomeIndeling, type HomeItem } from "@/lib/ontwerp/home";
import { BLOK_SOORTEN, leegBlok, nieuwId, type Blok, type BlokSoort } from "@/lib/ontwerp/paginas";
import { BlokKaart } from "@/components/admin/ontwerper/PaginasPaneel";

// ---------------------------------------------------------------------------
// Tabblad Homepage: de blokken onder de kop verbergen en verplaatsen. Elke
// wijziging wordt na een tel als concept bewaard en is meteen te zien in het
// voorbeeld (/?concept=1, alleen voor beheerders). "Live zetten" zet het
// concept op de echte homepage; "Standaard" zet de oorspronkelijke indeling terug.
// ---------------------------------------------------------------------------

const paneel = { background: "var(--a-panel)", border: "1px solid var(--a-border)" };
const verborgenStijl = { background: "var(--a-elev)", border: "1px dashed var(--a-border)" };
const mute = { color: "var(--a-mute)" };
const klein = "grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-xs disabled:opacity-30";
const knopStijl = { background: "var(--a-elev)", color: "var(--a-text)" };
const NAAM = new Map<string, { naam: string; uitleg: string }>(HOME_SECTIES.map((s) => [s.id, s]));
const gelijk = (a: HomeIndeling, b: HomeIndeling) => JSON.stringify(normalizeHomeIndeling(a)) === JSON.stringify(normalizeHomeIndeling(b));

type Antwoord = { live?: HomeIndeling; eigen?: boolean; concept?: HomeIndeling; error?: { message?: string } };

async function stuur(init: RequestInit): Promise<Antwoord> {
  const r = await fetch("/api/admin/ontwerp/home", { ...init, headers: { "Content-Type": "application/json" } });
  const d = (await r.json().catch(() => null)) as Antwoord | null;
  if (!r.ok || !d) throw new Error(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
  return d;
}

export function HomePaneel({ onVoorbeeldPad, onVernieuw }: { onVoorbeeldPad: (pad: string | null) => void; onVernieuw: () => void }) {
  const [indeling, setIndeling] = useState<HomeIndeling | null>(null);
  const [live, setLive] = useState<HomeIndeling | null>(null);
  const [eigen, setEigen] = useState(false);
  const [status, setStatus] = useState<"bewaard" | "gewijzigd" | "bezig" | "fout">("bewaard");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout?: boolean } | null>(null);
  // welk eigen blok open staat om te bewerken
  const [open, setOpen] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // het voorbeeld toont de homepage met het concept zolang dit tabblad open is
  useEffect(() => {
    // de indeling hoort bij de homepagina voor bedrijven (sinds 11 nov 2026 op /bedrijven)
    onVoorbeeldPad("/bedrijven?concept=1");
    return () => onVoorbeeldPad(null);
  }, [onVoorbeeldPad]);

  useEffect(() => {
    fetch("/api/admin/ontwerp/home", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Antwoord | null) => {
        if (!d?.live || !d.concept) return;
        setLive(d.live);
        setEigen(Boolean(d.eigen));
        setIndeling(d.concept);
      })
      .catch(() => setMelding({ tekst: "De indeling kon niet worden geladen.", fout: true }));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!indeling || !live) {
    return (
      <p className="text-sm" style={mute}>
        Laden…
      </p>
    );
  }

  function zet(n: HomeIndeling) {
    setIndeling(n);
    setStatus("gewijzigd");
    setMelding(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setStatus("bezig");
      stuur({ method: "PUT", body: JSON.stringify({ actie: "concept", indeling: n }) })
        .then(() => {
          setStatus("bewaard");
          onVernieuw();
        })
        .catch(() => setStatus("fout"));
    }, 600);
  }

  const verborgen = new Set(indeling.verborgen);
  const verplaats = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= indeling.volgorde.length) return;
    const v = [...indeling.volgorde];
    const [x] = v.splice(i, 1);
    if (x) v.splice(j, 0, x);
    zet({ ...indeling, volgorde: v });
  };
  const toon = (id: HomeItem, aan: boolean) => zet({ ...indeling, verborgen: aan ? indeling.verborgen.filter((x) => x !== id) : [...indeling.verborgen, id] });
  const afwijkend = !gelijk(indeling, live);
  const blokOp = new Map(indeling.eigen.map((b) => [eigenSleutel(b), b] as const));

  // eigen blokken: erbij (onderaan, vóór de slotoproep), wijzigen, dupliceren, weg
  function blokErbij(soort: BlokSoort) {
    if (!indeling || indeling.eigen.length >= MAX_EIGEN_BLOKKEN) return;
    const b = leegBlok(soort);
    const v = [...indeling.volgorde];
    const slot = v.indexOf("oproep");
    v.splice(slot < 0 ? v.length : slot, 0, eigenSleutel(b));
    zet({ ...indeling, eigen: [...indeling.eigen, b], volgorde: v });
    setOpen(eigenSleutel(b));
  }
  const zetBlok = (b: Blok) => zet({ ...indeling, eigen: indeling.eigen.map((x) => (x.id === b.id ? b : x)) });
  function dupliceer(b: Blok) {
    if (!indeling || indeling.eigen.length >= MAX_EIGEN_BLOKKEN) return;
    const kopie = { ...b, id: nieuwId() };
    const v = [...indeling.volgorde];
    v.splice(v.indexOf(eigenSleutel(b)) + 1, 0, eigenSleutel(kopie));
    zet({ ...indeling, eigen: [...indeling.eigen, kopie], volgorde: v });
  }
  function weg(b: Blok) {
    if (!indeling || !window.confirm("Dit eigen blok weghalen?")) return;
    const k = eigenSleutel(b);
    zet({ ...indeling, eigen: indeling.eigen.filter((x) => x.id !== b.id), volgorde: indeling.volgorde.filter((x) => x !== k), verborgen: indeling.verborgen.filter((x) => x !== k) });
  }

  async function liveZetten() {
    if (timer.current) clearTimeout(timer.current);
    setBezig(true);
    setMelding(null);
    try {
      const d = await stuur({ method: "PUT", body: JSON.stringify({ actie: "publiceer", indeling }) });
      if (d.live) {
        setLive(d.live);
        setIndeling(d.live);
      }
      setEigen(Boolean(d.eigen));
      setStatus("bewaard");
      setMelding({ tekst: d.eigen ? "Live. Bezoekers zien de homepage nu in deze indeling." : "Gelijk aan de standaard: de oorspronkelijke homepage staat live." });
      onVernieuw();
    } catch (e) {
      setMelding({ tekst: e instanceof Error ? e.message : "Live zetten lukte niet.", fout: true });
    } finally {
      setBezig(false);
    }
  }

  async function standaard() {
    if (!window.confirm("De homepage terugzetten naar de oorspronkelijke indeling? Je concept vervalt ook.")) return;
    if (timer.current) clearTimeout(timer.current);
    setBezig(true);
    setMelding(null);
    try {
      const d = await stuur({ method: "DELETE" });
      if (d.live) {
        setLive(d.live);
        setIndeling(d.live);
      }
      setEigen(false);
      setStatus("bewaard");
      setMelding({ tekst: "De oorspronkelijke indeling staat weer live." });
      onVernieuw();
    } catch (e) {
      setMelding({ tekst: e instanceof Error ? e.message : "Dat lukte niet.", fout: true });
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-3">
      <section className="space-y-3 rounded-xl p-4" style={paneel}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
          Homepage-indeling
        </h2>
        <p className="text-xs" style={mute}>
          Verberg blokken of zet ze in een andere volgorde. Je ziet het meteen in het voorbeeld (alleen jij); bezoekers pas na Live zetten. {eigen ? "Er staat een eigen indeling live." : "Nu staat de standaardindeling live."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={liveZetten} disabled={bezig || !afwijkend || status === "bezig"} className="a-button a-button-primary text-xs disabled:opacity-50">
            {bezig ? "Bezig…" : "Live zetten"}
          </button>
          {afwijkend ? (
            <button type="button" onClick={() => zet(live)} disabled={bezig} className="a-button text-xs">
              Concept weggooien
            </button>
          ) : null}
          {eigen || !isStandaardHomeIndeling(indeling) ? (
            <button type="button" onClick={standaard} disabled={bezig} className="a-button text-xs">
              Terug naar de standaard
            </button>
          ) : null}
          <span className="text-[11px]" style={{ color: status === "fout" ? "var(--a-crit)" : "var(--a-mute)" }} aria-live="polite">
            {status === "bezig" ? "Concept bewaren…" : status === "gewijzigd" ? "Gewijzigd" : status === "fout" ? "Concept bewaren lukte niet" : afwijkend ? "Concept bewaard, nog niet live" : "Gelijk aan live"}
          </span>
        </div>
        {melding ? (
          <p role={melding.fout ? "alert" : "status"} className="text-xs font-semibold" style={{ color: melding.fout ? "var(--a-crit)" : "var(--a-ok-ink)" }}>
            {melding.tekst}
          </p>
        ) : null}
        {verborgen.has("hoe") ? (
          <p className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: "var(--a-warn-soft)", color: "var(--a-warn-ink)" }}>
            De knop &ldquo;Hoe het werkt&rdquo; in het hoofdmenu springt naar dit blok. Verberg je het, verberg dan ook die knop (tabblad Menu).
          </p>
        ) : null}
      </section>

      <ol className="space-y-1.5" aria-label="Blokken van de homepage, van boven naar beneden">
        <li className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}>
          <span className="font-semibold" style={{ color: "var(--a-text)" }}>
            Kop met foto
          </span>
          <span style={mute}>staat altijd bovenaan</span>
        </li>
        {indeling.volgorde.map((id, i) => {
          const blok = blokOp.get(id);
          if (blok) {
            return (
              <BlokKaart
                key={id}
                blok={blok}
                open={open === id}
                onOpen={() => setOpen((o) => (o === id ? null : id))}
                onZet={zetBlok}
                onOmhoog={() => verplaats(i, -1)}
                onOmlaag={() => verplaats(i, 1)}
                onDupliceer={() => dupliceer(blok)}
                onWeg={() => weg(blok)}
                eerste={i === 0}
                laatste={i === indeling.volgorde.length - 1}
              />
            );
          }
          const info = NAAM.get(id);
          const aan = !verborgen.has(id);
          return (
            // verborgen: gestippelde rand en een andere achtergrond (geen doorzichtigheid: de tekst moet leesbaar blijven)
            <li key={id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={aan ? paneel : verborgenStijl}>
              <label className="flex min-w-0 flex-1 items-start gap-2">
                <input type="checkbox" checked={aan} onChange={(e) => toon(id, e.target.checked)} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold" style={{ color: "var(--a-text)" }}>
                    {info?.naam ?? id}
                    {aan ? "" : " (verborgen)"}
                  </span>
                  <span className="block truncate text-[11px]" style={mute}>
                    {info?.uitleg}
                  </span>
                </span>
              </label>
              <button type="button" onClick={() => verplaats(i, -1)} disabled={i === 0} aria-label={`${info?.naam ?? id} omhoog`} className={klein} style={knopStijl}>
                ↑
              </button>
              <button type="button" onClick={() => verplaats(i, 1)} disabled={i === indeling.volgorde.length - 1} aria-label={`${info?.naam ?? id} omlaag`} className={klein} style={knopStijl}>
                ↓
              </button>
            </li>
          );
        })}
      </ol>

      {indeling.eigen.length < MAX_EIGEN_BLOKKEN ? (
        <section className="space-y-2 rounded-xl p-3" style={paneel}>
          <h3 className="text-xs font-semibold" style={{ color: "var(--a-text)" }}>
            Eigen blok toevoegen
          </h3>
          <p className="text-[11px]" style={mute}>
            Dezelfde blokken als op eigen pagina&apos;s. Het nieuwe blok komt boven de slotoproep; verplaats het met de pijltjes.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {BLOK_SOORTEN.map((s) => (
              <button key={s.soort} type="button" onClick={() => blokErbij(s.soort)} title={s.uitleg} className="a-button text-xs">
                + {s.label}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <p className="text-[11px]" style={mute}>
          Je hebt het maximum van {MAX_EIGEN_BLOKKEN} eigen blokken bereikt.
        </p>
      )}
    </div>
  );
}
