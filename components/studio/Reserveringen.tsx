"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { foutVan } from "@/components/studio/context";
import { Card, Empty, ICalendar, PageHead, Pill, Stat, btn, input } from "@/components/studio/ui";
import { plusDagen } from "@/lib/horeca/reserveren";
import { datumTekst, personenTekst, type ReserveerStatus, type SiteReservering } from "@/lib/sites/reserveren";

// ---------------------------------------------------------------------------
// Websitestudio → Reserveringen: het reserveringsboek van de eigen website
// (lib/sites/reserveringen-opslag.ts). Per dag of de komende twee weken, met
// per gast aangekomen / niet gekomen / annuleren, zelf een reservering
// invoeren (een gast die belt) en alles als CSV. De tijden en instellingen
// staan in het blok Tafel reserveren (Website).
// Data: GET/POST/PATCH /api/werkgever/sites/reserveringen.
// ---------------------------------------------------------------------------

const API = "/api/werkgever/sites/reserveringen";

const STATUS: Record<ReserveerStatus, { label: string; tone: "info" | "ok" | "crit" | "neutral" }> = {
  bevestigd: { label: "Bevestigd", tone: "info" },
  aangekomen: { label: "Aangekomen", tone: "ok" },
  "niet-gekomen": { label: "Niet gekomen", tone: "crit" },
  geannuleerd: { label: "Geannuleerd", tone: "neutral" },
};

type Weergave = "dag" | "komend";

interface Antwoord {
  reserveringen: SiteReservering[];
  van: string;
  tot: string;
  vandaag: string;
  aan: boolean;
}

/** Puntkomma's en een BOM, zodat Excel het Nederlands opent; geen formules uit wat gasten typen. */
function naarCsv(rows: SiteReservering[]): string {
  const cel = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  const kop = ["Nummer", "Datum", "Tijd", "Personen", "Naam", "E-mail", "Telefoon", "Opmerking", "Status", "Via"];
  const regels = rows.map((r) => [r.nr, r.datum, r.tijd, String(r.personen), r.naam, r.email, r.telefoon, r.opmerking, STATUS[r.status].label, r.bron === "website" ? "Website" : "Zelf ingevoerd"]);
  return "﻿" + [kop, ...regels].map((r) => r.map(cel).join(";")).join("\r\n");
}

const gastenTekst = (n: number) => `${n} ${n === 1 ? "gast" : "gasten"}`;

const LEEG = { datum: "", tijd: "19:00", personen: "2", naam: "", email: "", telefoon: "", opmerking: "" };

