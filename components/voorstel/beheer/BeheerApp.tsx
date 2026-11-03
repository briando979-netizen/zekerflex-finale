"use client";

import { useEffect, useMemo, useState } from "react";
import { BEHEER_API, KAART, dagNaam, useBeheerData } from "@/components/voorstel/beheer/api";
import { Reserveringen, type BeheerBoeking } from "@/components/voorstel/beheer/Reserveringen";
import { Aankondiging, Activiteiten, Openingstijden } from "@/components/voorstel/beheer/Instellingen";
import { Paginas } from "@/components/voorstel/beheer/Paginas";
import { Accounts } from "@/components/voorstel/beheer/Accounts";

// De beheeromgeving van Het Schwarzwald: tabbladen voor alles wat het
// personeel zelf regelt. Het gekozen tabblad staat in de adresbalk (#tab).

const TABS = [
  ["overzicht", "Overzicht"],
  ["reserveringen", "Reserveringen"],
  ["activiteiten", "Activiteiten"],
  ["openingstijden", "Openingstijden"],
  ["paginas", "Pagina's"],
  ["accounts", "Accounts"],
  ["instellingen", "Instellingen"],
] as const;
type Tab = (typeof TABS)[number][0];

function Overzicht({ namen, vandaag, naar }: { namen: Record<string, string>; vandaag: string; naar: (t: Tab) => void }) {
  const { data, fout } = useBeheerData<{ boekingen: BeheerBoeking[] }>(BEHEER_API);
  const cijfers = useMemo(() => {
    const geldig = (data?.boekingen ?? []).filter((b) => b.status !== "geannuleerd");
    const week = new Date(`${vandaag}T00:00:00Z`);
    week.setUTCDate(week.getUTCDate() + 7);
    const weekTot = week.toISOString().slice(0, 10);
    const dezeWeek = geldig.filter((b) => b.datum >= vandaag && b.datum < weekTot);
    return {
      vandaag: geldig.filter((b) => b.datum === vandaag),
      dezeWeek,
      teBevestigen: (data?.boekingen ?? []).filter((b) => b.status === "nieuw" && b.datum >= vandaag),
      omzet: dezeWeek.reduce((s, b) => s + (b.prijs ?? 0), 0),
      komend: geldig.filter((b) => b.datum >= vandaag).slice(0, 6),
    };
  }, [data, vandaag]);

  const tegels = [
    ["Gasten vandaag", cijfers.vandaag.reduce((s, b) => s + b.personen, 0)],
    ["Reserveringen komende 7 dagen", cijfers.dezeWeek.length],
    ["Te bevestigen", cijfers.teBevestigen.length],
    ["Omzetindicatie 7 dagen", `€ ${cijfers.omzet.toLocaleString("nl-NL")}`],
  ] as const;

  return (
    <div className="space-y-6">
      {fout && <p className="text-sm text-[#B91C1C]">{fout}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tegels.map(([k, v]) => (
          <div key={k} className={KAART}>
            <p className="text-sm text-schw-mute">{k}</p>
            <p className="mt-1 font-display text-3xl font-bold">{data ? v : "–"}</p>
          </div>
        ))}
      </div>
      <div className={KAART}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold">Eerstvolgende reserveringen</h3>
          <button type="button" onClick={() => naar("reserveringen")} className="text-sm font-semibold underline decoration-schw-orange decoration-2 underline-offset-4">
            Alle reserveringen
          </button>
        </div>
        {data && cijfers.komend.length === 0 && <p className="mt-3 text-schw-mute">Nog niets gepland.</p>}
        <ul className="mt-3 divide-y divide-schw-night/5">
          {cijfers.komend.map((b) => (
            <li key={`${b.datum}-${b.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span>
                <strong className="first-letter:uppercase">{dagNaam(b.datum, { weekday: "short", day: "numeric", month: "short" })}</strong> {b.tijd} · {namen[b.activiteit] ?? b.activiteit} · {b.personen} pers.
              </span>
              <span className="text-schw-mute">
                {b.naam}
                {b.status === "nieuw" && <span className="ml-2 rounded-full bg-schw-sun px-2 py-0.5 text-xs font-bold text-schw-night">nieuw</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["activiteiten", "Prijzen en capaciteit aanpassen"],
            ["openingstijden", "Openingstijden en gesloten dagen"],
            ["paginas", "Teksten op de site wijzigen"],
          ] as const
        ).map(([t, label]) => (
          <button key={t} type="button" onClick={() => naar(t)} className={`${KAART} text-left font-semibold hover:ring-2 hover:ring-schw-orange`}>
            {label} →
          </button>
        ))}
      </div>
    </div>
  );
}

export function BeheerApp({ namen, vandaag, wie }: { namen: Record<string, string>; vandaag: string; wie: string }) {
  const [tab, setTab] = useState<Tab>("overzicht");

  useEffect(() => {
    const lees = () => {
      const h = window.location.hash.slice(1);
      if (TABS.some(([k]) => k === h)) setTab(h as Tab);
    };
    lees();
    window.addEventListener("hashchange", lees);
    return () => window.removeEventListener("hashchange", lees);
  }, []);

  const naar = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", `#${t}`);
  };

  return (
    <div>
      <p className="text-sm text-schw-mute">Ingelogd als {wie}</p>
      <div role="tablist" aria-label="Beheer" className="-mx-4 mt-3 flex gap-1 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            aria-controls={`paneel-${k}`}
            onClick={() => naar(k)}
            className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${tab === k ? "bg-schw-night text-schw-cream" : "bg-white ring-1 ring-schw-night/10 hover:ring-schw-night/30"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div id={`paneel-${tab}`} role="tabpanel" className="mt-6">
        {tab === "overzicht" && <Overzicht namen={namen} vandaag={vandaag} naar={naar} />}
        {tab === "reserveringen" && <Reserveringen namen={namen} vandaag={vandaag} />}
        {tab === "activiteiten" && <Activiteiten namen={namen} />}
        {tab === "openingstijden" && <Openingstijden />}
        {tab === "paginas" && <Paginas />}
        {tab === "accounts" && <Accounts />}
        {tab === "instellingen" && <Aankondiging />}
      </div>
    </div>
  );
}
