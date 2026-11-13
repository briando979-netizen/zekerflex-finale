"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { apiUrl } from "@/components/studio/context";
import { IArrowRight, IExternal, IGrid, ILayout, IStore, Pill, btn } from "@/components/studio/ui";
import { zichtbareProducten } from "@/lib/sites/winkel";
import { MeerSites } from "@/components/studio/MeerSites";
import type { SiteDoc, SiteSoort } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// /studio: "Wat wil je doen?" De twee producten van ZekerFlex Sites naast
// elkaar: Website bouwen en Webshop openen, elk met de stand en één knop.
// Elke studio heeft de wisselaar naar de andere dashboards van het bedrijf.
// ---------------------------------------------------------------------------

interface Stand {
  site: SiteDoc | null;
  address: string | null;
}

export default function Kiezer() {
  const [stand, setStand] = useState<Record<SiteSoort, Stand | null | "fout">>({ website: null, webshop: null });
  const [nieuweBestellingen, setNieuweBestellingen] = useState<number | null>(null);
  useEffect(() => {
    for (const soort of ["website", "webshop"] as const) {
      void fetch(apiUrl(soort), { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Stand>) : Promise.reject(new Error("niet ok"))))
        .then((d) => setStand((s) => ({ ...s, [soort]: { site: d.site, address: d.address } })))
        .catch(() => setStand((s) => ({ ...s, [soort]: "fout" })));
    }
    void fetch("/api/werkgever/sites/bestellingen", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { bestellingen: { status: string }[] } | null) => setNieuweBestellingen(d ? d.bestellingen.filter((b) => b.status === "nieuw").length : null))
      .catch(() => undefined);
  }, []);

  const web = stand.website;
  const shop = stand.webshop;
  return (
    <div className="min-h-dvh bg-[#f1f1f1] text-[#303030]">
      <header className="flex h-14 items-center gap-3 bg-[#1a1a1a] px-3 text-white sm:px-4">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-sm font-black text-[#1a1a1a]">Z</span>
        <span className="font-semibold tracking-tight">ZekerFlex Sites</span>
        {/* geen "terug naar ZekerFlex": /werkgever stuurt wie het dashboard website of webshop open heeft
            meteen terug naar de studio. Naar een ander dashboard wissel je in de studio zelf. */}
      </header>
      <main className="mx-auto max-w-[980px] px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-2xl font-bold tracking-tight text-[#1a1a1a] sm:text-3xl">Wat wil je doen?</h1>
        <p className="mt-2 max-w-xl text-sm text-[#616161]">Een website en een webshop zijn twee aparte werkruimtes, elk met hun eigen menu. Je kunt ze allebei hebben of er één kiezen.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Kaart
            soort="website"
            icoon={<ILayout width={26} height={26} />}
            titel="Website bouwen"
            tekst="Een eigen website voor je bedrijf: pagina's, foto's, contactformulier, reserveren en je eigen domeinnaam."
            stand={web}
            knop={{ nieuw: "Website bouwen", bestaand: "Open website" }}
            cijfers={(s) => [`${s.pages.length} ${s.pages.length === 1 ? "pagina" : "pagina's"}`, `${s.media.length} ${s.media.length === 1 ? "foto" : "foto's"}`]}
          />
          <Kaart
            soort="webshop"
            icoon={<IStore width={26} height={26} />}
            titel="Webshop openen"
            tekst="Een eigen webwinkel met producten, bestellingen, klanten, kortingen en verzending, alles op één plek."
            stand={shop}
            knop={{ nieuw: "Webshop openen", bestaand: "Open webshop" }}
            cijfers={(s) => {
              const n = s.winkel ? zichtbareProducten(s.winkel).length : 0;
              return [`${n} ${n === 1 ? "product" : "producten"} online`, ...(nieuweBestellingen ? [`${nieuweBestellingen} nieuwe ${nieuweBestellingen === 1 ? "bestelling" : "bestellingen"}`] : [])];
            }}
          />
        </div>
        {/* al je sites op een rij, en nog een site maken (verschijnt pas als er al een site is) */}
        <MeerSites />
        <section aria-labelledby="kies-ontwerpen" className="mt-4 flex flex-wrap items-center gap-4 rounded-3xl border border-[#e3e3e3] bg-white p-6">
          <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-[#f1f1f1] text-[#303030]"><IGrid width={24} height={24} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="kies-ontwerpen" className="text-base font-bold tracking-tight text-[#1a1a1a]">Eerst de ontwerpen bekijken?</h2>
            <p className="mt-1 text-sm text-[#616161]">Elk ontwerp met een voorbeeld om rond te klikken. Kies er een om mee te beginnen, of wissel later van ontwerp.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/studio/website/ontwerpen" className={btn.secondary}>Ontwerpen voor een website</Link>
            <Link href="/studio/webshop/ontwerpen" className={btn.secondary}>Ontwerpen voor een webshop</Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function Kaart({
  soort,
  icoon,
  titel,
  tekst,
  stand,
  knop,
  cijfers,
}: {
  soort: SiteSoort;
  icoon: ReactNode;
  titel: string;
  tekst: string;
  stand: Stand | null | "fout";
  knop: { nieuw: string; bestaand: string };
  cijfers: (s: SiteDoc) => string[];
}) {
  const site = stand && stand !== "fout" ? stand.site : null;
  const adres = stand && stand !== "fout" ? stand.address : null;
  const live = Boolean(site?.liveBuild);
  return (
    <section aria-labelledby={`kies-${soort}`} className="flex flex-col rounded-3xl border border-[#e3e3e3] bg-white p-6 shadow-[0_1px_0_rgba(0,0,0,.05),0_1px_3px_rgba(0,0,0,.04)]">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#1a1a1a] text-white">{icoon}</span>
        {stand === null ? (
          <span className="h-6 w-20 animate-pulse rounded-lg bg-[#f1f1f1]" aria-hidden />
        ) : stand === "fout" ? null : !site ? (
          <Pill>Nog niet gemaakt</Pill>
        ) : live ? (
          <Pill tone="ok">Online</Pill>
        ) : (
          <Pill tone="warn">Concept</Pill>
        )}
      </div>
      <h2 id={`kies-${soort}`} className="mt-5 text-xl font-bold tracking-tight text-[#1a1a1a]">{titel}</h2>
      <p className="mt-1.5 text-sm text-[#616161]">{tekst}</p>
      {stand === "fout" ? (
        <p role="alert" className="mt-4 rounded-xl bg-[#fed1d7] px-3 py-2 text-sm text-[#8e0b21]">De stand kon niet laden. Je kunt de werkruimte wel openen.</p>
      ) : site ? (
        <div className="mt-4 text-sm">
          <p className="truncate font-semibold text-[#1a1a1a]">{site.bedrijf.naam}</p>
          {live && adres && (
            <a href={adres} target="_blank" rel="noopener" className="inline-flex max-w-full items-center gap-1 truncate text-[#005bd3] hover:underline">
              <span className="truncate">{adres.replace(/^https?:\/\//, "")}</span> <IExternal width={13} height={13} />
            </a>
          )}
          <p className="mt-1 text-[#707070]">{cijfers(site).join(" · ")}</p>
        </div>
      ) : null}
      <div className="mt-auto pt-6">
        <Link href={`/studio/${soort}`} className={`${btn.primary} w-full sm:w-auto`}>
          {site ? knop.bestaand : knop.nieuw} <IArrowRight width={16} height={16} />
        </Link>
      </div>
    </section>
  );
}