export default function Reserveringen() {
  const [data, setData] = useState<Antwoord | null>(null);
  const [laadFout, setLaadFout] = useState<string | null>(null);
  const [weergave, setWeergave] = useState<Weergave>("dag");
  /** de gekozen dag; leeg tot de server zegt welke dag het vandaag is (Nederlandse tijd) */
  const [dag, setDag] = useState("");
  const [bezig, setBezig] = useState<string | null>(null);
  const [actieFout, setActieFout] = useState<string | null>(null);
  const [nieuw, setNieuw] = useState(LEEG);
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [nieuwFout, setNieuwFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);

  const laad = useCallback(async (van: string, w: Weergave) => {
    const q = van ? `?van=${van}&tot=${w === "dag" ? van : plusDagen(van, 13)}` : "";
    const res = await fetch(`${API}${q}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setLaadFout(await foutVan(res, "De reserveringen konden niet laden. Probeer het opnieuw."));
    setLaadFout(null);
    const d = (await res.json()) as Antwoord;
    setData(d);
    if (!van) setDag(d.van);
  }, []);

  useEffect(() => {
    void laad(dag, weergave);
    // nieuwe online reserveringen komen vanzelf binnen zolang het tabblad openstaat
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void laad(dag, weergave);
    }, 60_000);
    return () => clearInterval(t);
  }, [laad, dag, weergave]);

  const lijst = useMemo(() => data?.reserveringen ?? [], [data]);
  const actief = lijst.filter((r) => r.status !== "geannuleerd");
  const gasten = actief.reduce((som, r) => som + r.personen, 0);
  const perDag = useMemo(() => {
    const m = new Map<string, SiteReservering[]>();
    for (const r of lijst) m.set(r.datum, [...(m.get(r.datum) ?? []), r]);
    return [...m.entries()];
  }, [lijst]);

  const zetStatus = async (r: SiteReservering, status: ReserveerStatus) => {
    setBezig(r.id);
    setActieFout(null);
    const res = await fetch(API, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, status }) }).catch(() => null);
    setBezig(null);
    if (!res?.ok) return setActieFout(await foutVan(res, "Dat lukte niet. Probeer het opnieuw."));
    // de versie van de server overnemen (AGENTS.md: na een PATCH)
    const { reservering } = (await res.json()) as { reservering: SiteReservering };
    setData((d) => (d ? { ...d, reserveringen: d.reserveringen.map((x) => (x.id === reservering.id ? reservering : x)) } : d));
  };

  const voegToe = async (e: FormEvent) => {
    e.preventDefault();
    setNieuwFout(null);
    const body = { ...nieuw, datum: nieuw.datum || dag, personen: Math.round(Number(nieuw.personen)) || 0 };
    const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!res?.ok) return setNieuwFout(await foutVan(res, "Opslaan lukte niet."));
    const { reservering } = (await res.json()) as { reservering: SiteReservering };
    setNieuw(LEEG);
    setNieuwOpen(false);
    setMelding(`Reservering voor ${reservering.naam} op ${datumTekst(reservering.datum)} om ${reservering.tijd} staat erin.`);
    setTimeout(() => setMelding(null), 5000);
    await laad(dag, weergave);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([naarCsv(lijst)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `reserveringen-${data?.van ?? dag}${weergave === "komend" ? `-tot-${data?.tot ?? ""}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (laadFout && !data) {
    return (
      <>
        <PageHead title="Reserveringen" />
        <Card>
          <p role="alert" className="text-sm text-[#b42318]">{laadFout}</p>
          <button type="button" className={`${btn.secondary} mt-3`} onClick={() => void laad(dag, weergave)}>Opnieuw laden</button>
        </Card>
      </>
    );
  }

  if (data && !data.aan) {
    return (
      <>
        <PageHead title="Reserveringen" />
        <Card>
          <Empty icon={<ICalendar />} title="Online reserveren staat nog uit" text="Zet het blok Tafel reserveren op je website. Gasten kiezen dan zelf een dag, een tijd en met hoeveel ze komen, en jij ziet alles hier.">
            <Link href="/studio/website" className={btn.primary}>Naar je website</Link>
          </Empty>
        </Card>
      </>
    );
  }

  const isVandaag = data ? dag === data.vandaag : false;
  return (
    <>
      <PageHead
        title="Reserveringen"
        sub="Online gereserveerde tafels en wat je zelf invoert. De tijden en het aantal plaatsen stel je in bij het blok Tafel reserveren onder Website."
        actions={
          <>
            <button type="button" className={btn.secondary} onClick={download} disabled={!lijst.length}>Exporteer CSV</button>
            <button type="button" className={btn.primary} onClick={() => setNieuwOpen((o) => !o)} aria-expanded={nieuwOpen}>Reservering toevoegen</button>
          </>
        }
      />
      {melding && <p role="status" className="mb-4 rounded-xl bg-[#cdfed4] px-4 py-2.5 text-sm font-semibold text-[#014b1a]">{melding}</p>}

      {nieuwOpen && (
        <Card title="Reservering toevoegen" className="mb-4">
          <form onSubmit={voegToe} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-sm font-medium">Dag<input type="date" className={input} value={nieuw.datum || dag} onChange={(e) => setNieuw({ ...nieuw, datum: e.target.value })} required /></label>
            <label className="grid gap-1 text-sm font-medium">Tijd<input type="time" className={input} value={nieuw.tijd} onChange={(e) => setNieuw({ ...nieuw, tijd: e.target.value })} required /></label>
            <label className="grid gap-1 text-sm font-medium">Personen<input type="number" min={1} max={500} className={input} value={nieuw.personen} onChange={(e) => setNieuw({ ...nieuw, personen: e.target.value })} required /></label>
            <label className="grid gap-1 text-sm font-medium">Naam<input className={input} value={nieuw.naam} maxLength={100} onChange={(e) => setNieuw({ ...nieuw, naam: e.target.value })} required /></label>
            <label className="grid gap-1 text-sm font-medium">Telefoon<input type="tel" className={input} value={nieuw.telefoon} maxLength={30} onChange={(e) => setNieuw({ ...nieuw, telefoon: e.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">E-mail (krijgt een bevestiging)<input type="email" className={input} value={nieuw.email} maxLength={200} onChange={(e) => setNieuw({ ...nieuw, email: e.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium sm:col-span-2">Opmerking<input className={input} value={nieuw.opmerking} maxLength={600} onChange={(e) => setNieuw({ ...nieuw, opmerking: e.target.value })} /></label>
            {nieuwFout && <p role="alert" className="text-sm text-[#b42318] sm:col-span-2 lg:col-span-4">{nieuwFout}</p>}
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
              <button type="submit" className={btn.primary}>Opslaan</button>
              <button type="button" className={btn.secondary} onClick={() => setNieuwOpen(false)}>Annuleren</button>
              <p className="self-center text-xs text-[#707070]">Zelf invoeren mag ook als het eigenlijk vol is.</p>
            </div>
          </form>
        </Card>
      )}

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Weergave" className="inline-flex rounded-xl border border-[#d4d4d4] bg-white p-0.5">
            {(["dag", "komend"] as const).map((w) => (
              <button key={w} type="button" aria-pressed={weergave === w} onClick={() => setWeergave(w)} className={`rounded-[10px] px-3 py-1.5 text-sm font-semibold ${weergave === w ? "bg-[#1a1a1a] text-white" : "text-[#303030] hover:bg-black/5"}`}>
                {w === "dag" ? "Per dag" : "Komende 2 weken"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={btn.secondary} onClick={() => setDag(plusDagen(dag, weergave === "dag" ? -1 : -14))} disabled={!dag} aria-label={weergave === "dag" ? "Vorige dag" : "Twee weken terug"}>←</button>
            <input type="date" aria-label="Kies een dag" className={`${input} w-auto`} value={dag} onChange={(e) => e.target.value && setDag(e.target.value)} />
            <button type="button" className={btn.secondary} onClick={() => setDag(plusDagen(dag, weergave === "dag" ? 1 : 14))} disabled={!dag} aria-label={weergave === "dag" ? "Volgende dag" : "Twee weken verder"}>→</button>
            {data && !isVandaag && <button type="button" className={btn.quiet} onClick={() => setDag(data.vandaag)}>Vandaag</button>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Reserveringen" value={actief.length} hint={weergave === "dag" && dag ? datumTekst(dag) : "komende 2 weken"} />
          <Stat label="Gasten" value={gasten} />
          <Stat label="Aangekomen" value={lijst.filter((r) => r.status === "aangekomen").length} />
          <Stat label="Niet gekomen" value={lijst.filter((r) => r.status === "niet-gekomen").length} />
        </div>
      </Card>

      {actieFout && <p role="alert" className="mb-3 text-sm text-[#b42318]">{actieFout}</p>}

      {!data ? (
        <Card><p className="text-sm text-[#616161]">Laden…</p></Card>
      ) : lijst.length === 0 ? (
        <Card>
          <Empty icon={<ICalendar />} title={weergave === "dag" ? "Geen reserveringen op deze dag" : "Geen reserveringen in de komende twee weken"} text="Reserveringen via je website verschijnen hier vanzelf. Belt er iemand? Voer het in met Reservering toevoegen." />
        </Card>
      ) : (
        perDag.map(([d, rijen]) => (
          <Card key={d} title={`${datumTekst(d).replace(/^./, (x) => x.toUpperCase())} · ${gastenTekst(rijen.filter((r) => r.status !== "geannuleerd").reduce((s, r) => s + r.personen, 0))}`} className="mb-4" pad={false}>
            <ul className="divide-y divide-[#ebebeb]">
              {rijen.map((r) => (
                <li key={r.id} className={`grid gap-3 px-5 py-3.5 md:grid-cols-[72px_minmax(0,1fr)_auto] md:items-center ${r.status === "geannuleerd" ? "opacity-60" : ""}`}>
                  <p className="text-lg font-bold tabular-nums text-[#1a1a1a]">{r.tijd}</p>
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1a1a1a]">
                      {r.naam} <span className="font-normal text-[#616161]">· {personenTekst(r.personen)}</span>{" "}
                      <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>{" "}
                      {r.bron === "beheer" && <Pill>Zelf ingevoerd</Pill>}
                    </p>
                    <p className="mt-0.5 text-sm text-[#616161]">
                      {r.telefoon && <a className="underline-offset-2 hover:underline" href={`tel:${r.telefoon.replace(/[^\d+]/g, "")}`}>{r.telefoon}</a>}
                      {r.telefoon && r.email && " · "}
                      {r.email && <a className="underline-offset-2 hover:underline" href={`mailto:${r.email}`}>{r.email}</a>}
                      {r.nr && <span className="text-[#707070]"> · nr {r.nr}</span>}
                    </p>
                    {r.opmerking && <p className="mt-1 rounded-lg bg-[#fff7e0] px-2.5 py-1.5 text-sm text-[#4f4700]">{r.opmerking}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.status === "bevestigd" ? (
                      <>
                        <button type="button" className={btn.secondary} disabled={bezig === r.id} onClick={() => void zetStatus(r, "aangekomen")}>Aangekomen<span className="sr-only">: {r.naam}</span></button>
                        <button type="button" className={btn.secondary} disabled={bezig === r.id} onClick={() => void zetStatus(r, "niet-gekomen")}>Niet gekomen<span className="sr-only">: {r.naam}</span></button>
                        <button type="button" className={btn.danger} disabled={bezig === r.id} onClick={() => void zetStatus(r, "geannuleerd")}>Annuleren<span className="sr-only">: {r.naam}</span></button>
                      </>
                    ) : (
                      <button type="button" className={btn.quiet} disabled={bezig === r.id} onClick={() => void zetStatus(r, "bevestigd")}>Terugzetten<span className="sr-only">: {r.naam}</span></button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </>
  );
}
