"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Melding, Tabs, Veld } from "@/components/rijschool/ui";
import { SOORTEN, SOORT_LABEL, soortLabel } from "@/lib/horeca/soorten";
import { euro } from "@/lib/horeca/weergave";
import { MenukaartTab } from "@/components/horeca/beheer/MenukaartTab";
import { ModulesTab } from "@/components/horeca/beheer/ModulesTab";
import { GegevensTab } from "@/components/horeca/beheer/GegevensTab";
import { BestellingenTab } from "@/components/horeca/beheer/BestellingenTab";
import { TafelsTab } from "@/components/horeca/beheer/TafelsTab";
import { ReserveringenTab } from "@/components/horeca/beheer/ReserveringenTab";
import type { Antwoord, BeheerData, Doe } from "@/components/horeca/beheer/types";

// ---------------------------------------------------------------------------
// Het beheer van het horeca-pakket (/werkgever/horeca): aanzetten, overzicht,
// menukaart, modules & abonnement, gegevens & openingstijden. Elke wijziging is
// één POST naar /api/horeca/beheer, die alles ververst teruggeeft.
// ---------------------------------------------------------------------------

const API = "/api/horeca/beheer";
type Tab = "overzicht" | "reserveringen" | "bestellingen" | "tafels" | "menukaart" | "modules" | "gegevens";
/** De tabbladen; die van een module alleen als die module aan staat. */
const tabsVoor = (modules: string[]): { id: Tab; label: string }[] => [
  { id: "overzicht", label: "Overzicht" },
  ...(modules.includes("reserveren") ? [{ id: "reserveringen" as const, label: "Reserveringen" }] : []),
  ...(modules.includes("bestellen")
    ? [
        { id: "bestellingen" as const, label: "Bestellingen" },
        { id: "tafels" as const, label: "Tafels & QR" },
      ]
    : []),
  { id: "menukaart", label: "Menukaart" },
  { id: "modules", label: "Modules & abonnement" },
  { id: "gegevens", label: "Gegevens & openingstijden" },
];

