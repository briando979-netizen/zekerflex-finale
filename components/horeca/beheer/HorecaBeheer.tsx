"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Melding, Tabs, Veld } from "@/components/rijschool/ui";
import { SOORTEN, SOORT_LABEL, soortLabel } from "@/lib/horeca/soorten";
import { MenukaartTab } from "@/components/horeca/beheer/MenukaartTab";
import { ModulesTab } from "@/components/horeca/beheer/ModulesTab";
import { GegevensTab } from "@/components/horeca/beheer/GegevensTab";
import { BestellingenTab } from "@/components/horeca/beheer/BestellingenTab";
import { TafelsTab } from "@/components/horeca/beheer/TafelsTab";
import { ReserveringenTab } from "@/components/horeca/beheer/ReserveringenTab";
import { TakenTab } from "@/components/horeca/beheer/TakenTab";
import { CijfersTab } from "@/components/horeca/beheer/CijfersTab";
import { LiveTab } from "@/components/horeca/beheer/LiveTab";
import { SchermenTab } from "@/components/horeca/beheer/SchermenTab";
import { KassaTab } from "@/components/horeca/beheer/KassaTab";
import type { Antwoord, Doe, Voorstel } from "@/components/horeca/beheer/types";
import { horecaTabs, type BeheerTab } from "@/lib/horeca/tabs";

// ---------------------------------------------------------------------------
// Het beheer van het horeca-pakket (/werkgever/horeca): aanzetten, het
// live-dashboard, de modules (reserveren, bestellen, takenlijsten, cijfers),
// menukaart, schermen, modules & abonnement, gegevens & openingstijden. Elke
// wijziging is één POST naar /api/horeca/beheer, die alles ververst teruggeeft.
// De tabbladen staan in lib/horeca/tabs.ts; elk is ook een onderdeel in het menu
// (/werkgever/horeca?tab=<id>), dus het tabblad volgt het adres.
// ---------------------------------------------------------------------------

const API = "/api/horeca/beheer";

export function HorecaBeheer() {
  const router = useRouter();
  const pad = usePathname();
  const gevraagd = useSearchParams().get("tab");
  const [data, setData] = useState<Antwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [tab, setTab] = useState<BeheerTab>("overzicht");

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
  // de menukaart toont voorraad die intussen door bestellingen (gast, bediening, kassa) is afgeboekt:
  // bij elk openen van het tabblad de data opnieuw ophalen, anders zie je een oude teller
  useEffect(() => {
    if (tab === "menukaart") void laad();
  }, [tab, laad]);
  // ?tab=reserveringen (uit het menu, een tegel op /werkgever of terug van Stripe): dat tabblad,
  // ook als alleen ?tab= verandert (dan blijft dit scherm staan); zonder ?tab= het live-overzicht.
  // Pas na het laden: een module-tabblad alleen als de module aan staat.
  const modules = data?.aan ? data.zaak.modules.join(",") : null;
  useEffect(() => {
    if (modules === null) return;
    const bestaat = horecaTabs(modules.split(",")).find((t) => t.id === gevraagd);
    setTab(bestaat ? bestaat.id : "overzicht");
  }, [gevraagd, modules]);
  // een tabblad kiezen zet het ook in het adres, zodat het menu het goede onderdeel aanwijst
  const kies = useCallback(
    (t: BeheerTab) => {
      setTab(t);
      router.replace(t === "overzicht" ? pad : `${pad}?tab=${t}`, { scroll: false });
    },
    [router, pad],
  );

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

      <Tabs tabs={horecaTabs(z.modules)} actief={tab} onKies={kies} label="Horeca-beheer" />
      <Melding fout={fout} ok={ok} />

      {tab === "overzicht" && <LiveTab data={data} doe={doe} naar={kies} />}
      {tab === "reserveringen" && z.modules.includes("reserveren") && <ReserveringenTab data={data} doe={doe} />}
      {tab === "bestellingen" && z.modules.includes("bestellen") && <BestellingenTab data={data} doe={doe} />}
      {tab === "tafels" && z.modules.includes("bestellen") && <TafelsTab data={data} doe={doe} />}
      {tab === "kassa" && z.modules.includes("kassa") && <KassaTab data={data} doe={doe} />}
      {tab === "taken" && z.modules.includes("taken") && <TakenTab />}
      {tab === "cijfers" && (z.modules.includes("bestellen") || z.modules.includes("reserveren")) && <CijfersTab />}
      {tab === "menukaart" && <MenukaartTab data={data} doe={doe} />}
      {tab === "schermen" && <SchermenTab data={data} />}
      {tab === "modules" && <ModulesTab data={data} doe={doe} />}
      {tab === "gegevens" && <GegevensTab data={data} doe={doe} />}
    </div>
  );
}

function Aanzetten({ voorstel, doe, fout }: { voorstel: Voorstel; doe: Doe; fout: string | null }) {
  // vooraf ingevuld met wat het bedrijf ons al gaf; zonder soort uit de KvK-inschrijving een restaurant
  const [v, setV] = useState({ ...voorstel, soort: (voorstel.soort ?? "restaurant") as string });
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
      <p className="mt-2 text-sm leading-relaxed text-neutralx-600">We hebben alvast ingevuld wat we van je bedrijf weten. Klopt iets niet, pas het dan hier aan.</p>
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
        <Veld label="Adres">
          <input className="field-input" value={v.adres} onChange={zet("adres")} maxLength={160} placeholder="Straat 1, 1234 AB" />
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
        <Veld label="KVK-nummer">
          <input className="field-input" value={v.kvk} onChange={zet("kvk")} maxLength={20} inputMode="numeric" />
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