export function HorecaBeheer() {
  const [data, setData] = useState<Antwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overzicht");

  const laad = useCallback(async () => {
    try {
      setData(await stuur<Antwoord>(API));
    } catch (e) {
      setFout(foutVan(e));
    }
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  const doe: Doe = async (actie, okTekst) => {
    setFout(null);
    setOk(null);
    try {
      setData(await stuur<Antwoord>(API, "POST", actie));
      if (okTekst) setOk(okTekst);
      return true;
    } catch (e) {
      setFout(foutVan(e));
      return false;
    }
  };

  if (!data) return fout ? <Melding fout={fout} /> : <p className="text-sm text-neutralx-500">Laden…</p>;
  if (!data.aan) return <Aanzetten voorstel={data.voorstel} doe={doe} fout={fout} />;

  const z = data.zaak;
  const url = `/horeca/${z.slug}`;
  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-center gap-4 p-5">
        <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl text-lg font-bold text-white" style={{ background: z.kleur }} aria-hidden>
          {z.naam.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold text-ink">{z.naam}</h1>
          <p className="truncate text-sm text-neutralx-600">
            {z.online ? <span className="pill-ok mr-2">Site online</span> : <span className="pill-warn mr-2">Site nog niet online</span>}
            {soortLabel(z.soort)}
            {z.plaats && ` · ${z.plaats}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => void doe({ actie: "online", online: !z.online }, z.online ? "De site is offline gehaald." : "De site staat online.")}>
            {z.online ? "Offline halen" : "Online zetten"}
          </button>
          <a href={url} target="_blank" rel="noopener" className="btn-primary">
            Bekijk de site
          </a>
        </div>
      </section>

      <Tabs tabs={tabsVoor(z.modules)} actief={tab} onKies={setTab} label="Horeca-beheer" />
      <Melding fout={fout} ok={ok} />

      {tab === "overzicht" && <Overzicht data={data} naar={setTab} />}
      {tab === "reserveringen" && z.modules.includes("reserveren") && <ReserveringenTab data={data} doe={doe} />}
      {tab === "bestellingen" && z.modules.includes("bestellen") && <BestellingenTab data={data} doe={doe} />}
      {tab === "tafels" && z.modules.includes("bestellen") && <TafelsTab data={data} doe={doe} />}
      {tab === "menukaart" && <MenukaartTab data={data} doe={doe} />}
      {tab === "modules" && <ModulesTab data={data} doe={doe} />}
      {tab === "gegevens" && <GegevensTab data={data} doe={doe} />}
    </div>
  );
}

function Overzicht({ data, naar }: { data: BeheerData; naar: (t: Tab) => void }) {
  const z = data.zaak;
  const stappen: { klaar: boolean; tekst: string; tab: Tab }[] = [
    { klaar: data.items.length > 0, tekst: `Menukaart: ${data.items.length} ${data.items.length === 1 ? "gerecht" : "gerechten"} (de voorbeelden mag je aanpassen of weghalen)`, tab: "menukaart" },
    { klaar: Boolean(z.adres && z.telefoon), tekst: "Adres, telefoon en openingstijden invullen", tab: "gegevens" },
    { klaar: z.modules.length > 0, tekst: "Modules kiezen die jullie willen gebruiken", tab: "modules" },
    { klaar: z.online, tekst: "De site online zetten (bovenaan)", tab: "overzicht" },
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="card p-5 lg:col-span-2" aria-labelledby="horeca-stappen">
        <h2 id="horeca-stappen" className="font-display text-lg font-bold text-ink">
          Aan de slag
        </h2>
        <ol className="mt-3 space-y-2">
          {stappen.map((s) => (
            <li key={s.tekst}>
              <button type="button" onClick={() => naar(s.tab)} className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-neutralx-50">
                <span className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-xs font-bold ${s.klaar ? "bg-emerald-100 text-ok" : "bg-neutralx-100 text-neutralx-500"}`} aria-hidden>
                  {s.klaar ? "✓" : "•"}
                </span>
                <span className="text-sm text-ink">
                  {s.tekst}
                  <span className="sr-only">{s.klaar ? " (gedaan)" : " (nog te doen)"}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      <section className="card p-5" aria-labelledby="horeca-abonnement">
        <h2 id="horeca-abonnement" className="font-display text-lg font-bold text-ink">
          Abonnement
        </h2>
        <p className="mt-2 font-display text-3xl font-bold text-ink">
          {euro(data.maand.totaalCent)}
          <span className="text-base font-semibold text-neutralx-500"> per maand</span>
        </p>
        <p className="mt-1 text-sm text-neutralx-600">{data.maand.bundel ? "Alles-in-één: goedkoper dan de modules los." : "Basis plus de modules die aan staan."}</p>
        <p className="mt-3 text-xs text-neutralx-500">Voorbeeldprijzen; je betaalt nog niets zolang het abonnement niet is gestart.</p>
        <button type="button" className="btn-ghost mt-4" onClick={() => naar("modules")}>
          Modules bekijken
        </button>
      </section>
    </div>
  );
}

function Aanzetten({ voorstel, doe, fout }: { voorstel: { naam: string; plaats: string; telefoon: string; email: string }; doe: Doe; fout: string | null }) {
  const [v, setV] = useState({ ...voorstel, soort: "restaurant" as string });
  const [bezig, setBezig] = useState(false);
  const zet = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  async function aan(e: FormEvent) {
    e.preventDefault();
    setBezig(true);
    await doe({ actie: "aanzetten", ...v }, "Het horeca-pakket staat aan.");
    setBezig(false);
  }
  return (
    <section className="card mx-auto max-w-2xl p-6">
      <p className="eyebrow">Horeca-pakket</p>
      <h1 className="mt-1 font-display text-2xl font-bold text-ink">Alles voor je zaak onder één dak</h1>
      <p className="mt-2 text-sm leading-relaxed text-neutralx-600">
        Een eigen website met menukaart, en daarna stap voor stap modules erbij: reserveren, bestellen aan tafel met een QR-code, een keukenscherm, afrekenen en takenlijsten.
      </p>
      <form onSubmit={(e) => void aan(e)} className="mt-6 grid gap-4 sm:grid-cols-2">
        <Veld label="Naam van de zaak">
          <input className="field-input" value={v.naam} onChange={zet("naam")} required minLength={2} maxLength={80} />
        </Veld>
        <Veld label="Soort zaak">
          <select className="field-input" value={v.soort} onChange={zet("soort")}>
            {SOORTEN.map((s) => (
              <option key={s} value={s}>
                {SOORT_LABEL[s]}
              </option>
            ))}
          </select>
        </Veld>
        <Veld label="Plaats">
          <input className="field-input" value={v.plaats} onChange={zet("plaats")} maxLength={80} />
        </Veld>
        <Veld label="Telefoon">
          <input className="field-input" type="tel" value={v.telefoon} onChange={zet("telefoon")} maxLength={40} />
        </Veld>
        <Veld label="E-mail voor gasten">
          <input className="field-input" type="email" value={v.email} onChange={zet("email")} maxLength={200} />
        </Veld>
        <div className="sm:col-span-2">
          <Melding fout={fout} />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={bezig}>
            {bezig ? "Bezig…" : "Horeca-pakket aanzetten"}
          </button>
          <p className="mt-2 text-xs text-neutralx-500">Je site staat pas online als je dat zelf aanzet. Tot die tijd zie alleen jij hem. We zetten een voorbeeldkaart klaar die je aanpast.</p>
        </div>
      </form>
    </section>
  );
}
